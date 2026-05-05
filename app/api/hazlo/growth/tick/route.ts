import { runGrowthTick } from "@/lib/hazlo/growth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cron: upsells +7 días tras `pdf_delivered_at` y `completion_status = PDF delivered`.
 * Requiere `HAZLO_GROWTH_BASE_URL`. Si definís `CRON_SECRET`, el header `x-cron-secret` debe coincidir;
 * si no está definida, no se exige (útil en local).
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const sent = req.headers.get("x-cron-secret");
    if (sent !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runGrowthTick();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
