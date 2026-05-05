/**
 * Dispatcher unificado para Email (Resend) y Slack Incoming Webhooks.
 * Solo `fetch` nativo → compatible con Cloudflare Workers / Edge.
 */

const RESEND_URL = "https://api.resend.com/emails";

function defaultFrom(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "Vilo CRM <onboarding@resend.dev>"
  );
}

export type SendEmailOutcome = { ok: true; resendId?: string } | { ok: false };

/**
 * Envía correo vía Resend.
 * @param opts.text Cuerpo plano (recomendado si hay clientes que no renderizan HTML).
 * @param opts.idempotencyKey Cabecera opcional de deduplicación en Resend.
 * @returns `resendId` cuando Resend devuelve `{ id }` (webhooks / `communications_log`).
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts?: { text?: string; idempotencyKey?: string },
): Promise<SendEmailOutcome> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[dispatcher] RESEND_API_KEY missing");
    return { ok: false };
  }

  const from = defaultFrom();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (opts?.idempotencyKey?.trim()) {
    headers["Idempotency-Key"] = opts.idempotencyKey.trim().slice(0, 256);
  }

  const body: Record<string, unknown> = {
    from,
    to: [to.trim()],
    subject,
    html,
  };
  if (opts?.text != null && opts.text !== "") {
    body.text = opts.text;
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[dispatcher] Resend HTTP", res.status, errText);
      return { ok: false };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: unknown };
    const resendId = typeof json.id === "string" ? json.id : undefined;
    return { ok: true, resendId };
  } catch (e) {
    console.error("[dispatcher] Resend fetch", e);
    return { ok: false };
  }
}

/**
 * Slack Incoming Webhook: mensaje + barra de color (attachment).
 * `color` en hex (#RRGGBB o RRGGBB sin #).
 */
export async function sendSlack(webhookUrl: string, text: string, color = "#FF0000"): Promise<boolean> {
  const url = webhookUrl?.trim();
  if (!url) return false;

  const attachmentColor = color.startsWith("#") ? color.slice(1) : color;
  const fallback = text.length > 500 ? `${text.slice(0, 497)}…` : text;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        attachments: [{ color: attachmentColor, text, fallback }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[dispatcher] Slack HTTP", res.status, errText);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[dispatcher] Slack fetch", e);
    return false;
  }
}
