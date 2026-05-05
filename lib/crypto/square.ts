import { verifyHMAC } from "./hmac";

/**
 * Square Webhooks (payload parseado).
 * @see https://developer.squareup.com/reference/square/payments-api/webhooks/payment.updated
 */
export type ParsedSquareWebhook = {
  eventId: string | null;
  type: string;
  locationId?: string;
  paymentId?: string;
  submissionId: string | null;
  /** Unidad menor (p. ej. centavos) desde `amount_money.amount` si existe */
  amount?: number;
  timestamp: string;
};

export function parseSquareEvent(payload: unknown): ParsedSquareWebhook {
  const fallbackTime = new Date().toISOString();
  if (!payload || typeof payload !== "object") {
    return { eventId: null, type: "unknown", submissionId: null, timestamp: fallbackTime };
  }
  const p = payload as Record<string, unknown>;
  const eventId = typeof p.event_id === "string" ? p.event_id : null;
  const type = typeof p.type === "string" ? p.type : "unknown";
  const timestamp = typeof p.created_at === "string" ? p.created_at : fallbackTime;

  const data = p.data as Record<string, unknown> | undefined;
  const obj = data?.object as Record<string, unknown> | undefined;
  const payment = (obj?.payment ?? obj) as Record<string, unknown> | undefined;

  const paymentId = typeof payment?.id === "string" ? payment.id : undefined;
  const locationId = typeof payment?.location_id === "string" ? payment.location_id : undefined;

  const amountMoney = payment?.amount_money as Record<string, unknown> | undefined;
  let amount: number | undefined;
  if (amountMoney && typeof amountMoney.amount === "number" && Number.isFinite(amountMoney.amount)) {
    amount = amountMoney.amount;
  } else if (amountMoney && typeof amountMoney.amount === "string" && /^\d+$/.test(amountMoney.amount)) {
    amount = Number(amountMoney.amount);
  }

  let submissionId: string | null = null;
  const ref = typeof payment?.reference_id === "string" ? payment.reference_id.trim() : "";
  if (ref.length > 0) submissionId = ref;
  if (!submissionId && typeof payment?.note === "string") {
    const m = payment.note.match(/submission:([a-f0-9-]+)/i);
    if (m?.[1]) submissionId = m[1];
  }

  return { eventId, type, locationId, paymentId, submissionId, amount, timestamp };
}

/**
 * HMAC-SHA256 **hex** solo sobre el body (p. ej. pruebas o proxy custom).
 * Producción: Square firma `notificationUrl + rawBody` en **Base64**; usá {@link verifySquareOfficialWebhook}
 * y header `x-square-hmacsha256-signature`.
 */
export async function verifySquareSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const clean = signature.toLowerCase().replace(/^(sha256=|hmac=)/i, "").trim();
  return verifyHMAC(payload, clean, secret, "sha256");
}

/**
 * Verificación oficial: HMAC-SHA256 de `notificationUrl + rawBody`, firma en Base64.
 * @see https://developer.squareup.com/docs/webhooks/step3validate
 */
export async function verifySquareOfficialWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
  signatureKey: string,
  notificationUrl: string,
): Promise<boolean> {
  const sig = signatureHeader?.trim();
  if (!sig) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(notificationUrl + rawBody));
  const expected = new Uint8Array(mac);
  let received: Uint8Array;
  try {
    const bin = atob(sig);
    received = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) received[i] = bin.charCodeAt(i);
  } catch {
    return false;
  }
  if (expected.length !== received.length) return false;
  let x = 0;
  for (let i = 0; i < expected.length; i++) x |= expected[i]! ^ received[i]!;
  return x === 0;
}
