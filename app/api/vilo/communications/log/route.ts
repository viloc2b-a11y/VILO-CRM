import { createServerSideClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const CHANNELS = new Set(["email", "linkedin", "call", "meeting", "whatsapp", "other"]);
const DIRECTIONS = new Set(["outbound", "inbound", "internal"]);

/**
 * Alta manual en `communications_log` (Quick-Log UI). Sesión Supabase + RLS.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createServerSideClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contactId = (body.contactId as string | undefined)?.trim() || null;
  const orgId =
    (body.orgId as string | undefined)?.trim() ||
    (body.companyId as string | undefined)?.trim() ||
    null;
  const opportunityId =
    (body.opportunityId as string | undefined)?.trim() ||
    (body.oppId as string | undefined)?.trim() ||
    null;

  const channel = String(body.channel ?? "email").toLowerCase();
  const type = typeof body.type === "string" ? body.type.trim() || null : null;
  const textBody = typeof body.body === "string" ? body.body.trim() : "";
  const directionRaw = String(body.direction ?? "outbound").toLowerCase();
  const subject = typeof body.subject === "string" ? body.subject.trim() || null : null;

  if (!CHANNELS.has(channel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }
  if (!DIRECTIONS.has(directionRaw)) {
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  }
  if (!contactId && !orgId && !opportunityId) {
    return NextResponse.json(
      { error: "At least one of contactId, orgId, or opportunityId is required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("communications_log")
    .insert({
      contact_id: contactId,
      org_id: orgId,
      opportunity_id: opportunityId,
      channel,
      direction: directionRaw as "outbound" | "inbound" | "internal",
      type,
      subject: subject ?? (type ? `Log: ${type}` : "Quick log"),
      body: textBody || null,
      metadata: { source: "quick_log_ui", user_id: user.id },
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, success: true, id: data?.id });
}
