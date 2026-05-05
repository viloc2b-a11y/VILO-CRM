/**
 * Verificación HMAC-SHA256 / HMAC-SHA512 usando Web Crypto API.
 * Válido en: Next.js (server), Edge, Deno, Node 18+.
 */

function hashAlgorithmName(algorithm: "sha256" | "sha512"): string {
  return algorithm === "sha256" ? "SHA-256" : "SHA-512";
}

export async function verifyHMAC(
  payload: string,
  signature: string,
  secret: string,
  algorithm: "sha256" | "sha512" = "sha256",
): Promise<boolean> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: hashAlgorithmName(algorithm) },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

  const calculatedHex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const receivedHex = signature.replace(/^[^=]+=/, "").toLowerCase().trim();

  if (calculatedHex.length !== receivedHex.length) return false;

  let result = 0;
  for (let i = 0; i < calculatedHex.length; i++) {
    result |= calculatedHex.charCodeAt(i) ^ receivedHex.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Stripe: header `Stripe-Signature` con `t=…,v1=…` (firma hex de HMAC-SHA256 de `t.payload`).
 */
export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  toleranceSeconds: number = 300,
): Promise<boolean> {
  const parts = header.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.split("=")[1];
  const signatureV1 = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

  if (!timestamp || !signatureV1) return false;

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) return false;

  const signedPayload = `${timestamp}.${payload}`;
  return verifyHMAC(signedPayload, signatureV1, secret, "sha256");
}

/**
 * Meta: header `X-Hub-Signature-256` con prefijo `sha256=`.
 */
export async function verifyMetaSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
  const signature = header.replace(/^sha256=/i, "").toLowerCase().trim();
  return verifyHMAC(payload, signature, secret, "sha256");
}
