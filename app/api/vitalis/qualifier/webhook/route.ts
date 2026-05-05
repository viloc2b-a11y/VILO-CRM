import { processPrescreenWebhook } from "@/lib/vitalis/qualifier";
import { NextRequest, NextResponse } from "next/server";

/**
 * Webhook post-cuestionario (Tally/Typeform/Make).
 * Body JSON debe incluir `patient_lead_id` (query hidden en el form) y `answers`:
 * `{ "age_in_range": true, "diagnosis_confirmed": true, "current_medication_ok": true,
 *    "distance_km": 12, "availability_ok": true, "hard_exclusion": false }`
 *
 * Header opcional: `x-qualifier-webhook-secret: QUALIFIER_WEBHOOK_SECRET`
 */
export async function POST(req: NextRequest) {
  const secret = process.env.QUALIFIER_WEBHOOK_SECRET?.trim();
  if (secret && req.headers.get("x-qualifier-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const result = await processPrescreenWebhook(body);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("requerido") || msg.includes("no encontrado") ? 422 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
