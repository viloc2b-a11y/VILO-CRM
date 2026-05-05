import { sendEmail, sendSlack } from "@/lib/notifications/dispatcher";
import { serviceClient } from "@/lib/supabase/service-role";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000"
  );
}

function opsEmailTo(): string | undefined {
  const raw = process.env.OPS_EMAIL?.trim() || process.env.ALERTS_EMAIL_TO?.trim();
  if (raw) return raw.split(",")[0]?.trim() || raw;
  return undefined;
}

function criticalSlackWebhook(): string | undefined {
  return (
    process.env.SLACK_CRITICAL_WEBHOOK?.trim() ||
    process.env.ALERTS_SLACK_WEBHOOK_URL?.trim() ||
    process.env.VITALIS_INTAKE_SLACK_WEBHOOK_URL?.trim() ||
    undefined
  );
}

/**
 * Cron: alertas para action_items críticas vencidas (pending / in_progress).
 * POST con `x-cron-secret` = `CRON_SECRET` cuando CRON_SECRET está definido.
 *
 * Anti-spam: fila en `notifications_log` (template critical_task_overdue + task_id) en las últimas 24h.
 * No actualiza `status` a overdue: en el esquema no existe ese valor (overdue es derivado por due_date).
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const sent = req.headers.get("x-cron-secret");
    if (sent !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date().toISOString();
  const cooldown = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: tasks, error: tasksErr } = await serviceClient
    .from("action_items")
    .select("id, title, business_unit, due_date, status, priority")
    .eq("priority", "critical")
    .in("status", ["pending", "in_progress"])
    .not("due_date", "is", null)
    .lt("due_date", now);

  if (tasksErr) {
    console.error("[tick-critical] action_items", tasksErr.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  if (!tasks?.length) {
    return NextResponse.json({ status: "no_tasks", count: 0 });
  }

  const to = opsEmailTo();
  const slackUrl = criticalSlackWebhook();
  const canEmail = !!(to && process.env.RESEND_API_KEY?.trim());
  const canSlack = !!slackUrl;
  if (!canEmail && !canSlack) {
    return NextResponse.json({ status: "no_channels", hint: "OPS_EMAIL/RESEND or SLACK_CRITICAL_WEBHOOK" });
  }

  const base = appBaseUrl();
  const actionCenterUrl = `${base.replace(/\/$/, "")}/action-center`;

  let notified = 0;

  for (const task of tasks) {
    const { data: recent } = await serviceClient
      .from("notifications_log")
      .select("id")
      .eq("template_key", "critical_task_overdue")
      .contains("payload", { task_id: task.id })
      .gt("created_at", cooldown)
      .limit(1)
      .maybeSingle();

    if (recent) continue;

    const bu = String(task.business_unit);
    const dueLabel = task.due_date ? new Date(task.due_date).toLocaleString("es-ES") : "—";
    const subject = `Tarea crítica vencida: ${bu}`;
    const html = `<h2>Acción requerida</h2><p><strong>${escapeHtml(task.title)}</strong></p><p>Unidad: ${escapeHtml(bu)}</p><p>Venció: ${escapeHtml(dueLabel)}</p><p><a href="${escapeHtml(actionCenterUrl)}">Ir al Action Center</a></p>`;
    const slackText = `*Tarea crítica vencida*\n${task.title}\n${bu}\nVenció: ${dueLabel}\n<${actionCenterUrl}|Action Center>`;

    let emailOk = false;
    if (canEmail && to) {
      emailOk = (
        await sendEmail(to, subject, html, { text: `${task.title}\n${bu}\nVenció: ${dueLabel}\n${actionCenterUrl}` })
      ).ok;
    }

    let slackOk = false;
    if (canSlack && slackUrl) {
      slackOk = await sendSlack(slackUrl, slackText, "#FF0000");
    }

    const channel: "email" | "slack" | "both" =
      canEmail && canSlack ? "both" : canEmail ? "email" : "slack";

    const anySent = emailOk || slackOk;
    const { error: logErr } = await serviceClient.from("notifications_log").insert({
      channel,
      recipient: to ?? null,
      subject,
      template_key: "critical_task_overdue",
      status: anySent ? "sent" : "failed",
      payload: { task_id: task.id, email_ok: emailOk, slack_ok: slackOk },
    });

    if (logErr) {
      console.error("[tick-critical] notifications_log", logErr.message);
    }

    if (anySent) notified++;
  }

  return NextResponse.json({ status: "processed", notified, scanned: tasks.length });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
