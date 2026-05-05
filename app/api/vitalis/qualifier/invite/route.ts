import { invitePrescreenBatch, invitePrescreenForLead } from "@/lib/vitalis/qualifier";
import { NextRequest, NextResponse } from "next/server";

/**
 * Invita prescreening (link Tally/Typeform + WhatsApp opcional).
 * POST `{ "lead_id": "uuid" }` para uno, o `{}` para batch (New Lead/Responded sin invitación previa).
 * Header opcional: `x-qualifier-secret: QUALIFIER_CRON_SECRET`
 */
export async function POST(req: NextRequest) {
  const secret = process.env.QUALIFIER_CRON_SECRET?.trim();
  if (secret && req.headers.get("x-qualifier-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const leadId = typeof body.lead_id === "string" ? body.lead_id : null;

    if (leadId) {
      const res = await invitePrescreenForLead(leadId);
      if (!res.ok) {
        return NextResponse.json({ error: res.error ?? "invite failed" }, { status: 422 });
      }
      return NextResponse.json({ ok: true, template: res.template.id, formUrl: res.formUrl });
    }

    const batch = await invitePrescreenBatch(typeof body.limit === "number" ? body.limit : 20);
    return NextResponse.json({ ok: true, invited: batch.invited, errors: batch.errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
