import { funnelTypeShortLabel } from "@/lib/hazlo/funnel-label";
import type { PaymentFailureCategory } from "@/lib/hazlo/recovery/types";
import {
  hazloTemplateRecovery1Name,
  hazloTemplateRecovery2Name,
  hazloWhatsAppTemplatesEnabled,
  whatsappTemplateLanguageCode,
} from "@/lib/hazlo/whatsapp-templates";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { sendVitalisWhatsApp } from "@/lib/vitalis/whatsapp";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPaymentUpdateLink(submissionId: string): string {
  const base = process.env.HAZLO_PAYMENT_UPDATE_URL?.trim();
  if (!base) return "";
  try {
    const u = new URL(base);
    u.searchParams.set("submission_id", submissionId);
    return u.toString();
  } catch {
    const sep = base.includes("?") ? "&" : "?";
    return `${base.replace(/\/$/, "")}${sep}submission_id=${encodeURIComponent(submissionId)}`;
  }
}

function categoryHint(cat: PaymentFailureCategory): string {
  switch (cat) {
    case "insufficient_funds":
      return "El banco indicó fondos insuficientes. Podés reintentar en unos días o usar otro medio de pago.";
    case "card_expired":
      return "La tarjeta parece vencida. Actualizá el método de pago con una tarjeta vigente.";
    case "fraud_block":
      return "Tu banco bloqueó el cargo por seguridad. Contactá a soporte y a tu banco para autorizar el pago.";
    case "network_error":
      return "Hubo un error de red al procesar el pago. Podés intentar de nuevo ahora con el mismo enlace.";
    default:
      return "No pudimos completar el pago. Actualizá tu tarjeta o probá otro método.";
  }
}

async function sendResend(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() ?? "HazloAsíYa <onboarding@resend.dev>";
  if (!key || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
  } catch {
    /* noop */
  }
}

export async function sendRecoveryDay0Email(params: {
  name: string;
  email: string | null;
  submissionId: string;
  category: PaymentFailureCategory;
}): Promise<void> {
  const to = params.email?.trim();
  if (!to) return;
  const link = buildPaymentUpdateLink(params.submissionId);
  const support = process.env.HAZLO_SUPPORT_URL?.trim() ?? "";
  const hint = categoryHint(params.category);
  const first = params.name.split(/\s+/)[0] || "hola";
  const linkBlock = link
    ? `<p><a href="${esc(link)}">Actualizar método de pago</a></p>`
    : "<p>Entrá a tu cuenta HazloAsíYa para actualizar el pago.</p>";
  const fraudExtra =
    params.category === "fraud_block" && support
      ? `<p>Soporte: <a href="${esc(support)}">${esc(support)}</a></p>`
      : "";

  const html = `<p>Hola ${esc(first)},</p>
<p>Hubo un problema con tu pago.</p>
<p>${esc(hint)}</p>
${linkBlock}
${fraudExtra}
<p>— Equipo HazloAsíYa</p>`;

  await sendResend(to, "HazloAsíYa — actualizá tu pago", html);
}

export async function sendRecoveryNetworkBumpEmail(params: {
  name: string;
  email: string | null;
  submissionId: string;
}): Promise<void> {
  const to = params.email?.trim();
  if (!to) return;
  const link = buildPaymentUpdateLink(params.submissionId);
  const first = params.name.split(/\s+/)[0] || "hola";
  const html = `<p>Hola ${esc(first)},</p>
<p>Detectamos un fallo temporal de red. Por favor intentá completar el pago de nuevo:</p>
${link ? `<p><a href="${esc(link)}">Reintentar pago</a></p>` : ""}
<p>— HazloAsíYa</p>`;
  await sendResend(to, "HazloAsíYa — reintentá tu pago", html);
}

/**
 * Plantillas Meta recovery: `attempt` 1–2 → enlace de pago ({{3}} URL); 3+ → soporte ({{3}} teléfono).
 * Requiere credenciales Cloud API y plantillas aprobadas.
 */
export async function sendRecoveryWhatsApp(params: {
  phone: string;
  funnelType: string | null | undefined;
  /** 1–2 usa `hazlo_recovery_1`; mayor usa `hazlo_recovery_2`. */
  attempt: number;
  firstName: string;
  payLink: string;
}): Promise<boolean> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneId || !token || !params.phone?.trim()) return false;

  const tramite = funnelTypeShortLabel(params.funnelType);
  const usePayTemplate = params.attempt <= 2;
  const templateName = usePayTemplate ? hazloTemplateRecovery1Name() : hazloTemplateRecovery2Name();
  const supportPhone =
    process.env.HAZLO_RECOVERY_WA_SUPPORT_PHONE?.trim() ||
    process.env.HAZLO_SUPPORT_PHONE?.trim() ||
    "";

  const variables = usePayTemplate
    ? [params.firstName, tramite, params.payLink || "https://hazloasiya.com"]
    : [params.firstName, tramite, supportPhone || params.payLink || "—"];

  const result = await sendWhatsAppTemplate({
    phoneId,
    token,
    to: params.phone,
    templateName,
    languageCode: whatsappTemplateLanguageCode(),
    variables,
  });

  if (!result.success) {
    console.error(`[Recovery WhatsApp] Fallo (${templateName}): ${result.error}`);
  }

  return result.success;
}

