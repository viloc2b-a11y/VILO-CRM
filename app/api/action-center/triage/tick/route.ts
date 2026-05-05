import { runTriageAgentTick } from "@/lib/triage/run";
import { NextRequest, NextResponse } from "next/server";

/**
 * Triage Agent 11: re-prioriza action_items abiertas (valor/urgencia/probabilidad).
 * Corre si pasó ≥1h desde la última corrida o si hay más de N tareas nuevas (default 5).
 * Header `x-cron-secret` = CRON_SECRET si está definido.
 *
 * Env opcional: TRIAGE_BURST_THRESHOLD, TRIAGE_MIN_INTERVAL_HOURS
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const sent = req.headers.get("x-cron-secret");
    if (sent !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const burst = Number(process.env.TRIAGE_BURST_THRESHOLD ?? "5");
  const minHours = Number(process.env.TRIAGE_MIN_INTERVAL_HOURS ?? "1");

  const result = await runTriageAgentTick({
    burstThreshold: Number.isFinite(burst) ? burst : 5,
    minIntervalHours: Number.isFinite(minHours) ? minHours : 1,
  });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
