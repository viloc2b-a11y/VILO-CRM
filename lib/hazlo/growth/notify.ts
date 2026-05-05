import { funnelTypeShortLabel } from "@/lib/hazlo/funnel-label";
import type { GrowthChannel } from "@/lib/hazlo/growth/types";
import type { GrowthOffer } from "@/lib/hazlo/growth/types";
import {
  hazloTemplateGrowthUpsellName,
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

function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const prefix = (process.env.TWILIO_E164_PREFIX?.trim() ?? "+52").replace(/\s/g, "");
  const p = prefix.startsWith("+") ? prefix : `+${prefix}`;
  return `${p}${digits}`;
}

/**
 * Plantilla Meta `hazlo_growth_upsell` (o nombre en env): {{1}} nombre, {{2}} trámite, {{3}} oferta, {{4}} URL.
 */
export async function sendGrowthWhatsApp(params: {
  phone: string;
  offer: Pick<GrowthOffer, "headline">;
  funnelType: string | null | undefined;
  firstName: string;
  trackingUrl: string;
  /** `en`, `es`, `es_MX`, etc. (debe coincidir con la plantilla en Meta); si omitís, usa `WHATSAPP_TEMPLATE_LANGUAGE`. */
  language?: string;
}): Promise<boolean> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneId || !token || !params.phone?.trim()) return false;

  const L = params.language?.trim();
  const languageCode =
    !L ? whatsappTemplateLanguageCode() : L.toLowerCase() === "en" ? "en" : L;

  const tramite = funnelTypeShortLabel(params.funnelType);
  const result = await sendWhatsAppTemplate({
    phoneId,
    token,
    to: params.phone,
    templateName: hazloTemplateGrowthUpsellName(),
    languageCode,
    variables: [params.firstName, tramite, params.offer.headline, params.trackingUrl],
  });

  if (!result.success) {
    console.error(`[Growth WhatsApp] Fallo: ${result.error}`);
  }
  return result.success;
}

async function sendTwilioSms(toE164: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_SMS_NUMBER?.trim() ?? process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!sid || !token || !from) return false;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: toE164, From: from, Body: body }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type SendGrowthCampaignResult = {
  /** `true` plantilla Meta OK; `false` plantilla falló o hubo solo texto; `null` no aplica (email/SMS o sin intento plantilla). */
  whatsappTemplateSent: boolean | null;
};

export async function sendGrowthCampaign(params: {
  name: string;
  email: string | null;
  phone: string | null;
  channel: GrowthChannel;
  offer: GrowthOffer;
  trackingUrl: string;
  segmentLabel: string;
  /** `submissions.funnel_type` — trámite completado (plantilla {{2}}). */
  priorFunnelType?: string | null;
  /** Preferencia de idioma plantilla (p. ej. desde `growth_channel_stats`); default `es` vía env. */
  whatsappLanguage?: string | null;
}): Promise<SendGrowthCampaignResult> {
  let whatsappTemplateSent: boolean | null = null;
  const first = params.name.split(/\s+/)[0] || "hola";
  const linkLine = params.trackingUrl
    ? params.channel === "email"
      ? `<p><a href="${esc(params.trackingUrl)}">Completar en ~${params.offer.etaMinutes} min</a></p>`
      : params.trackingUrl
    : "";

  const textBody = `Hola ${first}, ${params.offer.body} ${params.trackingUrl ? `Link: ${params.trackingUrl}` : ""} — HazloAsíYa`;

  if (params.channel === "email" && params.email?.trim()) {
    const html = `<p>Hola ${esc(first)},</p>
<p><strong>${esc(params.offer.headline)}</strong></p>
<p>${esc(params.offer.body)}</p>
${linkLine}
<p><small>${esc(params.segmentLabel)}</small></p>`;
    await sendResend(
      params.email.trim(),
      `HazloAsíYa — ${params.offer.headline}`,
      html
    );
    return { whatsappTemplateSent };
  }

  if (params.channel === "whatsapp" && params.phone?.trim()) {
    const lang = params.whatsappLanguage?.trim() || "es";
    if (hazloWhatsAppTemplatesEnabled()) {
      const sent = await sendGrowthWhatsApp({
        phone: params.phone,
        offer: params.offer,
        funnelType: params.priorFunnelType,
        firstName: first,
        trackingUrl: params.trackingUrl,
        language: lang,
      });
      whatsappTemplateSent = sent;
      if (sent) return { whatsappTemplateSent };
    } else {
      whatsappTemplateSent = null;
    }
    await sendVitalisWhatsApp(params.phone, textBody);
    return { whatsappTemplateSent };
  }

  if (params.channel === "sms" && params.phone?.trim()) {
    const e164 = toE164(params.phone);
    if (e164) await sendTwilioSms(e164, textBody);
  }
  return { whatsappTemplateSent };
}
