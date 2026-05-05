import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";
import {
  pickQualifierTemplate,
  resolveFormUrl,
  type QualifierTemplate,
} from "@/lib/vitalis/qualifier-templates";
import { sendVitalisWhatsApp } from "@/lib/vitalis/whatsapp";

/** Umbrales MVP (ajustar por protocolo). */
const PASS_SCORE = 70;

export type PrescreenAnswers = {
  /** Edad dentro 18–65 */
  age_in_range?: boolean;
  /** Diagnóstico confirmado */
  diagnosis_confirmed?: boolean;
  /** Medicación actual documentada */
  current_medication_ok?: boolean;
  /** Distancia km al sitio (null = no contestó) */
  distance_km?: number | null;
  /** Disponibilidad de horarios */
  availability_ok?: boolean;
  /** Exclusiones explícitas del cuestionario (oncología, etc.) */
  hard_exclusion?: boolean;
  hard_exclusion_reason?: string | null;
};

function scoreAnswers(a: PrescreenAnswers): { score: number; exclusions: string[] } {
  const exclusions: string[] = [];
  let points = 0;
  const w = 20;

  if (a.hard_exclusion) {
    exclusions.push(a.hard_exclusion_reason ?? "Criterio de exclusión del cuestionario");
    return { score: 0, exclusions };
  }

  if (a.age_in_range === true) points += w;
  else exclusions.push(a.age_in_range === false ? "Edad fuera de rango 18–65" : "Edad no confirmada");

  if (a.diagnosis_confirmed === true) points += w;
  else
    exclusions.push(a.diagnosis_confirmed === false ? "Sin diagnóstico confirmado" : "Diagnóstico no confirmado");

  if (a.current_medication_ok === true) points += w;
  else
    exclusions.push(
      a.current_medication_ok === false ? "Medicación no cumple criterios" : "Medicación no informada",
    );

  if (a.distance_km != null && a.distance_km <= 50) points += w;
  else if (a.distance_km != null && a.distance_km > 50) exclusions.push("Ubicación >50 km");
  else exclusions.push("Distancia no informada o fuera de rango");

  if (a.availability_ok === true) points += w;
  else
    exclusions.push(
      a.availability_ok === false ? "Disponibilidad horaria insuficiente" : "Disponibilidad no confirmada",
    );

  return { score: Math.min(100, points), exclusions };
}

function parseAnswersFromBody(body: Record<string, unknown>): PrescreenAnswers {
  const nested = (body.answers as Record<string, unknown>) ?? body;
  return {
    age_in_range: nested.age_in_range as boolean | undefined,
    diagnosis_confirmed: nested.diagnosis_confirmed as boolean | undefined,
    current_medication_ok: nested.current_medication_ok as boolean | undefined,
    distance_km:
      nested.distance_km == null ? null : Number(nested.distance_km),
    availability_ok: nested.availability_ok as boolean | undefined,
    hard_exclusion: nested.hard_exclusion as boolean | undefined,
    hard_exclusion_reason: (nested.hard_exclusion_reason as string) ?? null,
  };
}

