import { serviceClient } from "@/lib/supabase/service-role";
import type { Json, PatientLead, VitalisStage } from "@/lib/supabase/types";
import { buildSchedulerConfirmToken, parseSchedulerConfirmToken } from "@/lib/vitalis/scheduler-token";
import { sendVitalisWhatsApp } from "@/lib/vitalis/whatsapp";

type SchedulerSent = {
  t48_confirm?: string;
  t48_call?: string;
  t24_maps?: string;
  t2_ready?: string;
  no_show_wa?: string;
  no_show_call?: string;
  survey_24h?: string;
};

type SchedulerStateShape = {
  sent?: SchedulerSent;
  no_show_at?: string;
};

function appBase(): string {
  return (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

function parseState(raw: Json | null | undefined): SchedulerStateShape {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as SchedulerStateShape;
  }
  return {};
}

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3600000;
}

function formatVisitLocal(iso: string): string {
  const tz = process.env.SCHEDULER_DISPLAY_TZ?.trim() || "America/Mexico_City";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function mapsLink(address: string | null | undefined): string | null {
  const a = address?.trim();
  if (!a) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
}

function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const prefix = (process.env.TWILIO_E164_PREFIX?.trim() ?? "+52").replace(/\s/g, "");
  const p = prefix.startsWith("+") ? prefix : `+${prefix}`;
  return `${p}${digits}`;
}

