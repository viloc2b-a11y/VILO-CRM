import { fetchSponsorReportPayload } from "@/lib/reports/sponsor-report-data";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const full = await fetchSponsorReportPayload();

    return NextResponse.json({
      report: full.report,
      source_breakdown: full.source_breakdown,
      screen_fail_top3: full.screen_fail_top.slice(0, 3),
      operational_counts: full.operational_counts,
      operational_data_connected: full.operational_data_connected,
      sponsor_message: full.sponsor_message,
      generated_at: full.generated_at,
    });
  } catch {
    return NextResponse.json({
      report: null,
      source_breakdown: [],
      screen_fail_top3: [],
      operational_counts: {
        opportunities: 0,
        studies: 0,
        communications: 0,
        patient_leads: 0,
        financial_items: 0,
      },
      operational_data_connected: false,
      sponsor_message: {
        en: "Sponsor intelligence is available once server data is connected.",
        es: "La inteligencia de sponsors estara disponible cuando los datos del servidor esten conectados.",
      },
      generated_at: new Date().toISOString(),
      warning: "Sponsor report data could not be loaded.",
    });
  }
}
