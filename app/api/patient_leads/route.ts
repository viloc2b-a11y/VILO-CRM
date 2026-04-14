import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service-role";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      full_name,
      phone,
      age_range,
      condition_or_study_interest,
      zip_code,
      preferred_language,
      source_campaign,
      source_channel,
    } = body;

    if (!full_name?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: "full_name and phone are required" }, { status: 422 });
    }

    const { data: lead, error: insertError } = await serviceClient
      .from("patient_leads")
      .insert({
        full_name: full_name.trim(),
        phone: phone.trim(),
        email: body.email?.trim() || null,
        preferred_language: preferred_language ?? "Spanish",
        age_range: age_range || null,
        gender: null,
        condition_or_study_interest: condition_or_study_interest?.trim() || null,
        source_campaign: source_campaign?.trim() || null,
        zip_code: zip_code?.trim() || null,
        preferred_contact_channel: "WhatsApp",
        current_stage: "New Lead",
        next_action: "Initial contact via WhatsApp",
        screen_fail_reason: null,
        last_contact_date: new Date().toISOString().slice(0, 10),
        notes: source_channel ? `Source: ${source_channel}` : null,
        archived: false,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[patient_leads insert]", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, lead_id: lead.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
