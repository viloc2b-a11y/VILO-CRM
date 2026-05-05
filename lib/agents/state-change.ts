import { logAgentExecution } from "@/lib/agents/execution-log";
import { isAgentEnabled, isRecordAutomationPaused } from "@/lib/agents/guard";
import {
  orchestratorStateChangeSchema,
  type OrchestratorStateChangeInput,
} from "@/lib/agents/schemas/state-change";
import { serviceClient } from "@/lib/supabase/service-role";
import type { ActionItemPriority, BuEnum, InsertActionItem } from "@/lib/supabase/types";

export type OrchestratorStateChange = OrchestratorStateChangeInput;

type Candidate = {
  row: Omit<InsertActionItem, "id" | "created_at" | "updated_at">;
  source: string;
};

function strEquals(a: unknown, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

/** ¿Ya hay un ítem abierto con este `source` para el mismo registro? */
async function orchestratorOpenExists(recordId: string, source: string): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("action_items")
    .select("id")
    .eq("record_id", recordId)
    .eq("source", source)
    .in("status", ["pending", "in_progress"])
    .limit(1);

  if (error) {
    console.warn("[orchestrator] open exists check", error.message);
    return true;
  }
  return (data?.length ?? 0) > 0;
}

async function buildCandidate(change: OrchestratorStateChange): Promise<Candidate | null> {
  if (change.table === "patient_leads") {
    const stage = change.changes.current_stage ?? change.changes.status;
    if (!strEquals(stage, "New Lead")) return null;

    const { data: row } = await serviceClient
      .from("patient_leads")
      .select("full_name, source_campaign, preferred_contact_channel")
      .eq("id", change.recordId)
      .maybeSingle();

    const name = (row?.full_name as string) ?? "Paciente";
    const sourceKey = "orchestrator:app:vitalis_new_lead";
    return {
      source: sourceKey,
      row: {
        business_unit: "vitalis" satisfies BuEnum,
        record_type: "patient",
        record_id: change.recordId,
        title: `Contactar paciente: ${name}`,
        status: "pending",
        next_action: "Contacto urgente (<2h objetivo)",
        due_date: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        owner_id: null,
        assigned_to: null,
        priority: "critical" satisfies ActionItemPriority,
        value_usd: null,
        notes: null,
        source: sourceKey,
      },
    };
  }

  if (change.table === "vilo_opportunities") {
    const stage = change.changes.status ?? change.changes.stage;
    if (!strEquals(stage, "Negotiation")) return null;

    const sourceKey = "orchestrator:app:vilo_proposal";
    return {
      source: sourceKey,
      row: {
        business_unit: "vilo_research" satisfies BuEnum,
        record_type: "opportunity",
        record_id: change.recordId,
        title: "Enviar / revisar propuesta formal",
        status: "pending",
        next_action: "Preparar envío de propuesta (etapa Negociación)",
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        owner_id: null,
        assigned_to: null,
        priority: "high" satisfies ActionItemPriority,
        value_usd: null,
        notes: null,
        source: sourceKey,
      },
    };
  }

  if (change.table === "submissions") {
    if (!strEquals(change.changes.payment_status, "failed")) return null;

    const sourceKey = "orchestrator:app:hazlo_payment_recovery";
    return {
      source: sourceKey,
      row: {
        business_unit: "hazloasiya" satisfies BuEnum,
        record_type: "submission",
        record_id: change.recordId,
        title: "Recuperar pago fallido",
        status: "pending",
        next_action: "Resolver pago con el usuario",
        due_date: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        owner_id: null,
        assigned_to: null,
        priority: "high" satisfies ActionItemPriority,
        value_usd: null,
        notes: null,
        source: sourceKey,
      },
    };
  }

  return null;
}

export type HandleStateChangeResult = {
  ok: boolean;
  taskCreated: boolean;
  skipped?: "agent_disabled" | "record_paused" | "no_rule" | "already_open";
  source?: string;
};

