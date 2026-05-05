/**
 * Recuperación de pagos fallidos (HazloAsíYa).
 *
 * El **tick de cron** es {@link runHazloRecoveryTick} (alias {@link runRecoveryTick}) en `run.ts` (expuesto en
 * `POST /api/hazlo/recovery/tick`). Usa **service role** (`serviceClient`), no
 * `createClient()` del servidor con cookies.
 *
 * Estado: `submissions.payment_recovery_state` (JSON con `sent`, `category`, etc.).
 * Contador de intentos WhatsApp: `payment_recovery_state.whatsapp_recovery_attempts` (no columna dedicada).
 * Contacto: `name`, `email`, `phone` en la fila `submissions`.
 */
export type { PaymentFailureCategory, PaymentRecoveryState } from "@/lib/hazlo/recovery/types";
export {
  getSubmissionPaymentRef,
  type HazloPaymentProvider,
  type SubmissionPaymentRef,
} from "@/lib/hazlo/payment-ref";
export { classifySquareFailure, classifyStripeFailure } from "@/lib/hazlo/recovery/classify";
export {
  runHazloRecoveryTick,
  runHazloRecoveryTick as runRecoveryTick,
  processRecoverySteps,
} from "@/lib/hazlo/recovery/run";
export {
  extractSquarePaymentFromWebhook,
  handleSquarePaymentWebhookEvent,
  squareWebhookEventMeta,
} from "@/lib/hazlo/recovery/square-events";
export { verifySquareOfficialWebhook, verifySquareSignature } from "@/lib/crypto/square";
export { handlePaymentIntentFailed, handlePaymentIntentSucceeded } from "@/lib/hazlo/recovery/stripe-events";
export { sendRecoveryWhatsApp } from "@/lib/hazlo/recovery/notify";
