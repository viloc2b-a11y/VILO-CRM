import { fetchSponsorReportPayload } from "@/lib/reports/sponsor-report-data";
import { buildSponsorReportPdf } from "@/lib/reports/sponsor-pdf";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * PDF listo para adjuntar a email o descargar desde Sponsor dashboard.
 * Datos: vistas `03_sponsor_dashboard.sql` (mismo origen que `/api/reports/sponsor`).
 */
export async function GET() {
  try {
    const payload = await fetchSponsorReportPayload();
    const bytes = await buildSponsorReportPdf(payload);
    const buf = Buffer.from(bytes);
    const filename = `vilo-sponsor-report-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[sponsor pdf]", e);
    return NextResponse.json({ error: "pdf_generation_failed" }, { status: 500 });
  }
}
