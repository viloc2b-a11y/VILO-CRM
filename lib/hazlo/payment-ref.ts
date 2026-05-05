import type { Submission } from "@/lib/supabase/types";

export type HazloPaymentProvider = "square" | "stripe";

export type SubmissionPaymentRef =
  | { paymentId: string; provider: HazloPaymentProvider }
  | { paymentId: null; provider: null };

/**
 * ID de pago en el proveedor (Square tiene prioridad si hay ambos).
 * Stripe en DB: `stripe_payment_intent_id` (PaymentIntent id).
 * La recuperación (emails, `payment_recovery_state`, etc.) no depende del proveedor.
 */
export function getSubmissionPaymentRef(
  submission: Pick<Submission, "square_payment_id" | "stripe_payment_intent_id">,
): SubmissionPaymentRef {
  const square = submission.square_payment_id?.trim();
  if (square) {
    return { paymentId: square, provider: "square" };
  }
  const stripe = submission.stripe_payment_intent_id?.trim();
  if (stripe) {
    return { paymentId: stripe, provider: "stripe" };
  }
  return { paymentId: null, provider: null };
}
