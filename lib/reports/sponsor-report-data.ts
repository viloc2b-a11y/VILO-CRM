import { getServiceClientOrNull } from "@/lib/supabase/service-role";

export type SponsorSourceRow = {
  source: string;
  total: number;
  enrolled: number;
  enrollment_rate_pct: number;
};

export type SponsorFailRow = {
  reason: string;
  count: number;
  pct: number;
};

export type SponsorPipelineRow = {
  stage: string;
  count: number;
  pct_of_total: number;
};

export type SponsorReportPayload = {
  report: Record<string, unknown> | null;
  enrollment_7d: Record<string, unknown> | null;
  execution: Record<string, unknown> | null;
  pipeline: SponsorPipelineRow[];
  source_breakdown: SponsorSourceRow[];
  screen_fail_top: SponsorFailRow[];
  operational_counts: {
    opportunities: number;
    studies: number;
    communications: number;
    patient_leads: number;
    financial_items: number;
  };
  operational_data_connected: boolean;
  sponsor_message: { en: string; es: string };
  generated_at: string;
};

function buildSponsorMessages(weekly: Record<string, unknown> | null): { en: string; es: string } {
  const w = weekly as {
    leads_this_week?: number;
    top_indication?: string | null;
    enrollment_rate_pct?: number;
    avg_hours_to_contact?: number | null;
  };
  return {
    en: `We currently generate ${w?.leads_this_week ?? 0} leads/week in ${w?.top_indication ?? "multiple indications"} with ${w?.enrollment_rate_pct ?? 0}% enrollment conversion and sub-${Math.ceil(w?.avg_hours_to_contact ?? 1)}-hour response time. Our bilingual team in Houston serves a diverse, high-engagement patient population.`,
    es: `Actualmente generamos ${w?.leads_this_week ?? 0} leads por semana en ${w?.top_indication ?? "múltiples indicaciones"} con ${w?.enrollment_rate_pct ?? 0}% de conversión a enrolamiento y tiempo de respuesta menor a ${Math.ceil(w?.avg_hours_to_contact ?? 1)} hora(s). Nuestro equipo bilingüe en Houston sirve una población diversa y de alto engagement.`,
  };
}

/** Datos alineados a vistas `03_sponsor_dashboard.sql` — usado por JSON API y PDF. */
export async function fetchSponsorReportPayload(): Promise<SponsorReportPayload> {
  const serviceClient = getServiceClientOrNull();

  if (!serviceClient) {
    return {
      report: null,
      enrollment_7d: null,
      execution: null,
      pipeline: [],
      source_breakdown: [],
      screen_fail_top: [],
      operational_counts: {
        opportunities: 0,
        studies: 0,
        communications: 0,
        patient_leads: 0,
        financial_items: 0,
      },
      operational_data_connected: false,
      sponsor_message: buildSponsorMessages(null),
      generated_at: new Date().toISOString(),
    };
  }

  const [
    { data: weekly },
    { data: enrollment7d },
    { data: execution },
    { data: pipeline },
    { data: sources },
    { data: fails },
    opportunitiesCount,
    studiesCount,
    communicationsCount,
    patientLeadsCount,
    financialItemsCount,
  ] = await Promise.all([
    serviceClient.from("v_weekly_sponsor_report").select("*").single(),
    serviceClient.from("v_enrollment_engine_7d").select("*").single(),
    serviceClient.from("v_execution_metrics").select("*").single(),
    serviceClient.from("v_pipeline_by_stage").select("*"),
    serviceClient.from("v_leads_by_source_30d").select("*"),
    serviceClient.from("v_screen_fail_insights").select("*").limit(5),
    serviceClient.from("vilo_opportunities").select("id", { count: "exact", head: true }).eq("archived", false).then((r) => r, () => ({ count: 0 })),
    serviceClient.from("studies").select("id", { count: "exact", head: true }).eq("archived", false).then((r) => r, () => ({ count: 0 })),
    serviceClient.from("communications_log").select("id", { count: "exact", head: true }).then((r) => r, () => ({ count: 0 })),
    serviceClient.from("patient_leads").select("id", { count: "exact", head: true }).eq("archived", false).then((r) => r, () => ({ count: 0 })),
    serviceClient.from("invoices").select("id", { count: "exact", head: true }).then((r) => r, () => ({ count: 0 })),
  ]);

  const report = (weekly ?? null) as Record<string, unknown> | null;
  const operationalCounts = {
    opportunities: opportunitiesCount.count ?? 0,
    studies: studiesCount.count ?? 0,
    communications: communicationsCount.count ?? 0,
    patient_leads: patientLeadsCount.count ?? 0,
    financial_items: financialItemsCount.count ?? 0,
  };
  const operationalDataConnected = Object.values(operationalCounts).some((count) => count > 0);

  return {
    report: operationalDataConnected ? report : null,
    enrollment_7d: (enrollment7d ?? null) as Record<string, unknown> | null,
    execution: (execution ?? null) as Record<string, unknown> | null,
    pipeline: (pipeline ?? []) as SponsorPipelineRow[],
    source_breakdown: (sources ?? []) as SponsorSourceRow[],
    screen_fail_top: (fails ?? []) as SponsorFailRow[],
    operational_counts: operationalDataConnected ? operationalCounts : { opportunities: 0, studies: 0, communications: 0, patient_leads: 0, financial_items: 0 },
    operational_data_connected: operationalDataConnected,
    sponsor_message: buildSponsorMessages(report),
    generated_at: new Date().toISOString(),
  };
}
