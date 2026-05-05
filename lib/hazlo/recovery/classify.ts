import type { PaymentFailureCategory } from "@/lib/hazlo/recovery/types";

const INSUFFICIENT = new Set([
  "insufficient_funds",
  "withdrawal_count_limit_exceeded",
]);

const EXPIRED = new Set(["expired_card"]);

const FRAUD = new Set([
  "fraudulent",
  "stolen_card",
  "lost_card",
  "pickup_card",
  "security_violation",
  "transaction_not_allowed",
]);

const NETWORK = new Set([
  "processing_error",
  "reenter_transaction",
  "try_again_later",
  "issuer_not_available",
]);

/**
 * Mapea códigos de declinación Stripe → categoría Recovery Agent.
 * @see https://stripe.com/docs/declines/codes
 */
export function classifyStripeFailure(code: string | null | undefined): PaymentFailureCategory {
  const c = (code ?? "").toLowerCase().replace(/ /g, "_");
  if (!c) return "unknown";
  if (INSUFFICIENT.has(c)) return "insufficient_funds";
  if (EXPIRED.has(c)) return "card_expired";
  if (FRAUD.has(c)) return "fraud_block";
  if (NETWORK.has(c)) return "network_error";
  return "unknown";
}

/** Códigos típicos de error en `card_details.errors[].code` (Square). */
const SQUARE_INSUFFICIENT = new Set([
  "insufficient_funds",
  "insufficient_fund",
  "purchase_amount_exceeds_limit",
]);

const SQUARE_EXPIRED = new Set(["invalid_expiration", "expired_card", "card_expired"]);

const SQUARE_FRAUD = new Set([
  "pan_failure",
  "invalid_location",
  "transaction_limit",
  "voice_required",
  "allowable_pin_tries_exceeded",
]);

const SQUARE_NETWORK = new Set([
  "generic_decline",
  "temporarily_unavailable",
  "gateway_timeout",
  "processing_error",
]);

/**
 * Mapea códigos de declinación Square → misma taxonomía que Recovery Stripe.
 * @see https://developer.squareup.com/docs/payments-api/error-codes
 */
export function classifySquareFailure(code: string | null | undefined): PaymentFailureCategory {
  const c = (code ?? "").toLowerCase().replace(/ /g, "_");
  if (!c) return "unknown";
  if (SQUARE_INSUFFICIENT.has(c)) return "insufficient_funds";
  if (SQUARE_EXPIRED.has(c)) return "card_expired";
  if (SQUARE_FRAUD.has(c)) return "fraud_block";
  if (SQUARE_NETWORK.has(c)) return "network_error";
  if (INSUFFICIENT.has(c) || EXPIRED.has(c) || FRAUD.has(c) || NETWORK.has(c)) {
    return classifyStripeFailure(c);
  }
  return "unknown";
}
