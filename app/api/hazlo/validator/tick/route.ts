import { runValidatorTick } from "@/lib/hazlo/validator";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Procesa envíos en `Funnel completed` sin `validation_ran_at` (pipeline en `run.ts`).
 * Query opcional: `?batch=10` (1–50). Si `CRON_SECRET` está definido, enviá `x-cron-secret`.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const sent = req.headers.get("x-cron-secret");
    if (sent !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const raw = req.nextUrl.searchParams.get("batch");
  const n = raw != null ? Number.parseInt(raw, 10) : 10;
  const batchSize = Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 10;

  const result = await runValidatorTick(batchSize);
  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "validator-agent" });
}
