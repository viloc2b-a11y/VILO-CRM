import { classifyStripeFailure } from "@/lib/hazlo/recovery/classify";
import {
  sendPaymentCelebrationEmail,
  sendRecoveryDay0Email,
} from "@/lib/hazlo/recovery/notify";
import { parseRecoveryState } from "@/lib/hazlo/recovery/state";
import type { PaymentFailureCategory, PaymentRecoveryState } from "@/lib/hazlo/recovery/types";
import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";
import type Stripe from "stripe";

function stripeCustomerId(customer: Stripe.PaymentIntent["customer"]): string | null {
  if (customer == null) return null;
  if (typeof customer === "string") return customer;
  if (typeof customer === "object" && "deleted" in customer && customer.deleted) return null;
  if (typeof customer === "object" && "id" in customer) return (customer as { id: string }).id;
  return null;
}

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
    title: `Soporte — posible fraude/bloqueo bancario: ${name}`,
    status: "pending",
    next_action: "Contactar al cliente y al banco; revisar Stripe Radar",
    due_date: new Date(Date.now() + 4 * 3600000).toISOString(),
    priority: "high",
    source: FRAUD_TASK_SOURCE,
    notes: "Recovery Agent — categoría fraud_block",
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

export async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<{ ok: boolean; detail?: string }> {
  const submissionId = pi.metadata?.submission_id?.trim();
  if (!submissionId) {
    return { ok: true, detail: "no_submission_id_in_metadata" };
  }

  const code = pi.last_payment_error?.code ?? null;
  const category = classifyStripeFailure(code);
  const now = new Date();

  const { data: row, error: fetchErr } = await serviceClient
    .from("submissions")
    .select(
      "id, name, email, phone, completion_status, payment_status, payment_failed_at, payment_recovery_state"
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

  const { error: upErr } = await serviceClient
    .from("submissions")
    .update({
      stripe_payment_intent_id: pi.id,
      stripe_customer_id: stripeCustomerId(pi.customer),
      stripe_last_error_code: code,
      stripe_last_error_message: pi.last_payment_error?.message ?? null,
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

export async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<{ ok: boolean; detail?: string }> {
  const submissionId = pi.metadata?.submission_id?.trim();
  if (!submissionId) {
    return { ok: true, detail: "no_submission_id_in_metadata" };
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
      stripe_payment_intent_id: pi.id,
      stripe_customer_id: stripeCustomerId(pi.customer),
      stripe_last_error_code: null,
      stripe_last_error_message: null,
      payment_recovery_state: recovery as unknown as Json,
    })
    .eq("id", submissionId);

  if (upErr) return { ok: false, detail: upErr.message };

  await sendPaymentCelebrationEmail({ name: row.name, email: row.email });
  return { ok: true };
}
