import { fetchSponsorReportPayload } from "@/lib/reports/sponsor-report-data";
import { NextResponse } from "next/server";

export async function GET() {
  const full = await fetchSponsorReportPayload();

  return NextResponse.json({
    report: full.report,
    source_breakdown: full.source_breakdown,
    screen_fail_top3: full.screen_fail_top.slice(0, 3),
    sponsor_message: full.sponsor_message,
    generated_at: full.generated_at,
  });
}
