import { createServerSideClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/notifications/dispatcher";
import type { B2bLastInteractionType, ViloStage } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OutreachStep = {
  day: number;
  type: "email" | "linkedin" | "call" | "meeting";
  template: string;
};

/**
 * Keys are DB `vilo_opportunities.status` values (`vilo_stage` enum).
 * `day` = whole days since last anchor touch (see `anchorTimeMs`).
 */
const CADENCE: Partial<Record<ViloStage, OutreachStep[]>> = {
  "Lead Identified": [
    { day: 0, type: "email", template: "intro_sponsor" },
    { day: 3, type: "linkedin", template: "connect_sponsor" },
    { day: 7, type: "call", template: "followup_call" },
  ],
  "Outreach Sent": [
    { day: 2, type: "email", template: "case_study" },
    { day: 5, type: "call", template: "check_interest" },
  ],
};

/** Stages where automated / semi-automated cadence should not run (late or terminal). */
const CADENCE_EXCLUDED: ViloStage[] = ["Activated", "Closed Lost", "Nurture", "Negotiation"];

function anchorTimeMs(params: {
  last_contact_date: string | null;
  created_at: string;
  contact_updated_at: string | null;
}): number {
  const times: number[] = [new Date(params.created_at).getTime()];
  if (params.last_contact_date) {
    times.push(new Date(`${params.last_contact_date}T12:00:00.000Z`).getTime());
  }
  if (params.contact_updated_at) {
    times.push(new Date(params.contact_updated_at).getTime());
  }
  return Math.max(...times);
}

function daysSinceAnchor(anchorMs: number, now: Date): number {
  return Math.floor((now.getTime() - anchorMs) / 86_400_000);
}

export type RunOutreachTickResult = {
  triggered: number;
  skipped: number;
};

/**
 * Evalúa cadencias B2B y envía emails (Resend) o crea `action_items` para pasos manuales.
 *
 * Usar **service role** en cron (`serviceClient`) para evitar RLS; con sesión usuario, `createServerSideClient()`.
 */
export async function runOutreachTick(client?: SupabaseClient): Promise<RunOutreachTickResult> {
  const supabase = client ?? (await createServerSideClient());
  const now = new Date();
  let triggered = 0;
  let skipped = 0;

  const { data: opps, error } = await supabase
    .from("vilo_opportunities")
    .select(
      `
      id,
      org_id,
      contact_id,
      status,
      company_name,
      contact_name,
      email,
      last_contact_date,
      next_followup_date,
      next_follow_up,
      created_at,
      organization:organizations ( name, website ),
      contact:contacts ( id, full_name, email, role, updated_at )
    `,
    )
    .eq("archived", false)
    .not("status", "in", `(${CADENCE_EXCLUDED.map((s) => `"${s}"`).join(",")})`)
    .order("next_followup_date", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  if (!opps?.length) {
    return { triggered: 0, skipped: 0 };
  }

  const today = now.toISOString().slice(0, 10);
  const followupDate = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const dueTomorrow = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();

  for (const row of opps) {
    const r = row as Record<string, unknown>;
    const orgRaw = r.organization;
    const contactRaw = r.contact;
    const organization = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as {
      name: string;
      website: string | null;
    } | null;
    const primaryContact = (Array.isArray(contactRaw) ? contactRaw[0] : contactRaw) as {
      id: string;
      full_name: string;
      email: string | null;
      role: string | null;
      updated_at: string;
    } | null;

    const opp = {
      id: r.id as string,
      org_id: r.org_id as string | null,
      contact_id: r.contact_id as string | null,
      status: r.status as ViloStage,
      company_name: r.company_name as string,
      contact_name: r.contact_name as string | null,
      email: r.email as string | null,
      last_contact_date: r.last_contact_date as string | null,
      next_followup_date: r.next_followup_date as string | null,
      next_follow_up: r.next_follow_up as string | null,
      created_at: r.created_at as string,
      organization,
      contact: primaryContact,
    };

    const companyLabel = opp.company_name?.trim() || opp.organization?.name?.trim() || "your organization";

    /**
     * Si hubo actividad reciente en `communications_log` (últimos 3 días), distinta del envío de esta cadena,
     * pausar automatización y pasar a seguimiento manual.
     */
    const contactIdForGuard = primaryContact?.id ?? opp.contact_id;
    if (contactIdForGuard) {
      const recentCutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const { data: recentComms, error: recentErr } = await supabase
        .from("communications_log")
        .select("id")
        .eq("contact_id", contactIdForGuard)
        .gt("created_at", recentCutoff)
        .not("type", "eq", "outreach_cadence")
        .limit(1);

      if (recentErr) {
        console.warn("[outreach-cadence] recent comm guard:", recentErr.message);
      } else if (recentComms?.length) {
        const nextFollow = new Date(Date.now() + 5 * 86_400_000).toISOString();
        const { error: pauseErr } = await supabase
          .from("vilo_opportunities")
          .update({
            last_interaction_type: "email" satisfies B2bLastInteractionType,
            next_follow_up: nextFollow,
          })
          .eq("id", opp.id);

        if (pauseErr) {
          console.warn("[outreach-cadence] pause on recent touch:", pauseErr.message);
        } else {
          const { data: dupPause } = await supabase
            .from("action_items")
            .select("id")
            .eq("record_type", "opportunity")
            .eq("record_id", opp.id)
            .eq("source", "outreach_cadence_recent_touch")
            .in("status", ["pending", "in_progress"])
            .limit(1)
            .maybeSingle();

          if (!dupPause) {
            const dueManual = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
            const { error: taskErr } = await supabase.from("action_items").insert({
              business_unit: "vilo_research",
              record_type: "opportunity",
              record_id: opp.id,
              title: `Cadencia pausada: actividad reciente (${companyLabel})`,
              status: "pending",
              priority: "medium",
              next_action:
                "Revisar interacción reciente en communications_log y definir siguiente paso manual",
              due_date: dueManual,
              value_usd: null,
              source: "outreach_cadence_recent_touch",
            });
            if (taskErr) {
              console.warn("[outreach-cadence] pause task insert:", taskErr.message);
            }
          }
        }

        skipped++;
        continue;
      }
    }

    const steps = CADENCE[opp.status];
    if (!steps?.length) {
      skipped++;
      continue;
    }

    const contact = opp.contact;
    const emailTo = (contact?.email ?? opp.email)?.trim();
    if (!emailTo) {
      skipped++;
      continue;
    }

    const contactName = contact?.full_name?.trim() || opp.contact_name?.trim() || "there";

    const anchorMs = anchorTimeMs({
      last_contact_date: opp.last_contact_date,
      created_at: opp.created_at,
      contact_updated_at: contact?.updated_at ?? null,
    });
    const daysSince = daysSinceAnchor(anchorMs, now);
    const nextStep = steps.find((s) => s.day === daysSince);
    if (!nextStep) {
      skipped++;
      continue;
    }

    if (nextStep.type === "email") {
      const html = getTemplate(nextStep.template, { name: contactName, company: companyLabel });
      const subjectLine = `Vilo Research: ${nextStep.template.replaceAll("_", " ")}`;
      const sendResult = await sendEmail(emailTo, subjectLine, html, {
        text: stripHtml(html),
        idempotencyKey: `outreach:${opp.id}:${nextStep.template}:${today}`,
      });
      if (!sendResult.ok) {
        skipped++;
        continue;
      }

      const { error: upErr } = await supabase
        .from("vilo_opportunities")
        .update({
          last_interaction_type: "email" satisfies B2bLastInteractionType,
          last_contact_date: today,
          next_followup_date: followupDate,
          next_follow_up: "Cadencia outreach: siguiente toque sugerido en 3 días",
        })
        .eq("id", opp.id);

      if (upErr) {
        skipped++;
        continue;
      }

      if (sendResult.resendId) {
        const { error: logErr } = await supabase.from("communications_log").insert({
          contact_id: contact?.id ?? opp.contact_id,
          org_id: opp.org_id,
          opportunity_id: opp.id,
          channel: "email",
          direction: "outbound",
          type: "outreach_cadence",
          subject: subjectLine,
          body: null,
          metadata: {
            resend_email_id: sendResult.resendId,
            template: nextStep.template,
            idempotency_key: `outreach:${opp.id}:${nextStep.template}:${today}`,
          },
        });
        if (logErr) {
          console.warn("[outreach-cadence] communications_log insert:", logErr.message);
        }
      }
    } else {
      const { error: insErr } = await supabase.from("action_items").insert({
        business_unit: "vilo_research",
        record_type: "opportunity",
        record_id: opp.id,
        title: `Outreach: ${nextStep.type} — ${companyLabel}`,
        status: "pending",
        priority: "medium",
        next_action: `Ejecutar ${nextStep.type} (plantilla ${nextStep.template}, día ${nextStep.day})`,
        due_date: dueTomorrow,
        value_usd: null,
        source: "outreach_cadence",
      });

      if (insErr) {
        skipped++;
        continue;
      }
    }

    triggered++;
  }

  return { triggered, skipped };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getTemplate(key: string, ctx: { name?: string; company?: string }): string {
  const templates: Record<string, string> = {
    intro_sponsor: `<p>Hola ${escapeHtml(ctx.name ?? "")}, soy de Vilo Research. Vemos que ${escapeHtml(ctx.company ?? "su compañía")} trabaja en áreas terapéuticas alineadas con nuestras capacidades. ¿Tienen 15 min esta semana para explorar sinergia?</p>`,
    connect_sponsor: `<p>${escapeHtml(ctx.name ?? "")}, nos gustaría conectar en LinkedIn y compartir un breve contexto sobre cómo apoyamos estudios en su espacio terapéutico.</p>`,
    case_study: `<p>${escapeHtml(ctx.name ?? "")}, adjunto un caso de éxito reciente en reclutamiento acelerado. ¿Podría servir como referencia para sus estudios actuales?</p>`,
    check_interest: `<p>Solo seguimiento rápido. ¿Han avanzado en la evaluación de sites para sus próximos estudios? Estamos listos para apoyar.</p>`,
    followup_call: `<p>${escapeHtml(ctx.name ?? "")}, quedamos atentos para coordinar una llamada corta cuando les quede bien.</p>`,
  };
  return templates[key] ?? "<p>Seguimiento programado.</p>";
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
