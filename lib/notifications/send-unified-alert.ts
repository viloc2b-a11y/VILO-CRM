import { sendEmail, sendSlack } from "@/lib/notifications/dispatcher";
import { serviceClient } from "@/lib/supabase/service-role";

export type NotifyChannel = "email" | "slack";

export type UnifiedAlertInput = {
  /** Única por evento lógico (ej. `report_pdf:orgId:2025-05-01`). Máx. 512 caracteres. */
  idempotencyKey: string;
  subject: string;
  text: string;
  html?: string;
  /** Slack: texto plano o mrkdwn simple; por defecto `text`. */
  slackText?: string;
  /** Color barra Slack (hex). */
  slackColor?: string;
  /** Por defecto: todos los canales con env configurado. */
  channels?: NotifyChannel[];
  /** Override; si no, `ALERTS_EMAIL_TO` → `VITALIS_NAVIGATOR_EMAIL` → `OPS_EMAIL`. */
  toEmail?: string;
  /** Override; si no, `ALERTS_SLACK_WEBHOOK_URL` → `VITALIS_INTAKE_SLACK_WEBHOOK_URL`. */
  slackWebhookUrl?: string;
};

export type UnifiedAlertResult = {
  claimed: boolean;
  duplicate: boolean;
  email: "sent" | "skipped" | "disabled" | "failed";
  slack: "sent" | "skipped" | "disabled" | "failed";
};

function clampKey(key: string): string {
  const t = key.trim();
  if (t.length <= 512) return t;
  return t.slice(0, 512);
}

function resolveChannels(requested: NotifyChannel[] | undefined): NotifyChannel[] {
  if (requested?.length) return requested;
  return ["email", "slack"];
}

function defaultEmailTo(): string | undefined {
  const a = process.env.ALERTS_EMAIL_TO?.trim();
  if (a) {
    const first = a.split(",")[0]?.trim();
    if (first) return first;
  }
  return process.env.VITALIS_NAVIGATOR_EMAIL?.trim() || process.env.OPS_EMAIL?.trim() || undefined;
}

function defaultSlackUrl(): string | undefined {
  return (
    process.env.ALERTS_SLACK_WEBHOOK_URL?.trim() ||
    process.env.VITALIS_INTAKE_SLACK_WEBHOOK_URL?.trim() ||
    undefined
  );
}

function htmlFromText(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre style="font-family:system-ui,sans-serif;font-size:14px;white-space:pre-wrap">${esc}</pre>`;
}

async function claimDedupeKey(key: string): Promise<{ ok: true } | { ok: false; duplicate: boolean }> {
  const { error } = await serviceClient.from("notification_deliveries").insert({ idempotency_key: key });

  if (!error) return { ok: true };

  if (error.code === "23505") return { ok: false, duplicate: true };

  console.error("[unified-alert] notification_deliveries insert:", error.message);
  return { ok: false, duplicate: false };
}

/**
 * Envía la misma alerta por Resend y/o Slack tras reclamar `idempotencyKey` en BD.
 * Compatible con Cloudflare Workers / Edge (solo `fetch` + Supabase REST vía JS client).
 *
 * Si la clave ya existe → no envía nada (anti-spam).
 * Si falla el INSERT por otra causa → no envía (fail-closed).
 */
export async function sendUnifiedAlert(input: UnifiedAlertInput): Promise<UnifiedAlertResult> {
  const key = clampKey(input.idempotencyKey);
  if (!key) {
    return {
      claimed: false,
      duplicate: false,
      email: "skipped",
      slack: "skipped",
    };
  }

  const channels = new Set(resolveChannels(input.channels));
  const to = input.toEmail?.trim() || defaultEmailTo();
  const slackUrl = input.slackWebhookUrl?.trim() || defaultSlackUrl();
  const wantEmail = channels.has("email") && !!to && !!process.env.RESEND_API_KEY?.trim();
  const wantSlack = channels.has("slack") && !!slackUrl;

  if (!wantEmail && !wantSlack) {
    return {
      claimed: false,
      duplicate: false,
      email: "disabled",
      slack: "disabled",
    };
  }

  const claim = await claimDedupeKey(key);
  if (!claim.ok) {
    if ("duplicate" in claim && claim.duplicate) {
      return {
        claimed: false,
        duplicate: true,
        email: "skipped",
        slack: "skipped",
      };
    }
    return {
      claimed: false,
      duplicate: false,
      email: "failed",
      slack: "failed",
    };
  }

  const slackBody = input.slackText?.trim() || `${input.subject}\n\n${input.text}`;
  const result: UnifiedAlertResult = {
    claimed: true,
    duplicate: false,
    email: "skipped",
    slack: "skipped",
  };

  if (wantEmail && to) {
    const html = input.html ?? htmlFromText(input.text);
    const sent = await sendEmail(to, input.subject, html, {
      text: input.text,
      idempotencyKey: key,
    });
    result.email = sent.ok ? "sent" : "failed";
  } else {
    result.email = channels.has("email") ? "disabled" : "skipped";
  }

  if (wantSlack && slackUrl) {
    const ok = await sendSlack(slackUrl, slackBody, input.slackColor);
    result.slack = ok ? "sent" : "failed";
  } else {
    result.slack = channels.has("slack") ? "disabled" : "skipped";
  }

  return result;
}
