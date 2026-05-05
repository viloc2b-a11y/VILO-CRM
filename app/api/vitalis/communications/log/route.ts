import { createServerSideClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const CHANNELS = new Set(["email", "whatsapp", "sms", "call", "other"]);
const DIRECTIONS = new Set(["outbound", "inbound", "internal"]);

/**
 * Quick-log Vitalis → `communications_log` con `patient_lead_id`.
 * Sesión Supabase + RLS (`user_can_access_bu('vitalis')`).
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

  const patientLeadId = (body.patientLeadId as string | undefined)?.trim() || null;
  const recordType = String(body.recordType ?? "patient").toLowerCase();

  if (recordType !== "patient" || !patientLeadId) {
    return NextResponse.json(
      { error: "patientLeadId is required and recordType must be patient" },
      { status: 400 },
    );
  }

  const channel = String(body.channel ?? "whatsapp").toLowerCase();
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

  const { data, error } = await supabase
    .from("communications_log")
    .insert({
      patient_lead_id: patientLeadId,
      contact_id: null,
      org_id: null,
      opportunity_id: null,
      channel,
      direction: directionRaw as "outbound" | "inbound" | "internal",
      type,
      subject: subject ?? (type ? `Log: ${type}` : "Quick log"),
      body: textBody || null,
      metadata: { source: "quick_log_vitalis", user_id: user.id, record_type: "patient" },
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, success: true, id: data?.id });
}
