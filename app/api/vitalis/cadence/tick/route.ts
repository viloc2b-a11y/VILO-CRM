import { runVitalisCadenceTick } from "@/lib/vitalis/cadence-b2c";
import { serviceClient } from "@/lib/supabase/service-role";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cron: cadencia B2C Vitalis (WhatsApp / Resend + action_items).
 *
 * Header `x-cron-secret` = `CRON_SECRET` cuando `CRON_SECRET` está definido en el entorno.
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

  try {
    const result = await runVitalisCadenceTick(serviceClient);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "tick_failed";
    console.error("[vitalis cadence tick]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
