/**
 * Edge Function: Nurture Agent — secuencias de email para Vilo Research.
 *
 * Triggers: cron (recomendado cada 6–24 h). Evalúa `vilo_opportunities` abiertas.
 *
 * Mapeo brief → esquema real (`vilo_stage`):
 *   "Lead identified"     → `Lead Identified`
 *   "Contacted"           → `Outreach Sent` (+ días sin respuesta vía `last_contact_date` / `updated_at`)
 *   "Feasibility sent"    → `Feasibility Sent`
 *   "Budget negotiation"  → `Negotiation`
 *
 * Personalización MVP: `company_name`, `contact_name`, `therapeutic_area`, `priority`
 * (no existe `relationship_strength` → tono según `priority`).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM,
 *          NURTURE_FROM_NAME (opcional), CALENDAR_BOOKING_URL (link tipo Calendly),
 *          OPS_EMAIL (fallback si la oportunidad no tiene email de contacto),
 *          NURTURE_ACTIVITY_USER_ID (uuid de usuario auth para `activity_log`; opcional),
 *          NURTURE_ACTIVITY_USER_NAME (texto; default "Nurture Agent"),
 *          CRON_SECRET (opcional; header x-cron-secret).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@4.0.0";

type ViloStage =
  | "Lead Identified"
  | "Outreach Sent"
  | "Response Received"
  | "Intro Call Pending"
  | "Feasibility Sent"
  | "Negotiation"
  | "Activated"
  | "Closed Lost"
  | "Nurture";

type OppRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  status: ViloStage;
  therapeutic_area: string | null;
  priority: string;
  potential_value: number | null;
  last_contact_date: string | null;
  updated_at: string;
  nurture_last_sent_at: string | null;
  nurture_rules_fired: Record<string, string>;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function ruleAlreadySent(rules: Record<string, string>, key: string): boolean {
  return Boolean(rules[key]);
}

function toneFromPriority(p: string): { greeting: string; closing: string } {
  const x = (p || "").toLowerCase();
  if (x === "high") {
    return { greeting: "Queremos avanzar contigo con prioridad", closing: "Quedamos atentos a tu respuesta." };
  }
  if (x === "low") {
    return { greeting: "Te escribimos de forma breve", closing: "Cuando te encaje, nos escribes." };
  }
  return { greeting: "Te contactamos desde Vilo Research", closing: "Gracias por tu tiempo." };
}

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM") ?? "Vilo CRM <onboarding@resend.dev>";
  const calendarUrl = (Deno.env.get("CALENDAR_BOOKING_URL") ?? "").trim();
  const opsEmail = (Deno.env.get("OPS_EMAIL") ?? "").trim();
  const activityUserId = (Deno.env.get("NURTURE_ACTIVITY_USER_ID") ?? "").trim();
  const activityUserName = Deno.env.get("NURTURE_ACTIVITY_USER_NAME") ?? "Nurture Agent";

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const { data: rows, error: qErr } = await supabase
    .from("vilo_opportunities")
    .select(
      "id, company_name, contact_name, email, status, therapeutic_area, priority, potential_value, last_contact_date, updated_at, nurture_last_sent_at, nurture_rules_fired",
    )
    .eq("archived", false)
    .neq("status", "Closed Lost")
    .neq("status", "Activated")
    .neq("status", "Nurture");

  if (qErr) {
    return new Response(JSON.stringify({ error: qErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const opps = (rows ?? []) as OppRow[];
  const resend = resendKey ? new Resend(resendKey) : null;

  type SendPlan = {
    opp: OppRow;
    ruleKey: string;
    to: string;
    subject: string;
    html: string;
  };

  const plans: SendPlan[] = [];

  for (const opp of opps) {
    const rules = (opp.nurture_rules_fired && typeof opp.nurture_rules_fired === "object"
      ? opp.nurture_rules_fired
      : {}) as Record<string, string>;
    const to = (opp.email ?? "").trim() || opsEmail;
    if (!to) continue;

    const { greeting, closing } = toneFromPriority(opp.priority);
    const area = opp.therapeutic_area ? esc(opp.therapeutic_area) : "tu área terapéutica";
    const company = esc(opp.company_name);
    const who = opp.contact_name ? esc(opp.contact_name) : "equipo";

    const lastTouch = opp.last_contact_date
      ? new Date(opp.last_contact_date + "T12:00:00Z")
      : new Date(opp.updated_at);
    const daysQuiet = daysBetween(lastTouch, now);

    // 1) Lead Identified → intro + calendario (una vez por etapa; se resetea al cambiar status)
    if (opp.status === "Lead Identified" && !ruleAlreadySent(rules, "intro_lead_identified")) {
      const calHref = calendarUrl.replace(/[\u0000-\u001F"<>]/g, "");
      const cal = calHref
        ? `<p><a href="${calHref}">Agendar una intro (calendario)</a></p>`
        : "<p>Cuando puedas, respondé a este correo y coordinamos una llamada breve.</p>";
      plans.push({
        opp,
        ruleKey: "intro_lead_identified",
        to,
        subject: `${greeting} — ${opp.company_name}`,
        html: `<p>Hola ${who},</p>
<p>${greeting} respecto a <strong>${company}</strong> y <strong>${area}</strong>.</p>
${cal}
<p>${closing}</p>`,
      });
      continue;
    }

    // 2) Outreach Sent + ≥3 días sin actividad → follow-up #1 (equiv. "Contacted" del brief)
    if (opp.status === "Outreach Sent" && daysQuiet >= 3 && !ruleAlreadySent(rules, "followup_outreach_3d")) {
      plans.push({
        opp,
        ruleKey: "followup_outreach_3d",
        to,
        subject: `Seguimiento — ${opp.company_name}`,
        html: `<p>Hola ${who},</p>
<p>Te escribo de nuevo sobre nuestra propuesta con <strong>${company}</strong>. ¿Tuviste chance de revisar?</p>
<p>${closing}</p>`,
      });
      continue;
    }

    // 3) Feasibility Sent + ≥5 días → follow-up #2
    if (opp.status === "Feasibility Sent" && daysQuiet >= 5 && !ruleAlreadySent(rules, "followup_feasibility_5d")) {
      plans.push({
        opp,
        ruleKey: "followup_feasibility_5d",
        to,
        subject: `Viabilidad — ${opp.company_name}`,
        html: `<p>Hola ${who},</p>
<p>¿Podemos avanzar sobre la viabilidad enviada para <strong>${company}</strong>?</p>
<p>${closing}</p>`,
      });
      continue;
    }

    // 4) Negotiation → recordatorio + “case studies” (equiv. "Budget negotiation"; enlaces reales vía plantilla)
    if (opp.status === "Negotiation" && !ruleAlreadySent(rules, "negotiation_reminder_cases")) {
      plans.push({
        opp,
        ruleKey: "negotiation_reminder_cases",
        to,
        subject: `Negociación — materiales de referencia (${opp.company_name})`,
        html: `<p>Hola ${who},</p>
<p>Te dejamos a disposición <strong>case studies</strong> y referencias para cerrar la negociación con <strong>${company}</strong>.</p>
<p>${closing}</p>`,
      });
    }
  }

  const results: { rule: string; opp: string; ok: boolean; err?: string }[] = [];

  for (const p of plans) {
    let resendId: string | null = null;
    if (resend) {
      const { data, error: sendErr } = await resend.emails.send({
        from: resendFrom,
        to: [p.to],
        subject: p.subject,
        html: p.html,
      });
      if (sendErr) {
        results.push({ rule: p.ruleKey, opp: p.opp.id, ok: false, err: String(sendErr) });
        continue;
      }
      resendId = data?.id ?? null;
    } else {
      results.push({ rule: p.ruleKey, opp: p.opp.id, ok: false, err: "RESEND_API_KEY not set (dry skip)" });
      continue;
    }

    const prevRules = (p.opp.nurture_rules_fired && typeof p.opp.nurture_rules_fired === "object"
      ? p.opp.nurture_rules_fired
      : {}) as Record<string, string>;
    const nextRules = { ...prevRules, [p.ruleKey]: now.toISOString() };

    await supabase
      .from("vilo_opportunities")
      .update({
        nurture_last_sent_at: now.toISOString(),
        nurture_rules_fired: nextRules,
      })
      .eq("id", p.opp.id);

    await supabase.from("nurture_email_events").insert({
      opportunity_id: p.opp.id,
      rule_key: p.ruleKey,
      to_email: p.to,
      subject: p.subject,
      resend_id: resendId,
      metadata: { company_name: p.opp.company_name, status: p.opp.status },
    });

    if (activityUserId && /^[0-9a-f-]{36}$/i.test(activityUserId)) {
      await supabase.from("activity_log").insert({
        user_id: activityUserId,
        user_name: activityUserName,
        action: "nurture_email_sent",
        entity_type: "vilo_opportunity",
        entity_id: p.opp.id,
        entity_label: p.opp.company_name,
        metadata: { rule_key: p.ruleKey, to: p.to, subject: p.subject },
      });
    }

    const due = new Date(now.getTime() + 48 * 3600000).toISOString();
    await supabase.from("action_items").insert({
      business_unit: "vilo_research",
      record_type: "opportunity",
      record_id: p.opp.id,
      title: `Revisar respuesta nurture — ${p.opp.company_name}`,
      status: "pending",
      next_action: "Revisar respuesta del prospecto en ≤48h",
      due_date: due,
      owner_id: null,
      priority: "medium",
      value_usd: p.opp.potential_value ?? null,
      notes: `Regla: ${p.ruleKey}`,
      source: `agent:nurture:${p.ruleKey}`,
    });

    results.push({ rule: p.ruleKey, opp: p.opp.id, ok: true });
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      scanned: opps.length,
      sends: results.filter((r) => r.ok).length,
      results,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
