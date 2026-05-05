/**
 * Prueba local: firma HMAC hex (solo body) + parseSquareEvent.
 * Producción Square usa verifySquareOfficialWebhook (URL + body, firma Base64).
 *
 * Ejecutar: npx tsx scripts/test-square-webhook.ts
 *    o:    npm run test:square-webhook
 */
import { createHmac } from "node:crypto";
import { parseSquareEvent, verifySquareOfficialWebhook, verifySquareSignature } from "../lib/crypto/square";

const SUBMISSION_ID = "550e8400-e29b-41d4-a716-446655440000";

function buildPayload(): string {
  const body = {
    event_id: `evt_test_${Date.now()}`,
    type: "payment.updated",
    created_at: new Date().toISOString(),
    merchant_id: "MERCHANT_TEST",
    data: {
      object: {
        payment: {
          id: "pay_test_abc",
          location_id: "LOC_TEST",
          status: "FAILED",
          reference_id: SUBMISSION_ID,
          note: "HazloAsíYa - SNAP",
          amount_money: { amount: 4900, currency: "USD" },
        },
      },
    },
  };
  return JSON.stringify(body);
}

function signHmacSha256Hex(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

function uint8ToB64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

async function testOfficialFormat(secret: string, notificationUrl: string, rawBody: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(notificationUrl + rawBody));
  const b64 = uint8ToB64(new Uint8Array(mac));
  const ok = await verifySquareOfficialWebhook(rawBody, b64, secret, notificationUrl);
  console.log("verifySquareOfficialWebhook (URL + body, Base64):", ok ? "PASS" : "FAIL");
  if (!ok) process.exitCode = 1;
}

async function main() {
  const secret = "sq0sig-test123";
  const rawBody = buildPayload();

  const signature = signHmacSha256Hex(rawBody, secret);

  const valid = await verifySquareSignature(rawBody, signature, secret);
  console.log("verifySquareSignature (hex, body only):", valid ? "PASS" : "FAIL");
  if (!valid) process.exitCode = 1;

  const invalid = await verifySquareSignature(rawBody, "deadbeef", secret);
  console.log("rechaza firma incorrecta:", !invalid ? "PASS" : "FAIL");
  if (invalid) process.exitCode = 1;

  const parsed = parseSquareEvent(JSON.parse(rawBody) as unknown);
  const parseOk =
    parsed.eventId != null &&
    parsed.type === "payment.updated" &&
    parsed.paymentId === "pay_test_abc" &&
    parsed.submissionId === SUBMISSION_ID &&
    parsed.amount === 4900;
  console.log("parseSquareEvent:", parseOk ? "PASS" : "FAIL", parseOk ? "" : parsed);
  if (!parseOk) process.exitCode = 1;

  const notificationUrl = "https://example.com/api/hazlo/square/webhook";
  await testOfficialFormat(secret, notificationUrl, rawBody);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
