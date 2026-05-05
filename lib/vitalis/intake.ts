import { resolveCampaignNameFromUtm } from "@/lib/vitalis/campaign-aliases";
import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";

export type VitalisIntakeUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

export type VitalisIntakePayload = {
  full_name: string;
  phone: string;
  email?: string | null;
  preferred_language?: string | null;
  age_range?: string | null;
  gender?: string | null;
  condition_or_study_interest?: string | null;
  zip_code?: string | null;
  /** WhatsApp | Phone | SMS | Email — default WhatsApp */
  preferred_contact_channel?: string | null;
  /** Canal lógico: meta_lead_ads, whatsapp_ctwa, craigslist, web_form, referral, … */
  source_channel?: string | null;
  /** Ej. meta_ad_campaign_123 o nombre de campaña */
  source_campaign?: string | null;
  utm?: VitalisIntakeUtm | null;
  referral_code?: string | null;
  consent_to_contact?: boolean;
  /** Payload crudo para auditoría (Meta/WhatsApp) */
  raw?: Record<string, unknown>;
};

export type VitalisIntakeResult = {
  lead_id: string;
  duplicate: boolean;
};

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const t = email.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

/**
 * Completa `source_campaign` y `utm` desde el JSON crudo (p. ej. `utm_campaign`, objeto `utm`).
 * Prioridad: `payload.source_campaign` ya fijado por el mapper → `utm_campaign` / `utm.campaign` → `"Organic"`.
 * El valor final pasa por `resolveCampaignNameFromUtm` (alias slug → nombre en `marketing_campaigns.name`).
 */
export function enrichVitalisIntakeFromRawBody(
  payload: VitalisIntakePayload,
  raw: Record<string, unknown>,
): VitalisIntakePayload {
  let utm: VitalisIntakeUtm = { ...(payload.utm ?? {}) };
  const rawUtm = raw.utm;
  if (rawUtm && typeof rawUtm === "object" && !Array.isArray(rawUtm)) {
    const u = rawUtm as Record<string, unknown>;
    if (typeof u.source === "string" && u.source.trim()) utm.source = u.source.trim();
    if (typeof u.medium === "string" && u.medium.trim()) utm.medium = u.medium.trim();
    if (typeof u.campaign === "string" && u.campaign.trim()) utm.campaign = u.campaign.trim();
    if (typeof u.content === "string" && u.content.trim()) utm.content = u.content.trim();
    if (typeof u.term === "string" && u.term.trim()) utm.term = u.term.trim();
  }

  const flatCampaign =
    (typeof raw.utm_campaign === "string" && raw.utm_campaign.trim()) ||
    (typeof raw.utmCampaign === "string" && raw.utmCampaign.trim()) ||
    "";

  if (flatCampaign && !utm.campaign) {
    utm.campaign = flatCampaign;
  }

  const rawPick =
    (payload.source_campaign && payload.source_campaign.trim()) ||
    flatCampaign ||
    (utm.campaign && utm.campaign.trim()) ||
    "";

  const source_campaign = rawPick ? resolveCampaignNameFromUtm(rawPick) : "Organic";

  if ((utm.campaign && utm.campaign.trim()) || flatCampaign) {
    utm = {
      ...utm,
      campaign: source_campaign === "Organic" ? utm.campaign : source_campaign,
    };
  }

  const hasUtm = Object.values(utm).some((v) => v != null && String(v).length > 0);

  return {
    ...payload,
    utm: hasUtm ? utm : payload.utm ?? null,
    source_campaign,
  };
}

function buildAttribution(p: VitalisIntakePayload): Record<string, Json | undefined> {
  const utm = p.utm ?? {};
  return {
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    utm_content: utm.content,
    utm_term: utm.term,
    referral_code: p.referral_code ?? undefined,
    source_channel: p.source_channel ?? undefined,
    source_campaign: p.source_campaign ?? undefined,
    captured_at: new Date().toISOString(),
  };
}

