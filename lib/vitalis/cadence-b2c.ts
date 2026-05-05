import type { VitalisStage } from "@/lib/constants";
import { sendEmail } from "@/lib/notifications/dispatcher";
import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";
import { normalizeWhatsAppRecipient, sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const CADENCE_STAGES: VitalisStage[] = [
  "New Lead",
  "Contact Attempted",
  "Responded",
  "Scheduled",
  "No-show",
];

const RECENT_INBOUND_HOURS = 48;

export type RunVitalisCadenceTickResult = {
  triggered: number;
  skipped: number;
};

type LeadRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  preferred_language: string;
  condition_or_study_interest: string | null;
  consent_flags: Json | null;
  current_stage: VitalisStage;
  updated_at: string;
  scheduled_visit_at: string | null;
};

function consentChannel(flags: Json | null, key: "whatsapp" | "email" | "sms"): boolean {
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) return false;
  return Boolean((flags as Record<string, boolean>)[key]);
}

function waLanguageCode(preferred: string): string {
  const p = (preferred || "").toLowerCase();
  if (p.startsWith("english")) return "en";
  return "es";
}

function prescreenUrl(): string {
  const u = process.env.VITALIS_PRESCREEN_URL?.trim() || process.env.NEXT_PUBLIC_VITALIS_PRESCREEN_URL?.trim();
  if (u) return u;
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  return base ? `${base.replace(/\/$/, "")}/onboarding` : "https://example.com/prescreen";
}

function welcomeTemplateName(): string {
  return process.env.VITALIS_WA_TEMPLATE_WELCOME?.trim() || "vitalis_welcome_prescreen";
}

async function hasRecentInbound(
  supabase: SupabaseClient,
  leadId: string,
  phoneDigits: string,
  sinceIso: string,
): Promise<boolean> {
  const { data: byLead } = await supabase
    .from("whatsapp_inbound_messages")
    .select("id")
    .eq("related_patient_lead_id", leadId)
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle();

  if (byLead) return true;

  if (phoneDigits.length >= 10) {
    const { data: byPhone } = await supabase
      .from("whatsapp_inbound_messages")
      .select("id")
      .eq("wa_phone_number", phoneDigits)
      .gte("created_at", sinceIso)
      .limit(1)
      .maybeSingle();
    if (byPhone) return true;
  }

  return false;
}

/** Inbound registrado en timeline (QuickLog / webhooks) — requiere migración `41_communications_log_patient_lead.sql`. */
async function hasRecentInboundCommLog(
  supabase: SupabaseClient,
  leadId: string,
  sinceIso: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("communications_log")
    .select("id")
    .eq("patient_lead_id", leadId)
    .eq("direction", "inbound")
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[cadence-b2c] communications_log inbound check:", error.message);
    return false;
  }
  return Boolean(data);
}