async function twilioOutboundCall(e164: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_PHONE_NUMBER?.trim();
  const twimlUrl = process.env.TWILIO_REMINDER_TWIML_URL?.trim();
  if (!sid || !token || !from || !twimlUrl) return false;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = new URLSearchParams({ To: e164, From: from, Url: twimlUrl });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function patchSchedulerState(
  leadId: string,
  fn: (cur: SchedulerStateShape) => SchedulerStateShape
): Promise<void> {
  const { data: row } = await serviceClient
    .from("patient_leads")
    .select("scheduler_state")
    .eq("id", leadId)
    .maybeSingle();

  const cur = parseState(row?.scheduler_state);
  const next = fn(cur);
  await serviceClient.from("patient_leads").update({ scheduler_state: next as unknown as Json }).eq("id", leadId);
}

async function ensureActionItem(
  leadId: string,
  source: string,
  title: string,
  due: Date
): Promise<void> {
  const { data: existing } = await serviceClient
    .from("action_items")
    .select("id")
    .eq("record_id", leadId)
    .eq("record_type", "patient")
    .eq("source", source)
    .maybeSingle();
  if (existing) return;

  await serviceClient.from("action_items").insert({
    business_unit: "vitalis",
    record_type: "patient",
    record_id: leadId,
    title,
    status: "pending",
    next_action: title,
    due_date: due.toISOString(),
    priority: "medium",
    source,
    notes: "Vitalis scheduler agent",
  });
}

async function processVisitReminders(lead: PatientLead, now: Date, log: string[]): Promise<void> {
  const visitAt = lead.scheduled_visit_at;
  if (!visitAt) return;

  const stage = lead.current_stage as VitalisStage;
  if (stage !== "Scheduled" && stage !== "Visit Confirmed") return;

  const h = hoursBetween(now, new Date(visitAt));
  if (h <= 0) return;

  const state = parseState(lead.scheduler_state);
  const sent = state.sent ?? {};
  const t48Done = Boolean(sent.t48_confirm) || stage === "Visit Confirmed";

  const name = lead.full_name.split(/\s+/)[0] || "hola";
  const addr = lead.visit_site_address?.trim() || "nuestro centro";
  const dateStr = formatVisitLocal(visitAt);

  if (!lead.consent_to_contact) return;

  if (h <= 48 && h > 24 && !t48Done && stage === "Scheduled") {
    const token = buildSchedulerConfirmToken(lead.id);
    const confirm =
      token.length > 0
        ? `\n\nConfirma tu visita aquí: ${appBase()}/api/vitalis/scheduler/confirm?t=${encodeURIComponent(token)}`
        : "";
    const msg = `Hola ${name}, tienes visita programada para el ${dateStr}. ¿Confirmas tu asistencia? 📍 ${addr}${confirm}`;
    await sendVitalisWhatsApp(lead.phone, msg);
    await patchSchedulerState(lead.id, (c) => ({
      ...c,
      sent: { ...c.sent, t48_confirm: now.toISOString() },
    }));
    log.push(`visit_48h_wa:${lead.id}`);
    return;
  }

  if (
    stage === "Scheduled" &&
    sent.t48_confirm &&
    !sent.t48_call &&
    hoursBetween(new Date(sent.t48_confirm), now) >= 24
  ) {
    const e164 = toE164(lead.phone);
    if (e164) {
      const ok = await twilioOutboundCall(e164);
      if (ok) log.push(`visit_48h_call:${lead.id}`);
    }
    await patchSchedulerState(lead.id, (c) => ({
      ...c,
      sent: { ...c.sent, t48_call: now.toISOString() },
    }));
    return;
  }

  if (h <= 24 && h > 2 && !sent.t24_maps) {
    const m = mapsLink(lead.visit_site_address);
    const mapsLine = m ? `\n📍 Cómo llegar: ${m}` : "";
    const msg = `Recordatorio: mañana/tu visita es el ${dateStr}. ${mapsLine}\nTe esperamos en ${addr}.`;
    await sendVitalisWhatsApp(lead.phone, msg.trim());
    await patchSchedulerState(lead.id, (c) => ({
      ...c,
      sent: { ...c.sent, t24_maps: now.toISOString() },
    }));
    log.push(`visit_24h_wa:${lead.id}`);
    return;
  }

  if (h <= 2 && h > 0 && !sent.t2_ready) {
    const msg = `Hola ${name}, estamos listos para tu visita (${dateStr}). ¡Te esperamos! 📍 ${addr}`;
    await sendVitalisWhatsApp(lead.phone, msg);
    await patchSchedulerState(lead.id, (c) => ({
      ...c,
      sent: { ...c.sent, t2_ready: now.toISOString() },
    }));
    log.push(`visit_2h_wa:${lead.id}`);
  }
}

async function processNoShow(lead: PatientLead, now: Date, log: string[]): Promise<void> {
  if (lead.current_stage !== "No-show") return;

  const state = parseState(lead.scheduler_state);
  const sent = state.sent ?? {};
  const anchorIso = state.no_show_at;
  if (!anchorIso) {
    await patchSchedulerState(lead.id, (c) => ({
      ...c,
      no_show_at: now.toISOString(),
    }));
    return;
  }

  const anchor = new Date(anchorIso);
  const hoursSinceNoShow = hoursBetween(anchor, now);

  if (!lead.consent_to_contact) return;

  if (hoursSinceNoShow >= 1 && !sent.no_show_wa) {
    const name = lead.full_name.split(/\s+/)[0] || "hola";
    const msg = `Hola ${name}, notamos que no pudiste asistir. ¿Todo bien? ¿Quieres que reagendemos tu visita?`;
    await sendVitalisWhatsApp(lead.phone, msg);
    await patchSchedulerState(lead.id, (c) => ({
      ...c,
      sent: { ...c.sent, no_show_wa: now.toISOString() },
    }));
    log.push(`noshow_wa:${lead.id}`);
    return;
  }

  if (sent.no_show_wa && !sent.no_show_call && hoursBetween(new Date(sent.no_show_wa), now) >= 24) {
    const e164 = toE164(lead.phone);
    if (e164) await twilioOutboundCall(e164);
    await patchSchedulerState(lead.id, (c) => ({
      ...c,
      sent: { ...c.sent, no_show_call: now.toISOString() },
    }));
    log.push(`noshow_call:${lead.id}`);
    return;
  }

  if (
    sent.no_show_call &&
    hoursBetween(new Date(sent.no_show_call), now) >= 24
  ) {
    const reason =
      "Scheduler: sin respuesta tras no-show (WhatsApp + llamada). Marcado automático como Patient Lost.";
    await serviceClient
      .from("patient_leads")
      .update({
        current_stage: "Patient Lost",
        screen_fail_reason: reason,
      })
      .eq("id", lead.id)
      .eq("current_stage", "No-show");

    const due = new Date(now.getTime() + 7 * 86400000);
    await ensureActionItem(
      lead.id,
      "scheduler:retry_7d",
      "Reintentar contacto con paciente (Patient Lost) — ventana 7 días",
      due
    );
    log.push(`noshow_lost:${lead.id}`);
  }
}

async function processPostVisit(lead: PatientLead, now: Date, log: string[]): Promise<void> {
  if (lead.current_stage !== "Enrolled") return;
  const completed = lead.visit_completed_at;
  if (!completed) return;

  const state = parseState(lead.scheduler_state);
  const sent = state.sent ?? {};
  if (sent.survey_24h) return;

  if (hoursBetween(new Date(completed), now) < 24) return;

  if (!lead.consent_to_contact) return;

  const surveyUrl = process.env.VITALIS_SATISFACTION_SURVEY_URL?.trim();
  const name = lead.full_name.split(/\s+/)[0] || "hola";
  const linkLine = surveyUrl ? `\nEncuesta (1 min): ${surveyUrl}` : "";
  const msg = `Hola ${name}, gracias por tu visita. ¿Cómo fue tu experiencia?${linkLine}`;
  await sendVitalisWhatsApp(lead.phone, msg);
  await patchSchedulerState(lead.id, (c) => ({
    ...c,
    sent: { ...c.sent, survey_24h: now.toISOString() },
  }));
  log.push(`survey_24h:${lead.id}`);

  const followDue = new Date(now.getTime() + 3 * 86400000);
  await ensureActionItem(
    lead.id,
    "scheduler:post_enrolled_followup",
    "Follow-up protocolo post-visita (revisar notas y siguiente cita)",
    followDue
  );
}

export type VitalisSchedulerTickResult = {
  ok: boolean;
  events: string[];
  error?: string;
};

export async function confirmVisitFromToken(
  token: string
): Promise<{ ok: boolean; reason?: string }> {
  const parsed = parseSchedulerConfirmToken(token);
  if (!parsed) return { ok: false, reason: "invalid_or_expired_token" };

  const { data: lead } = await serviceClient
    .from("patient_leads")
    .select("id, current_stage")
    .eq("id", parsed.leadId)
    .eq("archived", false)
    .maybeSingle();

  if (!lead) return { ok: false, reason: "lead_not_found" };
  if (lead.current_stage !== "Scheduled") return { ok: false, reason: "not_scheduled" };

  const { error } = await serviceClient
    .from("patient_leads")
    .update({ current_stage: "Visit Confirmed" })
    .eq("id", parsed.leadId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Ejecutar un ciclo del scheduler (cron cada ~15–60 min).
 * Requiere `scheduled_visit_at` + `visit_site_address` para recordatorios previos a la visita.
 */
export async function runVitalisSchedulerTick(now = new Date()): Promise<VitalisSchedulerTickResult> {
  const events: string[] = [];
  try {
    const { data: leads, error } = await serviceClient
      .from("patient_leads")
      .select("*")
      .eq("archived", false)
      .in("current_stage", ["Scheduled", "Visit Confirmed", "No-show", "Enrolled"]);

    if (error) {
      return { ok: false, events, error: error.message };
    }

    for (const lead of (leads ?? []) as PatientLead[]) {
      await processVisitReminders(lead, now, events);
      await processNoShow(lead, now, events);
      await processPostVisit(lead, now, events);
    }

    return { ok: true, events };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, events, error: msg };
  }
}
