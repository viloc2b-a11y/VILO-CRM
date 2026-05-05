import { runOutreachTick } from "@/lib/vilo/outreach-cadence";
import { serviceClient } from "@/lib/supabase/service-role";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cron: cadencia B2B (emails Resend + action_items manuales).
 *
 * Header `x-cron-secret` = `CRON_SECRET` cuando `CRON_SECRET` está definido.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const sent = req.headers.get("x-cron-secret");
    if (sent !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runOutreachTick(serviceClient);
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