async function hasOpenCadenceTask(
  supabase: SupabaseClient,
  recordId: string,
  sourcePrefix: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("action_items")
    .select("id")
    .eq("record_id", recordId)
    .eq("record_type", "patient")
    .in("status", ["pending", "in_progress"])
    .like("source", `${sourcePrefix}%`)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function insertCadenceAction(
  supabase: SupabaseClient,
  params: {
    recordId: string;
    source: string;
    title: string;
    next_action: string;
    due_date: string;
    priority: "medium" | "high" | "critical";
  },
): Promise<boolean> {
  if (await hasOpenCadenceTask(supabase, params.recordId, params.source)) {
    return false;
  }

  const { error } = await supabase.from("action_items").insert({
    business_unit: "vitalis",
    record_type: "patient",
    record_id: params.recordId,
    title: params.title,
    status: "pending",
    priority: params.priority,
    next_action: params.next_action,
    due_date: params.due_date,
    owner_id: null,
    assigned_to: null,
    value_usd: null,
    notes: "Auto | cadencia B2C Vitalis",
    source: params.source,
  });

  if (error) {
    console.error("[cadence-b2c] action_items insert:", error.message);
    return false;
  }
  return true;
}

/**
 * Cadencia outbound Vitalis B2C (WhatsApp template / email Resend) + tareas para navigators.
 *
 * - Tabla real: `patient_leads` (no `patients`).
 * - Anti-spam 48h: `whatsapp_inbound_messages` y `communications_log` (inbound, `patient_lead_id`).
 *
 * Cron: usar **service role** (`serviceClient` por defecto), compatible con Cloudflare/Edge.
 */
export async function runVitalisCadenceTick(
  client?: SupabaseClient,
): Promise<RunVitalisCadenceTickResult> {
  const supabase = client ?? serviceClient;
  const now = new Date();
  let triggered = 0;
  let skipped = 0;

  const sinceInbound = new Date(now.getTime() - RECENT_INBOUND_HOURS * 3600000).toISOString();

  const { data: leads, error } = await supabase
    .from("patient_leads")
    .select(
      "id, full_name, phone, email, preferred_language, condition_or_study_interest, consent_flags, current_stage, updated_at, scheduled_visit_at",
    )
    .eq("archived", false)
    .in("current_stage", CADENCE_STAGES)
    .order("updated_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (!leads?.length) {
    return { triggered: 0, skipped: 0 };
  }

  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const today = now.toISOString().slice(0, 10);

  for (const p of leads as LeadRow[]) {
    const hoursSinceUpdate = (now.getTime() - new Date(p.updated_at).getTime()) / 3600000;
    const phoneDigits = normalizeWhatsAppRecipient(p.phone);

    const recentInbound =
      (await hasRecentInbound(supabase, p.id, phoneDigits, sinceInbound)) ||
      (await hasRecentInboundCommLog(supabase, p.id, sinceInbound));
    if (recentInbound) {
      skipped++;
      continue;
    }

    if (p.current_stage === "New Lead" && hoursSinceUpdate > 0.1) {
      let channel: "whatsapp" | "email" | "none" = "none";
      let success = false;

      if (phoneId && waToken && p.phone && consentChannel(p.consent_flags, "whatsapp")) {
        const res = await sendWhatsAppTemplate({
          phoneId,
          token: waToken,
          to: p.phone,
          templateName: welcomeTemplateName(),
          languageCode: waLanguageCode(p.preferred_language),
          variables: [
            p.full_name || "Paciente",
            p.condition_or_study_interest || "nuestro estudio",
            prescreenUrl(),
          ],
        });
        channel = "whatsapp";
        success = res.success;
      } else if (p.email && consentChannel(p.consent_flags, "email")) {
        const html = `<p>Hola ${p.full_name || "Paciente"}, gracias por tu interés en ${p.condition_or_study_interest ?? "Vitalis"}.</p><p>Completa el prescreening aquí:</p><p><a href="${prescreenUrl()}">Iniciar prescreening →</a></p>`;
        const res = await sendEmail(
          p.email,
          "Vitalis: prescreening disponible",
          html,
          { text: `Prescreening: ${prescreenUrl()}` },
        );
        channel = "email";
        success = res.ok;
      }

      if (success && channel !== "none") {
        const { error: upErr } = await supabase
          .from("patient_leads")
          .update({
            last_contact_channel: channel,
            last_contact_date: today,
            current_stage: "Contact Attempted",
            updated_at: now.toISOString(),
          })
          .eq("id", p.id);

        if (upErr) {
          console.error("[cadence-b2c] patient_leads update:", upErr.message);
        } else {
          triggered++;
        }
      } else {
        skipped++;
      }
      continue;
    } else if (p.current_stage === "Responded" && hoursSinceUpdate > 24) {
      const ok = await insertCadenceAction(supabase, {
        recordId: p.id,
        source: "cadence:vitalis:prescreen_followup",
        title: "Enviar link prescreening o agendar",
        next_action: "Revisar respuesta y avanzar etapa (Prequalified / Scheduled)",
        due_date: new Date(now.getTime() + 12 * 3600000).toISOString(),
        priority: "high",
      });
      if (ok) triggered++;
      else skipped++;
      continue;
    } else if (p.current_stage === "Scheduled") {
      const visitAt = p.scheduled_visit_at ? new Date(p.scheduled_visit_at).getTime() : null;
      const withinReminderWindow =
        visitAt != null &&
        visitAt - now.getTime() > 20 * 3600000 &&
        visitAt - now.getTime() < 30 * 3600000;

      let waSent = false;
      if (
        withinReminderWindow &&
        phoneId &&
        waToken &&
        p.phone &&
        consentChannel(p.consent_flags, "whatsapp")
      ) {
        const res = await sendWhatsAppTemplate({
          phoneId,
          token: waToken,
          to: p.phone,
          templateName:
            process.env.VITALIS_WA_TEMPLATE_VISIT_REMINDER?.trim() || "vitalis_visit_reminder_24h",
          languageCode: waLanguageCode(p.preferred_language),
          variables: [p.full_name || "Paciente", prescreenUrl()],
        });
        if (res.success) {
          const { error: upErr } = await supabase
            .from("patient_leads")
            .update({
              last_contact_channel: "whatsapp",
              last_contact_date: today,
              updated_at: now.toISOString(),
            })
            .eq("id", p.id);
          if (!upErr) {
            waSent = true;
            triggered++;
          }
        }
      }

      const taskOk = await insertCadenceAction(supabase, {
        recordId: p.id,
        source: "cadence:vitalis:visit_confirm",
        title: "Confirmar visita programada",
        next_action: "Recordatorio 24h antes (WhatsApp / llamada)",
        due_date: new Date(now.getTime() + 24 * 3600000).toISOString(),
        priority: "medium",
      });
      if (taskOk) triggered++;
      if (!waSent && !taskOk) skipped++;
      continue;
    } else if (p.current_stage === "No-show" && hoursSinceUpdate > 24) {
      const ok = await insertCadenceAction(supabase, {
        recordId: p.id,
        source: "cadence:vitalis:noshow",
        title: "Recontactar no-show",
        next_action: "Reagendar o archivar si no hay respuesta en 3 días",
        due_date: new Date(now.getTime() + 12 * 3600000).toISOString(),
        priority: "medium",
      });
      if (ok) triggered++;
      else skipped++;
      continue;
    } else {
      skipped++;
      continue;
    }
  }

  return { triggered, skipped };
}
