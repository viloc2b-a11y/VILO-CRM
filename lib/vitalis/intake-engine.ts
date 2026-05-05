import { resolveCampaignNameFromUtm } from "@/lib/vitalis/campaign-aliases";
import { mergeAttribution } from "@/lib/vitalis/intake";
import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";

export type B2CLeadInput = {
  name?: string;
  phone?: string;
  email?: string;
  language?: string;
  condition_interest?: string;
  source: "meta" | "whatsapp" | "web" | "craigslist" | "referral" | "walkin";
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  consent: { sms: boolean; whatsapp: boolean; email: boolean; data: boolean };
  ip?: string;
  user_agent?: string;
};

function normalizePhoneE164(phone?: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length < 10) return null;
  return `+${cleaned}`;
}

function normalizeEmail(email?: string): string | null {
  if (email == null) return null;
  const t = email.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

function mapLanguage(lang?: string): "Spanish" | "English" | "Bilingual" {
  const l = lang?.toLowerCase();
  if (l === "en" || l === "english") return "English";
  if (l === "bilingual" || l === "bi") return "Bilingual";
  return "Spanish";
}

function inferPreferredContactChannel(lead: B2CLeadInput): "WhatsApp" | "SMS" | "Email" | "Phone" {
  if (lead.consent.whatsapp) return "WhatsApp";
  if (lead.consent.sms) return "SMS";
  if (lead.consent.email) return "Email";
  return "WhatsApp";
}

function lastContactChannelFromConsent(lead: B2CLeadInput): "sms" | "whatsapp" | "email" | "none" {
  if (lead.consent.whatsapp) return "whatsapp";
  if (lead.consent.sms) return "sms";
  if (lead.consent.email) return "email";
  return "none";
}

function consentFlagsJson(lead: B2CLeadInput): Json {
  return {
    sms: lead.consent.sms,
    whatsapp: lead.consent.whatsapp,
    email: lead.consent.email,
    data: lead.consent.data,
  } as Json;
}

function mergeConsentFlags(existing: unknown, lead: B2CLeadInput): Json {
  const p =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, boolean>)
      : {};
  return {
    sms: Boolean(p.sms) || lead.consent.sms,
    whatsapp: Boolean(p.whatsapp) || lead.consent.whatsapp,
    email: Boolean(p.email) || lead.consent.email,
    data: Boolean(p.data) || lead.consent.data,
  } as Json;
}