async function notifyQualifierResult(title: string, text: string) {
  const slackUrl = process.env.VITALIS_INTAKE_SLACK_WEBHOOK_URL?.trim();
  if (slackUrl) {
    try {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${title}\n${text}` }),
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
        body: JSON.stringify({ from, to: [to], subject: title, text }),
      });
    } catch {
      /* noop */
    }
  }
}

/**
 * Invita al prescreening: elige plantilla, envía link (WhatsApp si aplica),
 * pasa a `Prescreen Started`.
 */
export async function invitePrescreenForLead(leadId: string): Promise<{
  ok: boolean;
  template: QualifierTemplate;
  formUrl: string | null;
  error?: string;
}> {
  const { data: lead, error } = await serviceClient
    .from("patient_leads")
    .select("id, full_name, phone, notes, current_stage, condition_or_study_interest, preferred_contact_channel")
    .eq("id", leadId)
    .eq("archived", false)
    .maybeSingle();

  if (error) return { ok: false, template: pickQualifierTemplate(null), formUrl: null, error: error.message };
  if (!lead) return { ok: false, template: pickQualifierTemplate(null), formUrl: null, error: "Lead no encontrado" };

  const stage = lead.current_stage as string;
  if (stage !== "New Lead" && stage !== "Responded") {
    return {
      ok: false,
      template: pickQualifierTemplate(null),
      formUrl: null,
      error: `Etapa no elegible para invite: ${stage} (se espera New Lead o Responded)`,
    };
  }

  const template = pickQualifierTemplate(lead.condition_or_study_interest);
  const baseUrl = resolveFormUrl(template);
  if (!baseUrl) {
    return {
      ok: false,
      template,
      formUrl: null,
      error: `Falta URL del formulario (env ${template.formUrlEnv} o QUALIFIER_FORM_URL_DEFAULT)`,
    };
  }

  const sep = baseUrl.includes("?") ? "&" : "?";
  const formUrl = `${baseUrl}${sep}patient_lead_id=${encodeURIComponent(leadId)}`;

  const msg = `Hola ${lead.full_name.split(" ")[0] ?? ""}, completá el cuestionario de elegibilidad (${template.label}): ${formUrl}`;

  if (lead.preferred_contact_channel === "WhatsApp") {
    await sendVitalisWhatsApp(lead.phone, msg);
  }

  const { error: upErr } = await serviceClient
    .from("patient_leads")
    .update({
      current_stage: "Prescreen Started",
      prescreen_template_id: template.id,
      prescreen_invited_at: new Date().toISOString(),
      next_action: "Esperar respuesta del cuestionario de prescreening",
      notes: `${lead.notes ?? ""}\n[qualifier] Invitación enviada: ${template.id}`.trim(),
    })
    .eq("id", leadId);

  if (upErr) return { ok: false, template, formUrl, error: upErr.message };

  await notifyQualifierResult(
    "Qualifier — invitación prescreen",
    `${lead.full_name} (${leadId}) plantilla ${template.id}\n${formUrl}`,
  );

  return { ok: true, template, formUrl };
}

/**
 * Procesa resultado del cuestionario (webhook Tally/Typeform o JSON interno).
 * Body debe incluir `patient_lead_id` y `answers` (objeto o campos planos).
 */
export async function processPrescreenWebhook(body: Record<string, unknown>): Promise<{
  lead_id: string;
  score: number;
  passed: boolean;
  exclusions: string[];
}> {
  const leadId = String(body.patient_lead_id ?? body.patientLeadId ?? "");
  if (!leadId || leadId.length < 30) {
    throw new Error("patient_lead_id requerido");
  }

  const answers = parseAnswersFromBody(body);
  const { score, exclusions } = scoreAnswers(answers);
  const passed = score >= PASS_SCORE && exclusions.length === 0;

  const { data: existing, error: fetchErr } = await serviceClient
    .from("patient_leads")
    .select("notes, screen_fail_reason")
    .eq("id", leadId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing) throw new Error("Lead no encontrado");

  const exclusionsJson = exclusions.length ? exclusions : null;

  if (passed) {
    const { error: upErrPass } = await serviceClient
      .from("patient_leads")
      .update({
        current_stage: "Prequalified",
        prescreen_score: score,
        prescreen_exclusions: [] as unknown as Json,
        prescreen_completed_at: new Date().toISOString(),
        screen_fail_reason: null,
        next_action: "Agendar visita y confirmar documentos",
        notes:
          `${existing.notes ?? ""}\n[qualifier] PASS score=${score} — ${new Date().toISOString()}`.trim(),
      })
      .eq("id", leadId);
    if (upErrPass) throw new Error(upErrPass.message);
  } else {
    const reason =
      exclusions.length > 0
        ? exclusions.join("; ")
        : `Score ${score} < umbral ${PASS_SCORE}`;
    const { error: upErrFail } = await serviceClient
      .from("patient_leads")
      .update({
        current_stage: "Screen Fail",
        prescreen_score: score,
        prescreen_exclusions: (exclusionsJson ?? []) as unknown as Json,
        prescreen_completed_at: new Date().toISOString(),
        screen_fail_reason: reason,
        next_action: "Archivar lead + comunicar resultado al canal origen",
        notes:
          `${existing.notes ?? ""}\n[qualifier] FAIL score=${score} — ${reason} — ${new Date().toISOString()}`.trim(),
      })
      .eq("id", leadId);
    if (upErrFail) throw new Error(upErrFail.message);
  }

  await notifyQualifierResult(
    passed ? "Qualifier — PREQUALIFIED" : "Qualifier — SCREEN FAIL",
    `lead ${leadId} score=${score}\n${exclusions.join("\n") || "—"}`,
  );

  return { lead_id: leadId, score, passed, exclusions };
}

/** Busca leads elegibles y envía invitación (para cron). */
export async function invitePrescreenBatch(limit = 20): Promise<{ invited: number; errors: string[] }> {
  const { data: rows, error } = await serviceClient
    .from("patient_leads")
    .select("id")
    .eq("archived", false)
    .in("current_stage", ["New Lead", "Responded"])
    .is("prescreen_invited_at", null)
    .limit(limit);

  if (error) return { invited: 0, errors: [error.message] };

  const errors: string[] = [];
  let invited = 0;
  for (const r of rows ?? []) {
    const res = await invitePrescreenForLead(r.id);
    if (res.ok) invited++;
    else if (res.error) errors.push(`${r.id}: ${res.error}`);
  }
  return { invited, errors };
}
