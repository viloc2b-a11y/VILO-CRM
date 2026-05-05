import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  return (
    process.env.SCHEDULER_CONFIRM_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

/** Token vacío si no hay secreto configurado. */
export function buildSchedulerConfirmToken(leadId: string, ttlMs = 7 * 86400000): string {
  const s = secret();
  if (!s) return "";
  const exp = Date.now() + ttlMs;
  const payload = `${leadId}:${exp}`;
  const sig = createHmac("sha256", s).update(payload).digest("base64url");
  return Buffer.from(`${payload}::${sig}`, "utf8").toString("base64url");
}

export function parseSchedulerConfirmToken(token: string): { leadId: string } | null {
  const s = secret();
  if (!s) return null;
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split("::");
    if (parts.length !== 3) return null;
    const [leadId, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!leadId || !Number.isFinite(exp) || !sig) return null;
    if (Date.now() > exp) return null;
    const payload = `${leadId}:${exp}`;
    const expect = createHmac("sha256", s).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { leadId };
  } catch {
    return null;
  }
}