function buildB2CAttribution(lead: B2CLeadInput): Record<string, Json | undefined> {
  const campaignRaw = lead.utm_campaign?.trim() ?? "";
  const source_campaign =
    (campaignRaw ? resolveCampaignNameFromUtm(campaignRaw) : "") || lead.source || "Organic";
  return {
    utm_source: lead.utm_source?.trim() || undefined,
    utm_medium: lead.utm_medium?.trim() || undefined,
    utm_campaign: campaignRaw || undefined,
    source_channel: lead.source,
    source_campaign,
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
    .select(
      "id, intake_attribution, notes, consent_to_contact, current_stage, consent_flags, assigned_navigator",
    )
    .eq("archived", false)
    .or(ors.join(","))
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function insertConsentAuditRows(leadId: string, lead: B2CLeadInput) {
  const rows: Array<{
    patient_lead_id: string;
    channel: "sms" | "whatsapp" | "email" | "web_form";
    granted: boolean;
    source: string;
    ip_address: string | null;
    user_agent: string | null;
  }> = [];

  if (lead.consent.sms) {
    rows.push({
      patient_lead_id: leadId,
      channel: "sms",
      granted: true,
      source: lead.source,
      ip_address: lead.ip ?? null,
      user_agent: lead.user_agent ?? null,
    });
  }
  if (lead.consent.whatsapp) {
    rows.push({
      patient_lead_id: leadId,
      channel: "whatsapp",
      granted: true,
      source: lead.source,
      ip_address: lead.ip ?? null,
      user_agent: lead.user_agent ?? null,
    });
  }
  if (lead.consent.email) {
    rows.push({
      patient_lead_id: leadId,
      channel: "email",
      granted: true,
      source: lead.source,
      ip_address: lead.ip ?? null,
      user_agent: lead.user_agent ?? null,
    });
  }
  if (lead.consent.data) {
    rows.push({
      patient_lead_id: leadId,
      channel: "web_form",
      granted: true,
      source: lead.source,
      ip_address: lead.ip ?? null,
      user_agent: lead.user_agent ?? null,
    });
  }

  if (rows.length === 0) return;

  const { error } = await serviceClient.from("vitalis_consent_log").insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * Intake B2C unificado: `patient_leads` + `vitalis_consent_log`, dedup por teléfono/email normalizados.
 * Usa **service role** (sin cookie) para formularios públicos y webhooks.
 *
 * No escribe en `communications_log` (tabla B2B ligada a `contacts` / oportunidades).
 * El trigger `sync_action_items_from_crm` crea el `action_item`; aquí se ajusta due_date a ~2h y prioridad crítica.
 */
export async function ingestB2CLead(lead: B2CLeadInput): Promise<{
  patientId: string;
  status: "created" | "updated";
}> {
  const hasDataConsent = lead.consent.data;
  const hasChannelConsent = lead.consent.sms || lead.consent.whatsapp || lead.consent.email;
  if (!hasDataConsent || !hasChannelConsent) {
    throw new Error("Consentimiento mínimo requerido (datos + 1 canal)");
  }

  const phoneE164 = normalizePhoneE164(lead.phone);
  const emailNorm = normalizeEmail(lead.email);
  const phoneDigits = (lead.phone ?? "").replace(/\D/g, "");

  if (!phoneE164 && !emailNorm) {
    throw new Error("Se requiere teléfono válido o email");
  }

  const dup = await findDuplicateLead(phoneDigits, emailNorm);

  const attribution = buildB2CAttribution(lead);
  const today = new Date().toISOString().slice(0, 10);
  const consentToContact = true;
  const prefChannel = inferPreferredContactChannel(lead);
  const lastTouch = lastContactChannelFromConsent(lead);

  const full_name =
    lead.name?.trim() ||
    (phoneE164 ? `Lead ${phoneE164.slice(-4)}` : emailNorm ? `Lead ${emailNorm.split("@")[0]}` : "Lead");

  if (dup) {
    const mergedAttr = mergeAttribution(
      dup.intake_attribution as Record<string, Json> | null,
      attribution,
    );
    const noteLine = `\n[b2c intake ${new Date().toISOString()}] ${lead.source} | utm: ${lead.utm_campaign ?? ""}`;

    const nextStage =
      dup.current_stage === "New Lead" ? ("New Lead" as const) : ("Responded" as const);

    const { error: upErr } = await serviceClient
      .from("patient_leads")
      .update({
        last_intake_at: new Date().toISOString(),
        last_contact_date: today,
        last_contact_channel: lastTouch === "none" ? null : lastTouch,
        intake_attribution: mergedAttr,
        utm_source: lead.utm_source?.trim() || null,
        utm_campaign: lead.utm_campaign?.trim() || null,
        utm_medium: lead.utm_medium?.trim() || null,
        consent_flags: mergeConsentFlags(dup.consent_flags, lead),
        notes: (dup.notes ?? "") + noteLine,
        consent_to_contact: dup.consent_to_contact || consentToContact,
        current_stage: nextStage,
        preferred_contact_channel: prefChannel,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dup.id);

    if (upErr) throw new Error(upErr.message);

    await insertConsentAuditRows(dup.id, lead);

    return { patientId: dup.id, status: "updated" };
  }

  if (!phoneE164) {
    throw new Error("Teléfono obligatorio para crear un lead nuevo (esquema patient_leads.phone NOT NULL)");
  }

  const source_campaign =
    (lead.utm_campaign?.trim() ? resolveCampaignNameFromUtm(lead.utm_campaign.trim()) : "") ||
    lead.source;

  const { data: inserted, error: insErr } = await serviceClient
    .from("patient_leads")
    .insert({
      full_name,
      phone: phoneE164,
      email: emailNorm,
      preferred_language: mapLanguage(lead.language),
      age_range: null,
      gender: null,
      condition_or_study_interest: lead.condition_interest?.trim() || null,
      source_campaign: source_campaign || null,
      zip_code: null,
      preferred_contact_channel: prefChannel,
      current_stage: "New Lead",
      next_action: "Contactar en <2h (WhatsApp o llamada)",
      screen_fail_reason: null,
      last_contact_date: today,
      last_contact_channel: lastTouch === "none" ? null : lastTouch,
      consent_to_contact: consentToContact,
      consent_flags: consentFlagsJson(lead),
      utm_source: lead.utm_source?.trim() || null,
      utm_campaign: lead.utm_campaign?.trim() || null,
      utm_medium: lead.utm_medium?.trim() || null,
      intake_attribution: { ...attribution, b2c_source: lead.source } as Json,
      last_intake_at: new Date().toISOString(),
      notes: `B2C intake: ${lead.source}`,
      archived: false,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) throw new Error(insErr?.message ?? "Failed to create patient_lead");

  const leadId = inserted.id;

  const { data: navigatorRaw, error: rpcErr } = await serviceClient.rpc("assign_navigator_round_robin", {
    p_lead_id: leadId,
  });

  if (rpcErr) {
    console.error("assign_navigator_round_robin:", rpcErr.message);
  } else {
    const navigatorId = typeof navigatorRaw === "string" && navigatorRaw.length > 0 ? navigatorRaw : null;
    if (navigatorId) {
      await serviceClient.from("patient_leads").update({ assigned_navigator: navigatorId }).eq("id", leadId);
    }
  }

  await insertConsentAuditRows(leadId, lead);

  const due2h = new Date(Date.now() + 2 * 3600000).toISOString();
  await serviceClient
    .from("action_items")
    .update({
      due_date: due2h,
      priority: "critical",
      next_action: "Enviar WhatsApp/SMS de bienvenida + link prescreen",
    })
    .eq("record_id", leadId)
    .eq("record_type", "patient")
    .like("source", "trigger:sync:patient_lead%");

  return { patientId: leadId, status: "created" };
}
