import { classifySquareFailure } from "@/lib/hazlo/recovery/classify";
import {
  sendPaymentCelebrationEmail,
  sendRecoveryDay0Email,
} from "@/lib/hazlo/recovery/notify";
import { parseRecoveryState } from "@/lib/hazlo/recovery/state";
import type { PaymentFailureCategory, PaymentRecoveryState } from "@/lib/hazlo/recovery/types";
import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";

/** Subconjunto del objeto Payment de Square suficiente para Recovery. */
export type SquarePaymentPayload = {
  id: string;
  status?: string;
  reference_id?: string | null;
  customer_id?: string | null;
  card_details?: {
    status?: string;
    errors?: { code?: string; detail?: string }[];
  };
};

const FRAUD_TASK_SOURCE = "hazlo:recovery:fraud";

async function ensureFraudSupportTask(submissionId: string, name: string): Promise<void> {
  const { data: existing } = await serviceClient
    .from("action_items")
    .select("id")
    .eq("record_id", submissionId)
    .eq("record_type", "submission")
    .eq("source", FRAUD_TASK_SOURCE)
    .maybeSingle();
  if (existing) return;

  await serviceClient.from("action_items").insert({
    business_unit: "hazloasiya",
    record_type: "submission",
    record_id: submissionId,
    title: `Soporte — posible fraude/bloqueo: ${name}`,
    status: "pending",
    next_action: "Contactar al cliente; revisar motivo de declinación en Square",
    due_date: new Date(Date.now() + 4 * 3600000).toISOString(),
    priority: "high",
    source: FRAUD_TASK_SOURCE,
    notes: "Recovery Agent — categoría fraud_block (Square)",
  });
}

function mergeRecoveryOnFailure(params: {
  category: PaymentFailureCategory;
  now: Date;
  existing: PaymentRecoveryState;
}): PaymentRecoveryState {
  const { category, now, existing } = params;
  const sent = { ...existing.sent };
  if (!sent.d0_email) {
    sent.d0_email = now.toISOString();
  }
  const next: PaymentRecoveryState = {
    ...existing,
    category,
    sent,
    metrics: {
      ...existing.metrics,
      recovery_started_at: existing.metrics?.recovery_started_at ?? now.toISOString(),
    },
  };

  if (category === "network_error") {
    next.network_bump_after = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  } else {
    delete next.network_bump_after;
  }

  if (category === "insufficient_funds") {
    next.suggested_charge_retry_at = new Date(now.getTime() + 3 * 86400000).toISOString();
  } else {
    delete next.suggested_charge_retry_at;
  }

  return next;
}

function squareDeclineCode(payment: SquarePaymentPayload): string | null {
  const errs = payment.card_details?.errors;
  const first = errs?.[0];
  if (first?.code) return first.code;
  const st = payment.card_details?.status;
  if (st && st !== "AUTHORIZED" && st !== "CAPTURED") return st;
  return null;
}

export function extractSquarePaymentFromWebhook(body: unknown): SquarePaymentPayload | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;
  const obj = data?.object as Record<string, unknown> | undefined;
  if (!obj) return null;
  const payment = (obj.payment ?? obj) as SquarePaymentPayload | undefined;
  if (!payment?.id) return null;
  return payment;
}

export function squareWebhookEventMeta(body: unknown): { eventId: string; type: string } {
  if (!body || typeof body !== "object") return { eventId: "", type: "" };
  const root = body as Record<string, unknown>;
  return {
    eventId: typeof root.event_id === "string" ? root.event_id : "",
    type: typeof root.type === "string" ? root.type : "",
  };
}

/** Estados finales útiles para Recovery / celebración. */
function isSquarePaymentFailed(status: string): boolean {
  const s = status.toUpperCase();
  return s === "FAILED" || s === "CANCELED";
}

function isSquarePaymentCompleted(status: string): boolean {
  return status.toUpperCase() === "COMPLETED";
}

