import {
  sendChurnSurveyEmail,
  sendRecoveryDay2WhatsApp,
  sendRecoveryDay5Call,
  sendRecoveryDay7Email,
  sendRecoveryNetworkBumpEmail,
} from "@/lib/hazlo/recovery/notify";
import { hazloWhatsAppTemplatesEnabled } from "@/lib/hazlo/whatsapp-templates";
import { parseRecoveryState } from "@/lib/hazlo/recovery/state";
import type { PaymentFailureCategory, PaymentRecoveryState } from "@/lib/hazlo/recovery/types";
import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";

type SubmissionRecoveryRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  funnel_type: string;
  completion_status: string;
  payment_status: string | null;
  payment_failed_at: string | null;
  payment_recovery_state: Json;
};

function fullDaysSince(failedAtIso: string, now: Date): number {
  const t0 = new Date(failedAtIso).getTime();
  return Math.floor((now.getTime() - t0) / 86400000);
}

async function patchRecoveryState(submissionId: string, fn: (s: PaymentRecoveryState) => PaymentRecoveryState) {
  const { data: row } = await serviceClient
    .from("submissions")
    .select("payment_recovery_state")
    .eq("id", submissionId)
    .maybeSingle();
  const cur = parseRecoveryState(row?.payment_recovery_state);
  const next = fn(cur);
  await serviceClient
    .from("submissions")
    .update({ payment_recovery_state: next as unknown as Json })
    .eq("id", submissionId);
}

async function markCanceled(submissionId: string, name: string, email: string | null): Promise<void> {
  const now = new Date().toISOString();
  const { data: row } = await serviceClient
    .from("submissions")
    .select("payment_recovery_state")
    .eq("id", submissionId)
    .maybeSingle();
  const cur = parseRecoveryState(row?.payment_recovery_state);
  const next: PaymentRecoveryState = {
    ...cur,
    metrics: { ...cur.metrics, canceled_at: now },
    sent: { ...cur.sent, canceled_survey: now },
  };

  await serviceClient
    .from("submissions")
    .update({
      completion_status: "Canceled",
      payment_recovery_state: next as unknown as Json,
    })
    .eq("id", submissionId)
    .eq("payment_status", "failed");

  await sendChurnSurveyEmail({ name, email, submissionId });
}

/**
 * Secuencia día 2 / 5 / 7 y cierre día 8+. Idempotente vía `payment_recovery_state.sent`.
 */
export async function processRecoverySteps(row: SubmissionRecoveryRow, now: Date): Promise<string[]> {
  const log: string[] = [];
  if (row.completion_status === "Canceled") return log;
  if (row.payment_status !== "failed" || !row.payment_failed_at) return log;

  const state = parseRecoveryState(row.payment_recovery_state);
  const sent = state.sent ?? {};
  const category: PaymentFailureCategory = state.category ?? "unknown";
  const days = fullDaysSince(row.payment_failed_at, now);

  if (days >= 8) {
    if (!sent.canceled_survey) {
      await markCanceled(row.id, row.name, row.email);
      log.push(`canceled:${row.id}`);
    }
    return log;
  }

  if (
    category === "network_error" &&
    state.network_bump_after &&
    !sent.network_bump &&
    now.getTime() >= new Date(state.network_bump_after).getTime()
  ) {
    await sendRecoveryNetworkBumpEmail({
      name: row.name,
      email: row.email,
      submissionId: row.id,
    });
    await patchRecoveryState(row.id, (s) => ({
      ...s,
      sent: { ...s.sent, network_bump: now.toISOString() },
    }));
    log.push(`network_bump:${row.id}`);
    return log;
  }

  if (!sent.d0_email) {
    const { sendRecoveryDay0Email } = await import("@/lib/hazlo/recovery/notify");
    await sendRecoveryDay0Email({
      name: row.name,
      email: row.email,
      submissionId: row.id,
      category,
    });
    await patchRecoveryState(row.id, (s) => ({
      ...s,
      sent: { ...s.sent, d0_email: now.toISOString() },
    }));
    log.push(`d0_catchup:${row.id}`);
    return log;
  }

  if (days >= 2 && !sent.d2_whatsapp) {
    const phone = row.phone?.trim();
    const attempt = state.whatsapp_recovery_attempts ?? 1;
    const d2 = await sendRecoveryDay2WhatsApp({
      name: row.name,
      phone: row.phone,
      submissionId: row.id,
      category,
      funnelType: row.funnel_type,
      whatsappAttempt: attempt,
    });

    await patchRecoveryState(row.id, (s) => ({
      ...s,
      sent: { ...s.sent, d2_whatsapp: now.toISOString() },
      ...(phone && hazloWhatsAppTemplatesEnabled()
        ? {
            channel: d2.templateSent ? "whatsapp" : "failed",
            next_action: d2.templateSent
              ? "Esperar respuesta 24h"
              : "Reintentar o escalar a email",
            whatsapp_recovery_attempts: d2.templateSent ? attempt + 1 : attempt,
          }
        : {}),
    }));
    log.push(`d2_wa:${row.id}`);
    return log;
  }

  if (days >= 5 && !sent.d5_call && category !== "fraud_block") {
    const ok = await sendRecoveryDay5Call(row.phone);
    await patchRecoveryState(row.id, (s) => ({
      ...s,
      sent: { ...s.sent, d5_call: now.toISOString() },
    }));
    log.push(ok ? `d5_call:${row.id}` : `d5_call_skipped:${row.id}`);
    return log;
  }

  if (days >= 7 && !sent.d7_email) {
    await sendRecoveryDay7Email({
      name: row.name,
      email: row.email,
      submissionId: row.id,
    });
    await patchRecoveryState(row.id, (s) => ({
      ...s,
      sent: { ...s.sent, d7_email: now.toISOString() },
    }));
    log.push(`d7_email:${row.id}`);
    return log;
  }

  return log;
}

export async function runHazloRecoveryTick(limit = 25): Promise<{
  ok: boolean;
  events: string[];
  errors: string[];
}> {
  const events: string[] = [];
  const errors: string[] = [];
  const now = new Date();

  const { data: rows, error } = await serviceClient
    .from("submissions")
    .select(
      "id, name, email, phone, funnel_type, completion_status, payment_status, payment_failed_at, payment_recovery_state"
    )
    .eq("archived", false)
    .eq("payment_status", "failed")
    .neq("completion_status", "Canceled")
    .not("payment_failed_at", "is", null)
    .limit(limit);

  if (error) {
    return { ok: false, events, errors: [error.message] };
  }

  for (const r of rows ?? []) {
    try {
      const ev = await processRecoverySteps(r as SubmissionRecoveryRow, now);
      events.push(...ev);
    } catch (e) {
      errors.push(`${(r as SubmissionRecoveryRow).id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: errors.length === 0 || events.length > 0, events, errors };
}
