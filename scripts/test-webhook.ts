/**
 * Prueba local de HMAC (Stripe + Meta) alineado a lib/crypto/hmac.ts
 *
 * Ejecutar: npx tsx scripts/test-webhook.ts
 *    o:    npm run test:webhook
 */
import { verifyHMAC, verifyMetaSignature, verifyStripeSignature } from "../lib/crypto/hmac";
import { parseSquareEvent, verifySquareOfficialWebhook, verifySquareSignature } from "../lib/crypto/square";

async function signHmacHex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function testStripe() {
  const secret = "whsec_test123";
  const payload = '{"id":"evt_123","type":"payment_intent.payment_failed"}';
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const sigHex = await signHmacHex(signedPayload, secret);
  const header = `t=${timestamp},v1=${sigHex}`;

  const result = await verifyStripeSignature(payload, header, secret);
  console.log("Stripe verifyStripeSignature:", result ? "PASS" : "FAIL");
  if (!result) process.exitCode = 1;
}

async function testMeta() {
  const secret = "meta_app_secret_test";
  const payload = '{"object":"page","entry":[]}';
  const sigHex = await signHmacHex(payload, secret);
  const header = `sha256=${sigHex}`;

  const result = await verifyMetaSignature(payload, header, secret);
  console.log("Meta verifyMetaSignature:", result ? "PASS" : "FAIL");
  if (!result) process.exitCode = 1;
}

async function testHmacRoundTrip() {
  const secret = "raw_secret";
  const payload = "hello";
  const sigHex = await signHmacHex(payload, secret);
  const result = await verifyHMAC(payload, sigHex, secret);
  console.log("verifyHMAC round-trip:", result ? "PASS" : "FAIL");
  if (!result) process.exitCode = 1;
}

function uint8ToB64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

async function testSquareOfficial() {
  const key = "square_sig_key";
  const url = "https://example.com/api/hazlo/square/webhook";
  const body = '{"type":"payment.updated","event_id":"evt_1"}';
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(url + body));
  const b64 = uint8ToB64(new Uint8Array(mac));
  const ok = await verifySquareOfficialWebhook(body, b64, key, url);
  console.log("Square verifySquareOfficialWebhook:", ok ? "PASS" : "FAIL");
  if (!ok) process.exitCode = 1;
}

async function testSquareHex() {
  const secret = "sec";
  const payload = "{}";
  const hex = await signHmacHex(payload, secret);
  const ok = await verifySquareSignature(payload, hex, secret);
  console.log("Square verifySquareSignature (hex):", ok ? "PASS" : "FAIL");
  if (!ok) process.exitCode = 1;
}

function testParseSquare() {
  const parsed = parseSquareEvent({
    type: "payment.updated",
    event_id: "abc",
    created_at: "2026-01-01T00:00:00Z",
    data: {
      object: {
        payment: {
          id: "pay_1",
          reference_id: "550e8400-e29b-41d4-a716-446655440000",
          location_id: "loc_x",
          amount_money: { amount: 1999, currency: "USD" },
        },
      },
    },
  });
  const ok =
    parsed.eventId === "abc" &&
    parsed.paymentId === "pay_1" &&
    parsed.submissionId === "550e8400-e29b-41d4-a716-446655440000" &&
    parsed.amount === 1999;
  console.log("parseSquareEvent:", ok ? "PASS" : "FAIL");
  if (!ok) process.exitCode = 1;
}

async function main() {
  await testHmacRoundTrip();
  await testStripe();
  await testMeta();
  await testSquareOfficial();
  await testSquareHex();
  testParseSquare();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