export type RecoveryDay2WhatsAppResult = {
  /** `true` / `false` solo si `HAZLO_WHATSAPP_USE_TEMPLATES`; `null` si se usa solo texto libre. */
  templateSent: boolean | null;
  /** Hubo intento de contacto (plantilla OK o texto libre). */
  notified: boolean;
};

export async function sendRecoveryDay2WhatsApp(params: {
  name: string;
  phone: string | null;
  submissionId: string;
  category: PaymentFailureCategory;
  /** `submissions.funnel_type` — para variable {{2}} de plantilla Meta. */
  funnelType?: string | null;
  /** Igual que `payment_recovery_attempts || 1` en fila; default 1. */
  whatsappAttempt?: number;
}): Promise<RecoveryDay2WhatsAppResult> {
  if (!params.phone?.trim()) {
    return { templateSent: null, notified: false };
  }
  const link =
    buildPaymentUpdateLink(params.submissionId) ||
    process.env.HAZLO_PAYMENT_UPDATE_URL?.trim() ||
    "";
  const first = params.name.split(/\s+/)[0] || "hola";
  const attempt = params.whatsappAttempt ?? 1;

  if (hazloWhatsAppTemplatesEnabled()) {
    const payLink =
      link || process.env.HAZLO_PAYMENT_UPDATE_URL?.trim() || "https://hazloasiya.com";
    const sent = await sendRecoveryWhatsApp({
      phone: params.phone,
      funnelType: params.funnelType,
      attempt,
      firstName: first,
      payLink,
    });
    if (sent) {
      return { templateSent: true, notified: true };
    }
  }

  const support = process.env.HAZLO_SUPPORT_URL?.trim();
  const human = support ? ` Si preferís, escribinos: ${support}` : "";
  const msg = `Hola ${first}, ¿necesitás ayuda con tu pago pendiente? Respondé a este mensaje.${link ? ` Actualizar pago: ${link}` : ""}${human}`;
  await sendVitalisWhatsApp(params.phone, msg);
  return {
    templateSent: hazloWhatsAppTemplatesEnabled() ? false : null,
    notified: true,
  };
}

export async function sendRecoveryDay7Email(params: {
  name: string;
  email: string | null;
  submissionId: string;
}): Promise<void> {
  const to = params.email?.trim();
  if (!to) return;
  const link = buildPaymentUpdateLink(params.submissionId);
  const code = process.env.HAZLO_RECOVERY_DISCOUNT_CODE?.trim() ?? "RECOVERY10";
  const first = params.name.split(/\s+/)[0] || "hola";
  const html = `<p>Hola ${esc(first)},</p>
<p><strong>Última oportunidad:</strong> completá tu trámite con <strong>10% de descuento</strong> usando el código <code>${esc(code)}</code> al pagar.</p>
${link ? `<p><a href="${esc(link)}">Completar pago</a></p>` : ""}
<p>— HazloAsíYa</p>`;
  await sendResend(to, "HazloAsíYa — 10% descuento para completar tu trámite", html);
}

export async function sendPaymentCelebrationEmail(params: { name: string; email: string | null }): Promise<void> {
  const to = params.email?.trim();
  if (!to) return;
  const first = params.name.split(/\s+/)[0] || "hola";
  const html = `<p>¡Hola ${esc(first)}!</p>
<p>¡Listo! Tu pago se acreditó correctamente. Seguimos con tu trámite.</p>
<p>— Equipo HazloAsíYa</p>`;
  await sendResend(to, "¡Pago confirmado — HazloAsíYa!", html);
}

export async function sendChurnSurveyEmail(params: {
  name: string;
  email: string | null;
  submissionId: string;
}): Promise<void> {
  const to = params.email?.trim();
  if (!to) return;
  const survey = process.env.HAZLO_CHURN_SURVEY_URL?.trim();
  const first = params.name.split(/\s+/)[0] || "hola";
  const q = survey
    ? `<p><a href="${esc(survey)}?submission=${esc(params.submissionId)}">Encuesta breve (1 min)</a></p>`
    : "<p>Tu opinión nos ayuda a mejorar.</p>";
  const html = `<p>Hola ${esc(first)},</p>
<p>Cerramos tu expediente por falta de pago. ${q}</p>
<p>— HazloAsíYa</p>`;
  await sendResend(to, "HazloAsíYa — nos importa tu experiencia", html);
}

function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const prefix = (process.env.TWILIO_E164_PREFIX?.trim() ?? "+52").replace(/\s/g, "");
  const p = prefix.startsWith("+") ? prefix : `+${prefix}`;
  return `${p}${digits}`;
}

export async function twilioRecoveryCall(e164: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_PHONE_NUMBER?.trim();
  const twimlUrl = process.env.HAZLO_RECOVERY_TWIML_URL?.trim() ?? process.env.TWILIO_REMINDER_TWIML_URL?.trim();
  if (!sid || !token || !from || !twimlUrl) return false;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: e164, From: from, Url: twimlUrl }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendRecoveryDay5Call(phone: string | null): Promise<boolean> {
  if (!phone?.trim()) return false;
  const e164 = toE164(phone);
  if (!e164) return false;
  return twilioRecoveryCall(e164);
}
