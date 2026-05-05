import { sendEmail, sendSlack } from "@/lib/notifications/dispatcher";
import { createServerSideClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service-role";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type NotifyChannel = "email" | "slack" | "both";

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

function opsSlackWebhook(): string | undefined {
  return (
    process.env.SLACK_OPS_WEBHOOK?.trim() ||
    process.env.ALERTS_SLACK_WEBHOOK_URL?.trim() ||
    process.env.VITALIS_INTAKE_SLACK_WEBHOOK_URL?.trim() ||
    undefined
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Solo enlaces del propio sitio bajo `/api/reports/`. */
function safeAbsoluteReportUrl(reportUrl: string): { ok: true; href: string } | { ok: false } {
  const base = appBaseUrl();
  try {
    const u = new URL(reportUrl.trim(), base);
    const origin = new URL(base).origin;
    if (u.origin !== origin) return { ok: false };
    if (!u.pathname.startsWith("/api/reports/")) return { ok: false };
    return { ok: true, href: u.href };
  } catch {
    return { ok: false };
  }
}

function parseChannel(v: unknown): NotifyChannel {
  if (v === "email" || v === "slack" || v === "both") return v;
  return "both";
}

async function isAuthorizedReportReady(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return true;

  const supabase = await createServerSideClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

/**
 * Notificación interna: reporte sponsor listo (PDF u otra URL bajo `/api/reports/`).
 *
 * Autorización: header `x-cron-secret` = `CRON_SECRET` **o** usuario con sesión Supabase (UI CRM).
 * Escritura en `notifications_log` vía **service role**.
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthorizedReportReady(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const company_name = typeof body.company_name === "string" ? body.company_name.trim() : "";
  const report_url_raw = typeof body.report_url === "string" ? body.report_url.trim() : "";
  const channel = parseChannel(body.channel);
  const recipientRaw = typeof body.recipient === "string" ? body.recipient.trim() : "";
  const company_id = typeof body.company_id === "string" ? body.company_id.trim() : undefined;

  if (!company_name || !report_url_raw) {
    return NextResponse.json({ error: "company_name_and_report_url_required" }, { status: 400 });
  }

  const urlCheck = safeAbsoluteReportUrl(report_url_raw);
  if (!urlCheck.ok) {
    return NextResponse.json({ error: "invalid_report_url" }, { status: 400 });
  }
  const reportHref = urlCheck.href;

  const to = recipientRaw || opsEmailTo();
  const slackUrl = opsSlackWebhook();

  const wantEmail = channel === "email" || channel === "both";
  const wantSlack = channel === "slack" || channel === "both";

  const canEmail = wantEmail && !!to && !!process.env.RESEND_API_KEY?.trim();
  const canSlack = wantSlack && !!slackUrl;

  if (!canEmail && !canSlack) {
    return NextResponse.json(
      { error: "no_channels", hint: "recipient/RESEND or SLACK_OPS_WEBHOOK / ALERTS_SLACK" },
      { status: 400 },
    );
  }

  const subject = `Reporte generado: ${company_name}`;
  const safeName = escapeHtml(company_name);
  const safeHref = escapeHtml(reportHref);
  const html = `<h2>Reporte listo para enviar</h2><p>Se generó el reporte de reclutamiento y pipeline para <strong>${safeName}</strong>.</p><p style="margin:16px 0;"><a href="${safeHref}" style="background:#4F46E5;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;">Descargar PDF</a></p><p>Documento confidencial. ViloOS CRM.</p>`;
  const slackText = `*Reporte generado*\n${company_name}\n<${reportHref}|Descargar PDF>`;

  let emailOk = false;
  if (canEmail && to) {
    emailOk = (
      await sendEmail(to, subject, html, {
        text: `${company_name}\n${reportHref}`,
      })
    ).ok;
  }

  let slackOk = false;
  if (canSlack && slackUrl) {
    slackOk = await sendSlack(slackUrl, slackText, "#36A64F");
  }

  const attemptedEmail = wantEmail && !!to && !!process.env.RESEND_API_KEY?.trim();
  const attemptedSlack = wantSlack && !!slackUrl;
  const emailFailed = attemptedEmail && !emailOk;
  const slackFailed = attemptedSlack && !slackOk;
  const success = !emailFailed && !slackFailed;

  const logChannel: NotifyChannel =
    channel === "both" ? "both" : channel === "email" ? "email" : "slack";

  const { error: logErr } = await serviceClient.from("notifications_log").insert({
    channel: logChannel,
    recipient: to ?? null,
    subject,
    template_key: "report_generated",
    status: success ? "sent" : "failed",
    payload: {
      company_name,
      company_id: company_id ?? null,
      url: reportHref,
      channel: logChannel,
      email_ok: emailOk,
      slack_ok: slackOk,
    },
  });

  if (logErr) {
    console.error("[report-ready] notifications_log", logErr.message);
  }

  return NextResponse.json({
    success,
    template: "report_generated",
    email_ok: attemptedEmail ? emailOk : null,
    slack_ok: attemptedSlack ? slackOk : null,
  });
}
