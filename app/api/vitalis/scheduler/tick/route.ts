import { runVitalisSchedulerTick } from "@/lib/vitalis/scheduler";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cron: recordatorios de visita, flujo no-show, encuesta post-Enrolled.
 * Header `x-cron-secret` = CRON_SECRET (si está definido en el entorno).
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const sent = req.headers.get("x-cron-secret");
    if (sent !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runVitalisSchedulerTick();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "tick_failed", events: result.events },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, events: result.events });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
