import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service-role";

export async function GET() {
  const [{ data: weekly }, { data: sources }, { data: fails }] = await Promise.all([
    serviceClient.from("v_weekly_sponsor_report").select("*").single(),
    serviceClient.from("v_leads_by_source_30d").select("*"),
    serviceClient.from("v_screen_fail_insights").select("*").limit(3),
  ]);

  const w = weekly as {
    leads_this_week?: number;
    top_indication?: string | null;
    enrollment_rate_pct?: number;
    avg_hours_to_contact?: number | null;
  };

  const sponsorMessage = {
    en: `We currently generate ${w?.leads_this_week ?? 0} leads/week in ${w?.top_indication ?? "multiple indications"} with ${w?.enrollment_rate_pct ?? 0}% enrollment conversion and sub-${Math.ceil(w?.avg_hours_to_contact ?? 1)}-hour response time. Our bilingual team in Houston serves a diverse, high-engagement patient population.`,
    es: `Actualmente generamos ${w?.leads_this_week ?? 0} leads por semana en ${w?.top_indication ?? "múltiples indicaciones"} con ${w?.enrollment_rate_pct ?? 0}% de conversión a enrolamiento y tiempo de respuesta menor a ${Math.ceil(w?.avg_hours_to_contact ?? 1)} hora(s). Nuestro equipo bilingüe en Houston sirve una población diversa y de alto engagement.`,
  };

  return NextResponse.json({
    report: weekly,
    source_breakdown: sources ?? [],
    screen_fail_top3: fails ?? [],
    sponsor_message: sponsorMessage,
    generated_at: new Date().toISOString(),
  });
}