async function findDuplicateLead(phoneDigits: string, emailNorm: string | null) {
  const ors: string[] = [];
  if (phoneDigits.length > 0) {
    ors.push(`phone_normalized.eq.${phoneDigits}`);
  }
  if (emailNorm) {
    ors.push(`email_normalized.eq.${emailNorm}`);
  }
  if (ors.length === 0) return null;

  const { data, error } = await serviceClient
    .from("patient_leads")
    .select("id, intake_attribution, notes, consent_to_contact, current_stage")
    .eq("archived", false)
    .or(ors.join(","))
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function notifyNavigators(
  title: string,
  body: string,
  opts: { duplicate: boolean; leadId: string },
) {
  const slackUrl = process.env.VITALIS_INTAKE_SLACK_WEBHOOK_URL?.trim();
  if (slackUrl) {
    try {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${title}\n${body}\nlead_id: ${opts.leadId}\nduplicate: ${opts.duplicate}`,
        }),
      });
    } catch {
      /* noop */
    }
  }

  const to = process.env.VITALIS_NAVIGATOR_EMAIL?.trim() || process.env.OPS_EMAIL?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() ?? "Vilo CRM <onboarding@resend.dev>";
  if (to && resendKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [to],
          subject: title,
          text: `${body}\n\nlead_id: ${opts.leadId}\nduplicate: ${opts.duplicate}`,
        }),
      });
    } catch {
      /* noop */
    }
  }
}

async function sendWhatsAppAutoReply(toE164Digits: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneId || toE164Digits.length < 10) return;

  const to = toE164Digits.startsWith("1") && toE164Digits.length === 11 ? toE164Digits : toE164Digits;

  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: "Gracias, te contactamos pronto.",
        },
      }),
    });
  } catch {
    /* noop */
  }
}

export function mergeAttribution(
  existing: Record<string, Json> | null,
  incoming: Record<string, Json | undefined>,
): Json {
  const base = (existing && typeof existing === "object" ? existing : {}) as Record<string, Json>;
  const prevTouches = Array.isArray(base.touches) ? base.touches : [];
  return {
    ...base,
    ...incoming,
    touches: [...prevTouches, incoming],
  } as Json;
}

/**
 * Intake unificado: normaliza, deduplica por teléfono/email, inserta o actualiza,
 * notifica navigator (Slack/Resend) y opcionalmente WhatsApp auto-reply en leads nuevos.
 * La tarea urgente «Contactar en <2h» la crea el trigger `08_sync_action_items_crm` al INSERT.
 */
export async function applyVitalisIntake(payload: VitalisIntakePayload): Promise<VitalisIntakeResult> {
  const full_name = payload.full_name?.trim();
  const phone = payload.phone?.trim();
  if (!full_name || !phone) {
    throw new Error("full_name and phone are required");
  }

  const phoneDigits = normalizePhoneDigits(phone);
  const emailNorm = normalizeEmail(payload.email);
  const consent = payload.consent_to_contact === true;
  const attribution = buildAttribution(payload);
  const today = new Date().toISOString().slice(0, 10);
  const channel = (payload.preferred_contact_channel ?? "WhatsApp") as
    | "WhatsApp"
    | "Phone"
    | "SMS"
    | "Email";

  const dup = await findDuplicateLead(phoneDigits, emailNorm);

  if (dup) {
    const mergedAttr = mergeAttribution(
      dup.intake_attribution as Record<string, Json> | null,
      attribution,
    );
    const noteLine = payload.source_channel
      ? `\n[intake ${new Date().toISOString()}] ${payload.source_channel}: ${payload.source_campaign ?? ""}`
      : `\n[intake ${new Date().toISOString()}] touch`;

    const { error: upErr } = await serviceClient
      .from("patient_leads")
      .update({
        last_intake_at: new Date().toISOString(),
        last_contact_date: today,
        intake_attribution: mergedAttr,
        notes: (dup.notes ?? "") + noteLine,
        consent_to_contact: dup.consent_to_contact || consent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dup.id);

    if (upErr) throw new Error(upErr.message);

    await notifyNavigators("Vitalis intake (duplicado)", `${full_name} — ${phone}`, {
      duplicate: true,
      leadId: dup.id,
    });

    return { lead_id: dup.id, duplicate: true };
  }

  const { data: lead, error: insErr } = await serviceClient
    .from("patient_leads")
    .insert({
      full_name,
      phone,
      email: emailNorm,
      preferred_language: (payload.preferred_language ?? "Spanish") as "Spanish" | "English" | "Bilingual",
      age_range: (payload.age_range ?? null) as
        | "18-24"
        | "25-34"
        | "35-44"
        | "45-54"
        | "55-64"
        | "65+"
        | null,
      gender: (payload.gender ?? null) as
        | "Female"
        | "Male"
        | "Non-binary"
        | "Prefer not to say"
        | null,
      condition_or_study_interest: payload.condition_or_study_interest?.trim() || null,
      source_campaign: payload.source_campaign?.trim() || null,
      zip_code: payload.zip_code?.trim() || null,
      preferred_contact_channel: channel,
      current_stage: "New Lead",
      next_action: "Contactar en <2h (WhatsApp o llamada)",
      screen_fail_reason: null,
      last_contact_date: today,
      consent_to_contact: consent,
      intake_attribution: { ...attribution, raw: payload.raw as Json } as Json,
      last_intake_at: new Date().toISOString(),
      notes: payload.source_channel
        ? `Intake: ${payload.source_channel}${payload.referral_code ? ` | ref: ${payload.referral_code}` : ""}`
        : null,
      archived: false,
    })
    .select("id")
    .single();

  if (insErr) throw new Error(insErr.message);

  await notifyNavigators("Vitalis intake (nuevo lead)", `${full_name} — ${phone}`, {
    duplicate: false,
    leadId: lead.id,
  });

  if (channel === "WhatsApp") {
    await sendWhatsAppAutoReply(phoneDigits);
  }

  return { lead_id: lead.id, duplicate: false };
}
