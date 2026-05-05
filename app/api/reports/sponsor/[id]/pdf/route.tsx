import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { SponsorReportPDF, type SponsorReportKpis } from "@/lib/reports/SponsorReportPDF";
import { createServerSideClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Alineado a `v_sponsor_report_kpis` / pipeline abierto en CRM. */
const OPEN_VILO_STATUSES = [
  "Lead Identified",
  "Outreach Sent",
  "Response Received",
  "Intro Call Pending",
  "Feasibility Sent",
  "Negotiation",
] as const;

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function kpiFromViewRow(row: Record<string, unknown> | null | undefined): SponsorReportKpis {
  if (!row) {
    return {
      active_opportunities: 0,
      pipeline_forecast: 0,
      leads_in_pipeline: 0,
      screened_scheduled: 0,
      completed_visits: 0,
      first_lead_date: null,
      last_activity_date: null,
    };
  }
  return {
    active_opportunities: toNum(row.active_opportunities),
    pipeline_forecast: toNum(row.pipeline_forecast),
    leads_in_pipeline: toNum(row.leads_in_pipeline),
    screened_scheduled: toNum(row.screened_scheduled),
    completed_visits: toNum(row.completed_visits),
    first_lead_date: (row.first_lead_date as string | null) ?? null,
    last_activity_date: (row.last_activity_date as string | null) ?? null,
  };
}

function safeFilenamePart(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 80) || "report";
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const companyId = params.id;

  try {
    const supabase = await createServerSideClient();

    const { data: company, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();

    if (orgError || !company) {
      return NextResponse.json({ error: "Sponsor no encontrado" }, { status: 404 });
    }

    const { data: kpiRow } = await supabase
      .from("v_sponsor_report_kpis")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    const { data: opportunities, error: oppError } = await supabase
      .from("vilo_opportunities")
      .select("*")
      .eq("org_id", companyId)
      .eq("archived", false)
      .in("status", [...OPEN_VILO_STATUSES])
      .order("potential_value", { ascending: false, nullsFirst: false });

    if (oppError) {
      console.error("[sponsor pdf id] opportunities", oppError);
      return NextResponse.json({ error: "Failed to load opportunities" }, { status: 500 });
    }

    const kpis = kpiFromViewRow(kpiRow as Record<string, unknown> | null | undefined);

    const generatedAt = new Date().toISOString();
    const buffer = await renderToBuffer(
      <SponsorReportPDF
        company={company}
        kpis={kpis}
        opportunities={opportunities ?? []}
        generatedAt={generatedAt}
      />,
    );

    const day = generatedAt.slice(0, 10);
    const filename = `ViloOS_Report_${safeFilenamePart(company.name)}_${day}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e) {
    console.error("[PDF Generation Error]:", e);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
