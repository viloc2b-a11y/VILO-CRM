import { ingestB2BLead, type B2BLeadInput } from "@/lib/vilo/intake-enrich";
import { serviceClient } from "@/lib/supabase/service-role";
import { NextRequest, NextResponse } from "next/server";

/**
 * Ingesta B2B (org dedupe + contact + `vilo_opportunities` + primer `action_item`).
 *
 * Si **`VILO_API_SECRET`** está definido, enviá header **`x-vilo-api-secret`** con el mismo valor.
 * Si no está definido, la ruta acepta POST sin ese header (solo desarrollo; en producción definí el secreto).
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.VILO_API_SECRET?.trim();
  if (secret) {
    const sent = req.headers.get("x-vilo-api-secret");
    if (sent !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lead = body as B2BLeadInput;
  if (!lead?.company_name?.trim() || !lead?.contact_name?.trim() || !lead?.company_type) {
    return NextResponse.json(
      { error: "company_name, contact_name, and company_type are required" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestB2BLead(lead, serviceClient);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
