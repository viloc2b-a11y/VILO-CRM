import { runOrchestratorWorkloadTick } from "@/lib/orchestrator/workload";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cron: workload balancing (owners con >N tareas abiertas en action_items).
 * Las tareas regla-negocio las crea el trigger `orchestrator_on_change` en BD.
 *
 * Header `x-cron-secret` = CRON_SECRET si está definido.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const sent = req.headers.get("x-cron-secret");
    if (sent !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const limit = Number(process.env.ORCHESTRATOR_WORKLOAD_TASK_LIMIT ?? "10");
  const result = await runOrchestratorWorkloadTick(Number.isFinite(limit) ? limit : 10);
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
