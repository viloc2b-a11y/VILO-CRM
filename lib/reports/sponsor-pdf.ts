import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";

import type { SponsorReportPayload } from "@/lib/reports/sponsor-report-data";

const MARGIN = 50;
const LINE_H = 14;
const TITLE_SIZE = 18;
const HEAD_SIZE = 11;
const BODY_SIZE = 9;
const PAGE_W = 595.28;
const PAGE_H = 841.89;

function fmt(v: unknown, suffix = ""): string {
  if (v == null || (typeof v === "number" && Number.isNaN(v))) return "—";
  if (typeof v === "string" || typeof v === "number") return `${v}${suffix}`;
  return String(v);
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? w.slice(0, maxChars) : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

type DrawCtx = {
  page: PDFPage;
  y: number;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  doc: PDFDocument;
};

function ensureSpace(ctx: DrawCtx, need: number) {
  if (ctx.y - need < MARGIN) {
    ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    ctx.y = PAGE_H - MARGIN;
  }
}

function drawTitle(ctx: DrawCtx, text: string) {
  ensureSpace(ctx, 40);
  ctx.page.drawText(text, {
    x: MARGIN,
    y: ctx.y,
    size: TITLE_SIZE,
    font: ctx.fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });
  ctx.y -= TITLE_SIZE + 8;
}

function drawSubtitle(ctx: DrawCtx, text: string) {
  ensureSpace(ctx, 24);
  ctx.page.drawText(text, {
    x: MARGIN,
    y: ctx.y,
    size: BODY_SIZE,
    font: ctx.font,
    color: rgb(0.35, 0.4, 0.48),
  });
  ctx.y -= LINE_H + 4;
}

function drawSection(ctx: DrawCtx, title: string) {
  ensureSpace(ctx, 28);
  ctx.page.drawText(title, {
    x: MARGIN,
    y: ctx.y,
    size: HEAD_SIZE,
    font: ctx.fontBold,
    color: rgb(0.12, 0.31, 0.55),
  });
  ctx.y -= HEAD_SIZE + 6;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y + 4 },
    end: { x: PAGE_W - MARGIN, y: ctx.y + 4 },
    thickness: 0.5,
    color: rgb(0.85, 0.88, 0.92),
  });
  ctx.y -= 8;
}

function drawKeyValue(ctx: DrawCtx, label: string, value: string) {
  const line = `${label}: ${value}`;
  ensureSpace(ctx, LINE_H);
  ctx.page.drawText(line.length > 95 ? `${line.slice(0, 92)}…` : line, {
    x: MARGIN,
    y: ctx.y,
    size: BODY_SIZE,
    font: ctx.font,
    color: rgb(0.15, 0.18, 0.22),
  });
  ctx.y -= LINE_H;
}

function drawParagraph(ctx: DrawCtx, text: string) {
  for (const line of wrapLines(text, 92)) {
    ensureSpace(ctx, LINE_H);
    ctx.page.drawText(line, {
      x: MARGIN,
      y: ctx.y,
      size: BODY_SIZE,
      font: ctx.font,
      color: rgb(0.2, 0.22, 0.28),
    });
    ctx.y -= LINE_H;
  }
  ctx.y -= 4;
}

export async function buildSponsorReportPdf(payload: SponsorReportPayload): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: DrawCtx = { page, y: PAGE_H - MARGIN, font, fontBold, doc };

  drawTitle(ctx, "VILO CRM — Sponsor & CRO Report");
  drawSubtitle(
    ctx,
    `Recruitment snapshot · Generated ${new Date(payload.generated_at).toUTCString()}`,
  );
  ctx.y -= 8;

  const wk = payload.report ?? {};

  drawSection(ctx, "Weekly metrics (current week)");
  drawKeyValue(ctx, "Week of", fmt(wk.week_of));
  drawKeyValue(ctx, "Leads this week", fmt(wk.leads_this_week));
  drawKeyValue(ctx, "Enrolled this week", fmt(wk.enrolled_this_week));
  drawKeyValue(ctx, "Enrollment rate", fmt(wk.enrollment_rate_pct, "%"));
  drawKeyValue(ctx, "Conversion rate", fmt(wk.conversion_rate_pct, "%"));
  drawKeyValue(ctx, "Avg hours to contact", fmt(wk.avg_hours_to_contact));
  drawKeyValue(ctx, "Top indication", fmt(wk.top_indication));
  drawKeyValue(ctx, "Top indication leads", fmt(wk.top_indication_leads));
  ctx.y -= 6;

  const e7 = payload.enrollment_7d ?? {};
  drawSection(ctx, "Enrollment engine (7 days)");
  drawKeyValue(ctx, "Total leads (7d)", fmt(e7.total_leads));
  drawKeyValue(ctx, "Prescreen rate", fmt(e7.prescreen_rate_pct, "%"));
  drawKeyValue(ctx, "Eligible rate", fmt(e7.eligible_rate_pct, "%"));
  drawKeyValue(ctx, "Enrollment rate (7d)", fmt(e7.enrollment_rate_pct, "%"));
  drawKeyValue(ctx, "Show rate", fmt(e7.show_rate_pct, "%"));
  drawKeyValue(ctx, "Avg hours to contact", fmt(e7.avg_hours_to_contact));
  ctx.y -= 6;

  const ex = payload.execution ?? {};
  drawSection(ctx, "Execution & operations");
  drawKeyValue(ctx, "Scheduled this week", fmt(ex.scheduled_this_week));
  drawKeyValue(ctx, "Enrolled this month", fmt(ex.enrolled_this_month));
  drawKeyValue(ctx, "No-show rate", fmt(ex.no_show_rate_pct, "%"));
  drawKeyValue(ctx, "Overdue follow-ups", fmt(ex.overdue_followups_count));
  ctx.y -= 6;

  drawSection(ctx, "Pipeline by stage");
  for (const row of payload.pipeline) {
    drawKeyValue(ctx, row.stage, `${row.count} (${fmt(row.pct_of_total, "%")} of active)`);
  }
  if (!payload.pipeline.length) drawParagraph(ctx, "No pipeline rows.");
  ctx.y -= 6;

  drawSection(ctx, "Lead sources (30 days)");
  for (const s of payload.source_breakdown) {
    drawKeyValue(
      ctx,
      s.source,
      `n=${s.total} enrolled=${s.enrolled} (${fmt(s.enrollment_rate_pct, "%")})`,
    );
  }
  if (!payload.source_breakdown.length) drawParagraph(ctx, "No source breakdown.");
  ctx.y -= 6;

  drawSection(ctx, "Screen fail insights (top)");
  for (const f of payload.screen_fail_top) {
    drawKeyValue(ctx, f.reason, `${f.count} (${fmt(f.pct, "%")})`);
  }
  if (!payload.screen_fail_top.length) drawParagraph(ctx, "No screen-fail data.");
  ctx.y -= 6;

  drawSection(ctx, "Sponsor narrative");
  drawParagraph(ctx, "English");
  drawParagraph(ctx, payload.sponsor_message.en);
  drawParagraph(ctx, "Español");
  drawParagraph(ctx, payload.sponsor_message.es);

  if (ctx.y < MARGIN + 24) {
    ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    ctx.y = PAGE_H - MARGIN;
  }
  ctx.page.drawText("Confidential — for sponsor / CRO use only.", {
    x: MARGIN,
    y: MARGIN,
    size: 8,
    font: ctx.font,
    color: rgb(0.5, 0.52, 0.55),
  });

  return doc.save();
}