/**
 * Orchestrator vía TypeScript: crea `action_items` idempotentes (misma semántica que el snippet,
 * adaptado al esquema VILO). Usa **service role** para no depender de la sesión.
 *
 * Nota: en BD ya existe `orchestrator_on_change` (23_orchestrator_agent.sql); evita llamar esto
 * para los mismos eventos si no quieres duplicar tareas, o usa `source` distintos como aquí.
 */
export async function handleStateChange(
  change: OrchestratorStateChange,
  options?: { validate?: boolean },
): Promise<HandleStateChangeResult> {
  const t0 = Date.now();
  const triggerEvent = `${change.table}:${change.recordId}`;

  const parsed =
    options?.validate === false
      ? { success: true as const, data: change }
      : orchestratorStateChangeSchema.safeParse(change);

  if (!parsed.success) {
    await logAgentExecution({
      agent_name: "orchestrator",
      trigger_event: triggerEvent,
      input_data: change,
      output_data: { validation: parsed.error.flatten() },
      status: "failed",
      execution_time_ms: Date.now() - t0,
      error_message: "Invalid state change payload",
    });
    throw new Error(`handleStateChange: ${parsed.error.message}`);
  }

  const c = parsed.data;

  try {
    if (!(await isAgentEnabled("orchestrator"))) {
      await logAgentExecution({
        agent_name: "orchestrator",
        trigger_event: triggerEvent,
        input_data: { table: c.table, changes: c.changes },
        output_data: { skipped: "agent_disabled" },
        status: "success",
        execution_time_ms: Date.now() - t0,
      });
      return { ok: true, taskCreated: false, skipped: "agent_disabled" };
    }

    if (await isRecordAutomationPaused(c.table, c.recordId)) {
      await logAgentExecution({
        agent_name: "orchestrator",
        trigger_event: triggerEvent,
        input_data: { table: c.table, changes: c.changes },
        output_data: { skipped: "record_paused" },
        status: "success",
        execution_time_ms: Date.now() - t0,
      });
      return { ok: true, taskCreated: false, skipped: "record_paused" };
    }

    const candidate = await buildCandidate(c);
    if (!candidate) {
      await logAgentExecution({
        agent_name: "orchestrator",
        trigger_event: triggerEvent,
        input_data: { table: c.table, changes: c.changes, oldValues: c.oldValues },
        output_data: { task_created: false, reason: "no_rule" },
        status: "success",
        execution_time_ms: Date.now() - t0,
      });
      return { ok: true, taskCreated: false, skipped: "no_rule" };
    }

    if (await orchestratorOpenExists(c.recordId, candidate.source)) {
      await logAgentExecution({
        agent_name: "orchestrator",
        trigger_event: triggerEvent,
        input_data: { table: c.table, changes: c.changes },
        output_data: { task_created: false, reason: "already_open", source: candidate.source },
        status: "success",
        execution_time_ms: Date.now() - t0,
      });
      return { ok: true, taskCreated: false, skipped: "already_open", source: candidate.source };
    }

    const { error } = await serviceClient.from("action_items").insert(candidate.row);
    if (error) throw new Error(error.message);

    await logAgentExecution({
      agent_name: "orchestrator",
      trigger_event: triggerEvent,
      input_data: { table: c.table, changes: c.changes, oldValues: c.oldValues },
      output_data: { task_created: true, source: candidate.source },
      status: "success",
      execution_time_ms: Date.now() - t0,
    });

    return { ok: true, taskCreated: true, source: candidate.source };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAgentExecution({
      agent_name: "orchestrator",
      trigger_event: triggerEvent,
      input_data: { table: c.table, changes: c.changes, oldValues: c.oldValues },
      output_data: null,
      status: "failed",
      execution_time_ms: Date.now() - t0,
      error_message: msg,
    });
    throw err;
  }
}