export async function handleSquarePaymentFailed(
  payment: SquarePaymentPayload,
): Promise<{ ok: boolean; detail?: string }> {
  const submissionId = payment.reference_id?.trim();
  if (!submissionId) {
    return { ok: true, detail: "no_reference_id_submission_uuid" };
  }

  const code = squareDeclineCode(payment);
  const category = classifySquareFailure(code);
  const now = new Date();

  const { data: row, error: fetchErr } = await serviceClient
    .from("submissions")
    .select(
      "id, name, email, phone, completion_status, payment_status, payment_failed_at, payment_recovery_state",
    )
    .eq("id", submissionId)
    .eq("archived", false)
    .maybeSingle();

  if (fetchErr) return { ok: false, detail: fetchErr.message };
  if (!row) return { ok: false, detail: "submission_not_found" };

  if (row.completion_status === "Paid" || row.payment_status === "paid") {
    return { ok: true, detail: "already_paid" };
  }

  const existing = parseRecoveryState(row.payment_recovery_state as Json);
  const shouldSendD0 = !existing.sent?.d0_email;

  const recovery = mergeRecoveryOnFailure({
    category,
    now,
    existing,
  });

  const errMsg =
    payment.card_details?.errors?.map((e) => e.detail ?? e.code).filter(Boolean).join("; ") ?? null;

  const { error: upErr } = await serviceClient
    .from("submissions")
    .update({
      square_payment_id: payment.id,
      square_customer_id: payment.customer_id ?? null,
      square_last_error_code: code,
      square_last_error_message: errMsg,
      payment_status: "failed",
      completion_status:
        row.completion_status === "Canceled" ? row.completion_status : "Payment attempted",
      payment_failed_at: row.payment_failed_at ?? now.toISOString(),
      payment_recovery_state: recovery as unknown as Json,
    })
    .eq("id", submissionId);

  if (upErr) return { ok: false, detail: upErr.message };

  if (shouldSendD0) {
    await sendRecoveryDay0Email({
      name: row.name,
      email: row.email,
      submissionId,
      category,
    });
  }

  if (category === "fraud_block") {
    await ensureFraudSupportTask(submissionId, row.name);
  }

  return { ok: true };
}

export async function handleSquarePaymentCompleted(
  payment: SquarePaymentPayload,
): Promise<{ ok: boolean; detail?: string }> {
  const submissionId = payment.reference_id?.trim();
  if (!submissionId) {
    return { ok: true, detail: "no_reference_id_submission_uuid" };
  }

  const now = new Date().toISOString();
  const { data: row, error: fetchErr } = await serviceClient
    .from("submissions")
    .select("id, name, email, payment_recovery_state")
    .eq("id", submissionId)
    .eq("archived", false)
    .maybeSingle();

  if (fetchErr) return { ok: false, detail: fetchErr.message };
  if (!row) return { ok: false, detail: "submission_not_found" };

  const existing = parseRecoveryState(row.payment_recovery_state as Json);
  const recovery: PaymentRecoveryState = {
    ...existing,
    metrics: {
      ...existing.metrics,
      recovered_at: now,
    },
  };

  const { error: upErr } = await serviceClient
    .from("submissions")
    .update({
      payment_status: "paid",
      completion_status: "Paid",
      square_payment_id: payment.id,
      square_customer_id: payment.customer_id ?? null,
      square_last_error_code: null,
      square_last_error_message: null,
      payment_recovery_state: recovery as unknown as Json,
    })
    .eq("id", submissionId);

  if (upErr) return { ok: false, detail: upErr.message };

  await sendPaymentCelebrationEmail({ name: row.name, email: row.email });
  return { ok: true };
}

/**
 * Procesa `payment.created` / `payment.updated`: solo actúa en estados terminales.
 * Devuelve `handled: false` si el evento es intermedio (no insertar error; responder 200).
 */
export async function handleSquarePaymentWebhookEvent(
  payment: SquarePaymentPayload,
  eventType: string,
): Promise<{ ok: boolean; detail?: string; handled: boolean }> {
  const status = payment.status ?? "";
  if (isSquarePaymentCompleted(status)) {
    const r = await handleSquarePaymentCompleted(payment);
    return { ...r, handled: true };
  }
  if (isSquarePaymentFailed(status)) {
    const r = await handleSquarePaymentFailed(payment);
    return { ...r, handled: true };
  }
  return { ok: true, detail: `noop_status_${status || "empty"}_${eventType}`, handled: false };
}
