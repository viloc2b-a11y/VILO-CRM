import { applyVitalisIntake, enrichVitalisIntakeFromRawBody, type VitalisIntakePayload } from "@/lib/vitalis/intake";
import { NextRequest, NextResponse } from "next/server";

/** Formulario web / integraciones legacy: misma lógica que POST /api/vitalis/intake (sin secret). */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const mapped: VitalisIntakePayload = {
      full_name: String(body.full_name ?? ""),
      phone: String(body.phone ?? ""),
      email: (body.email as string | null | undefined) ?? null,
      preferred_language: (body.preferred_language as string | null | undefined) ?? "Spanish",
      age_range: (body.age_range as string | null | undefined) ?? null,
      gender: (body.gender as string | null | undefined) ?? null,
      condition_or_study_interest: (body.condition_or_study_interest as string | null | undefined) ?? null,
      zip_code: (body.zip_code as string | null | undefined) ?? null,
      preferred_contact_channel: (body.preferred_contact_channel as string | null | undefined) ?? "WhatsApp",
      source_channel: (body.source_channel as string | null | undefined) ?? "web_form",
      source_campaign: typeof body.source_campaign === "string" ? body.source_campaign : null,
      utm: (body.utm as VitalisIntakePayload["utm"]) ?? null,
      referral_code: (body.referral_code as string | null | undefined) ?? null,
      consent_to_contact: body.consent_to_contact === true,
    };
    const result = await applyVitalisIntake(enrichVitalisIntakeFromRawBody(mapped, body));
    return NextResponse.json(
      { success: true, lead_id: result.lead_id, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = msg.includes("required") ? 422 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
