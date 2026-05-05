import { isAgentEnabled, logAgentExecution } from "@/lib/agents";
import { serviceClient } from "@/lib/supabase/service-role";
import type { ActionItem, ActionItemPriority, PatientLead, ViloOpportunity } from "@/lib/supabase/types";
import {
  priorityFromScore100,
  probabilidadFromVitalisStage,
  probabilidadFromViloStage,
  triageScore100,
  urgenciaPoints,
  valorPoints,
} from "@/lib/triage/score";

const ESCALATION_NOTE_TAG = "[Triage: vencida escalada]";
const BACKLOG_ALERT_COOLDOWN_MS = 4 * 3600_000;
const OPEN_STATUSES = ["pending", "in_progress"] as const;

type TriageStateRow = {
  id: string;
  last_triage_at: string;
  last_critical_backlog_alert_at: string | null;
};

function effectiveValueUsd(
  row: Pick<ActionItem, "value_usd" | "record_type" | "record_id">,
  oppById: Map<string, Pick<ViloOpportunity, "potential_value">>,
): number | null {
  if (row.value_usd != null) {
    const n = Number(row.value_usd);
    if (!Number.isNaN(n)) return n;
  }
  if (row.record_type === "opportunity") {
    const o = oppById.get(row.record_id);
    if (o?.potential_value != null) return Number(o.potential_value);
  }
  return null;
}

function probabilidadForItem(
  row: Pick<ActionItem, "record_type" | "record_id">,
  oppById: Map<string, Pick<ViloOpportunity, "status">>,
  patientById: Map<string, Pick<PatientLead, "current_stage">>,
): number {
  if (row.record_type === "opportunity") {
    const o = oppById.get(row.record_id);
    return probabilidadFromViloStage(o?.status);
  }
  if (row.record_type === "patient") {
    const p = patientById.get(row.record_id);
    return probabilidadFromVitalisStage(p?.current_stage);
  }
  return 5;
}

async function loadState(): Promise<TriageStateRow> {
  const { data, error } = await serviceClient.from("triage_agent_state").select("*").eq("id", "default").maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data as TriageStateRow;

  const { data: inserted, error: insErr } = await serviceClient
    .from("triage_agent_state")
    .insert({ id: "default", last_triage_at: "1970-01-01T00:00:00+00" })
    .select("*")
    .single();

  if (insErr) throw new Error(insErr.message);
  return inserted as TriageStateRow;
}

async function persistState(partial: Partial<Pick<TriageStateRow, "last_triage_at" | "last_critical_backlog_alert_at">>) {
  const { error } = await serviceClient.from("triage_agent_state").update(partial).eq("id", "default");
  if (error) throw new Error(error.message);
}

async function fetchAdmins(): Promise<{ id: string; full_name: string }[]> {
  const { data, error } = await serviceClient.from("user_profiles").select("id, full_name").eq("role", "admin").eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; full_name: string }[];
}

async function logTriageActivity(
  admins: { id: string; full_name: string }[],
  action: string,
  entityType: string,
  entityId: string | null,
  entityLabel: string | null,
  metadata: Record<string, unknown>,
) {
  if (admins.length === 0) return;
  const primary = admins[0]!;
  const { error } = await serviceClient.from("activity_log").insert({
    user_id: primary.id,
    user_name: "Triage Agent (sistema)",
    action,
    entity_type: entityType,
    entity_id: entityId,
    entity_label: entityLabel,
    metadata: { ...metadata, manager_ids: admins.map((a) => a.id) },
  });
  if (error) console.error("[triage activity_log]", error);
}

/**
 * Re-prioriza action_items abiertas; alertas a admins; escalación de críticas vencidas.
 * Trigger vía cron: cada hora o si hay más de `burstThreshold` tareas nuevas desde la última corrida.
 */
