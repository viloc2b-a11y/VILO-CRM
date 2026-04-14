import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { AgeRangeValue, PreferredLanguage } from "@/lib/supabase/types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

type LeadPayload = {
  full_name: string;
  phone: string;
  age_range?: string;
  condition_or_study_interest?: string;
  zip_code?: string;
  preferred_language?: PreferredLanguage;
  source_campaign?: string;
  source_channel?: string;
  email?: string;
};

const VALID_AGE_RANGES: AgeRangeValue[] = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const VALID_LANGUAGES: PreferredLanguage[] = ["Spanish", "English", "Bilingual"];

function validate(body: Partial<LeadPayload>): string[] {
  const errors: string[] = [];
  if (!body.full_name?.trim()) errors.push("full_name is required");
  if (!body.phone?.trim()) errors.push("phone is required");
  if (body.email && !body.email.includes("@")) errors.push("invalid email format");
  if (body.age_range?.trim() && !VALID_AGE_RANGES.includes(body.age_range as AgeRangeValue)) {
    errors.push("invalid age_range value");
  }
  if (body.preferred_language && !VALID_LANGUAGES.includes(body.preferred_language)) {
    errors.push("invalid preferred_language value");
  }
  return errors;
}

export async function POST(req: NextRequest) {
  let body: Partial<LeadPayload>;
  try {
    body = (await req.json()) as Partial<LeadPayload>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }

  const errors = validate(body);
  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 422, headers: corsHeaders });
  }

  const today = new Date().toISOString().slice(0, 10);
  const ageRange =
    body.age_range?.trim() && VALID_AGE_RANGES.includes(body.age_range as AgeRangeValue)
      ? (body.age_range as AgeRangeValue)
      : null;

  const lead = {
    full_name: body.full_name!.trim(),
    phone: body.phone!.trim(),
    email: body.email?.trim() || null,
    preferred_language: (body.preferred_language ?? "Spanish") as PreferredLanguage,
    age_range: ageRange,
    gender: null as null,
    condition_or_study_interest: body.condition_or_study_interest?.trim() || null,
    source_campaign: body.source_campaign?.trim() || null,
    zip_code: body.zip_code?.trim() || null,
    preferred_contact_channel: "WhatsApp" as const,
    current_stage: "New Lead" as const,
    next_action: "Initial contact via WhatsApp",
    screen_fail_reason: null as null,
    last_contact_date: today,
    notes: body.source_channel?.trim()
      ? `Source channel: ${body.source_channel.trim()}`
      : null,
    archived: false,
  };

  let sb;
  try {
    sb = createSupabaseServiceRoleClient();
  } catch (e) {
    console.error("[patient_leads] service client", e);
    return NextResponse.json(
      { error: "Server misconfiguration", detail: String(e) },
      { status: 500, headers: corsHeaders }
    );
  }

  const { data: newLead, error: insertError } = await sb
    .from("patient_leads")
    .insert(lead)
    .select("id, full_name, current_stage")
    .single();

  if (insertError || !newLead) {
    console.error("[patient_leads insert]", insertError);
    return NextResponse.json(
      { error: "Failed to save lead", detail: insertError?.message ?? "unknown" },
      { status: 500, headers: corsHeaders }
    );
  }

  const dueDate = today;
  const { error: taskError } = await sb.from("tasks").insert({
    title: `Contact new lead — ${newLead.full_name}`,
    channel: "vitalis",
    priority: "High",
    due_date: dueDate,
    done: false,
    linked_vitalis_id: newLead.id,
    linked_vilo_id: null,
  });

  if (taskError) {
    console.error("[task insert]", taskError);
  }

  return NextResponse.json(
    {
      success: true,
      lead_id: newLead.id,
      message: "Lead created successfully",
      task_created: !taskError,
    },
    { status: 201, headers: corsHeaders }
  );
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
}
