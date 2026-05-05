import { runRecoveryTick } from "@/lib/hazlo/recovery";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cron: secuencia día 2 / 5 / 7, bump red, cierre día 8.
 * Compatible con cobros Square o Stripe: el tick solo mira `payment_status`,
 * `payment_failed_at` y `payment_recovery_state` (los webhooks actualizan eso).
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

  const result = await runRecoveryTick(25);
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