async function runTriageAgentTickBody(options?: {
  burstThreshold?: number;
  minIntervalHours?: number;
}): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  updated: number;
  criticalOpen: number;
  backlogAlertSent: boolean;
  escalated: number;
  errors: string[];
}> {
  const burstThreshold = options?.burstThreshold ?? 5;
  const minIntervalHours = options?.minIntervalHours ?? 1;
  const errors: string[] = [];
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  let state: TriageStateRow;
  try {
    state = await loadState();
  } catch (e) {
    return {
      ok: false,
      updated: 0,
      criticalOpen: 0,
      backlogAlertSent: false,
      escalated: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }

  const lastMs = new Date(state.last_triage_at).getTime();
  const hourDiff = (nowMs - lastMs) / 3_600_000;

  const { count: newCount, error: cErr } = await serviceClient
    .from("action_items")
    .select("id", { count: "exact", head: true })
    .gt("created_at", state.last_triage_at);

  const nNew = cErr ? 0 : newCount ?? 0;

  if (hourDiff < minIntervalHours && nNew <= burstThreshold) {
    return {
      ok: true,
      skipped: true,
      reason: `wait: ${hourDiff.toFixed(2)}h < ${minIntervalHours}h and new_tasks=${nNew}<=${burstThreshold}`,
      updated: 0,
      criticalOpen: 0,
      backlogAlertSent: false,
      escalated: 0,
      errors: [],
    };
  }

  const { data: items, error: qErr } = await serviceClient
    .from("action_items")
    .select("id, record_type, record_id, priority, value_usd, due_date, status, notes, next_action, owner_id, assigned_to")
    .in("status", [...OPEN_STATUSES])
    .limit(1500);

  if (qErr) {
    return {
      ok: false,
      updated: 0,
      criticalOpen: 0,
      backlogAlertSent: false,
      escalated: 0,
      errors: [qErr.message],
    };
  }

  const list = (items ?? []) as ActionItem[];
  const oppIds = [...new Set(list.filter((r) => r.record_type === "opportunity").map((r) => r.record_id))];
  const patientIds = [...new Set(list.filter((r) => r.record_type === "patient").map((r) => r.record_id))];

  const oppById = new Map<string, Pick<ViloOpportunity, "status" | "potential_value">>();
  if (oppIds.length > 0) {
    const { data: opps, error: oErr } = await serviceClient
      .from("vilo_opportunities")
      .select("id, status, potential_value")
      .in("id", oppIds);
    if (oErr) errors.push(`opportunities: ${oErr.message}`);
    else for (const o of opps ?? []) oppById.set((o as ViloOpportunity).id, o as ViloOpportunity);
  }

  const patientById = new Map<string, Pick<PatientLead, "current_stage">>();
  if (patientIds.length > 0) {
    const { data: pts, error: pErr } = await serviceClient
      .from("patient_leads")
      .select("id, current_stage")
      .in("id", patientIds);
    if (pErr) errors.push(`patient_leads: ${pErr.message}`);
    else for (const p of pts ?? []) patientById.set((p as PatientLead).id, p as PatientLead);
  }

  let updated = 0;
  const chunk: { id: string; priority: ActionItemPriority }[] = [];

  for (const row of list) {
    const v = valorPoints(effectiveValueUsd(row, oppById));
    const u = urgenciaPoints(row.due_date, nowMs);
    const p = probabilidadForItem(row, oppById, patientById);
    const s100 = triageScore100(v, u, p);
    const nextP = priorityFromScore100(s100);
    if (nextP !== row.priority) {
      chunk.push({ id: row.id, priority: nextP });
    }
  }

  for (const u of chunk) {
    const { error: uErr } = await serviceClient.from("action_items").update({ priority: u.priority }).eq("id", u.id);
    if (uErr) errors.push(`${u.id}: ${uErr.message}`);
    else updated += 1;
  }

  const { data: criticalRows, error: crErr } = await serviceClient
    .from("action_items")
    .select("id")
    .in("status", [...OPEN_STATUSES])
    .eq("priority", "critical");

  const criticalOpen = crErr ? 0 : criticalRows?.length ?? 0;

  let backlogAlertSent = false;
  if (criticalOpen > 3) {
    const lastAlertMs = state.last_critical_backlog_alert_at
      ? new Date(state.last_critical_backlog_alert_at).getTime()
      : 0;
    if (nowMs - lastAlertMs >= BACKLOG_ALERT_COOLDOWN_MS) {
      try {
        const admins = await fetchAdmins();
        await logTriageActivity(admins, "triage_critical_backlog", "action_center", null, "Triage Agent", {
          open_critical_count: criticalOpen,
          message: "Más de 3 tareas críticas sin completar — revisar Action Center",
        });
        await persistState({ last_critical_backlog_alert_at: nowIso });
        backlogAlertSent = true;
      } catch (e) {
        errors.push(`backlog_alert: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  let escalated = 0;
  const { data: overdueCritical, error: ocErr } = await serviceClient
    .from("action_items")
    .select("id, notes, next_action, due_date")
    .in("status", [...OPEN_STATUSES])
    .eq("priority", "critical")
    .lt("due_date", nowIso);

  if (!ocErr && overdueCritical?.length) {
    try {
      const admins = await fetchAdmins();
      const escalatedIds: string[] = [];
      for (const row of overdueCritical as Pick<ActionItem, "id" | "notes" | "next_action" | "due_date">[]) {
        const notes = row.notes ?? "";
        if (notes.includes(ESCALATION_NOTE_TAG)) continue;

        const stamp = new Date(nowMs).toISOString();
        const prefix = `${ESCALATION_NOTE_TAG} ${stamp}\n`;
        const nextAction = row.next_action?.trim()
          ? `ESCALADA (vencida) — ${row.next_action}`
          : "ESCALADA (vencida) — requiere atención inmediata";

        const { error: upErr } = await serviceClient
          .from("action_items")
          .update({
            notes: prefix + notes,
            next_action: nextAction,
          })
          .eq("id", row.id);

        if (upErr) {
          errors.push(`escalate ${row.id}: ${upErr.message}`);
          continue;
        }
        escalated += 1;
        escalatedIds.push(row.id);
      }
      if (escalatedIds.length > 0) {
        await logTriageActivity(admins, "triage_critical_overdue", "action_center", null, "Triage Agent", {
          action_item_ids: escalatedIds,
          message: "Una o más tareas críticas vencidas — escaladas en Action Center",
        });
      }
    } catch (e) {
      errors.push(`escalation: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    await persistState({ last_triage_at: nowIso });
  } catch (e) {
    errors.push(`persist_state: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    ok: errors.length === 0,
    updated,
    criticalOpen,
    backlogAlertSent,
    escalated,
    errors,
  };
}

export type TriageTickResult = Awaited<ReturnType<typeof runTriageAgentTickBody>>;

/** Envoltorio: respeta `agent_automation_settings` y escribe `agent_execution_logs`. */
export async function runTriageAgentTick(options?: {
  burstThreshold?: number;
  minIntervalHours?: number;
}): Promise<TriageTickResult> {
  const t0 = Date.now();
  const inputSnapshot = {
    burstThreshold: options?.burstThreshold ?? 5,
    minIntervalHours: options?.minIntervalHours ?? 1,
  };

  if (!(await isAgentEnabled("triage"))) {
    const r: TriageTickResult = {
      ok: true,
      skipped: true,
      reason: "agent_disabled",
      updated: 0,
      criticalOpen: 0,
      backlogAlertSent: false,
      escalated: 0,
      errors: [],
    };
    await logAgentExecution({
      agent_name: "triage",
      trigger_event: "cron_tick",
      input_data: inputSnapshot,
      output_data: r,
      status: "success",
      execution_time_ms: Date.now() - t0,
    });
    return r;
  }

  try {
    const r = await runTriageAgentTickBody(options);
    const status =
      r.skipped === true
        ? "success"
        : r.ok && r.errors.length === 0
          ? "success"
          : r.ok
            ? "retry"
            : "failed";
    await logAgentExecution({
      agent_name: "triage",
      trigger_event: "cron_tick",
      input_data: inputSnapshot,
      output_data: r,
      status,
      execution_time_ms: Date.now() - t0,
      error_message: r.errors.length ? r.errors.join("; ").slice(0, 8000) : null,
    });
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logAgentExecution({
      agent_name: "triage",
      trigger_event: "cron_tick",
      input_data: inputSnapshot,
      output_data: null,
      status: "failed",
      execution_time_ms: Date.now() - t0,
      error_message: msg,
    });
    throw e;
  }
}
