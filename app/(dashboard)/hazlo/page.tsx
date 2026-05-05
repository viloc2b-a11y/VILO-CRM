import { HazloMetrics } from "./components/HazloMetrics";
import { HazloPipelineTable, type HazloPipelineRow } from "./components/HazloPipelineTable";
import { createServerSideClient } from "@/lib/supabase/server";
import type { Json, VHazloMetricsRow } from "@/lib/supabase/types";
import Link from "next/link";

function validationLabel(
  report: Json | null,
  ranAt: string | null,
  needsReview: boolean,
): string {
  if (needsReview) return "Revisión manual";
  if (!ranAt && !report) return "—";
  if (report && typeof report === "object" && !Array.isArray(report) && "overall" in report) {
    const o = (report as { overall?: string }).overall;
    if (o === "pass") return "OK";
    if (o === "fail") return "Falló";
    if (o === "needs_human_review") return "Humano";
  }
  return ranAt ? "Revisado" : "—";
}

function growthSummary(state: Json): string {
  if (!state || typeof state !== "object" || Array.isArray(state)) return "—";
  const s = state as Record<string, unknown>;
  if (typeof s.last_campaign_at === "string") return "Campaña enviada";
  if (s.evaluated_below_threshold === true) return "Bajo umbral";
  if (typeof s.last_score === "number") return `Score ${s.last_score}`;
  return "—";
}

type HazloSubmissionRow = {
  id: string;
  name: string | null;
  email: string | null;
  funnel_type: string | null;
  completion_status: string | null;
  payment_status?: string | null;
  validation_report?: Json | null;
  validation_ran_at?: string | null;
  growth_state?: Json | null;
  needs_manual_review?: boolean | null;
  created_at: string;
};

export default async function HazloPage() {
  const supabase = await createServerSideClient();

  let schemaWarning: string | null = null;
  const fullSubmissionsQuery = await supabase
    .from("submissions")
    .select(
      "id, name, email, funnel_type, completion_status, payment_status, validation_report, validation_ran_at, growth_state, needs_manual_review, created_at",
    )
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(100);

  let submissions = fullSubmissionsQuery.data as HazloSubmissionRow[] | null;
  let submissionsError = fullSubmissionsQuery.error;

  if (submissionsError) {
    schemaWarning =
      "Este Supabase no tiene todas las columnas operativas de Hazlo. El pipeline se muestra con datos core.";

    const coreWithArchive = await supabase
      .from("submissions")
      .select("id, name, email, funnel_type, completion_status, payment_status, created_at")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(100);

    submissions = coreWithArchive.data as HazloSubmissionRow[] | null;
    submissionsError = coreWithArchive.error;
  }

  if (submissionsError) {
    const coreNoArchive = await supabase
      .from("submissions")
      .select("id, name, email, funnel_type, completion_status, payment_status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    submissions = coreNoArchive.data as HazloSubmissionRow[] | null;
    submissionsError = coreNoArchive.error;
  }

  const [metricsRes, reviewQueueHead] = await Promise.all([
    supabase.from("v_hazlo_metrics").select("*").maybeSingle(),
    supabase.from("v_hazlo_review_queue").select("*", { count: "exact", head: true }),
  ]);

  const reviewQueueCount = reviewQueueHead.error ? 0 : (reviewQueueHead.count ?? 0);

  const metrics: VHazloMetricsRow | null = metricsRes.error ? null : (metricsRes.data as VHazloMetricsRow | null);
  const missingSubmissionsSchema =
    submissionsError?.message.includes("submissions") &&
    (submissionsError.message.includes("schema cache") || submissionsError.message.includes("does not exist"));

  const rows: HazloPipelineRow[] = (submissions ?? []).map((s) => {
    const validation = validationLabel(
      s.validation_report ?? null,
      s.validation_ran_at ?? null,
      Boolean(s.needs_manual_review),
    );
    const completion = s.completion_status ?? "";
    const needs_review =
      Boolean(s.needs_manual_review) ||
      validation === "Humano" ||
      validation === "Revisión manual" ||
      completion === "Ready for review";
    return {
      id: s.id,
      name: s.name ?? "Sin nombre",
      email: (s.email as string | null) ?? null,
      funnel_type: s.funnel_type ?? "sin_tipo",
      payment_status: (s.payment_status as string | null) ?? null,
      validation,
      growth: growthSummary(s.growth_state ?? null),
      created_at: s.created_at,
      needs_review,
    };
  });

  return (
    <div className="min-h-screen bg-clinical-paper/80">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-clinical-ink">HazloAsíYa — Pipeline</h1>
            <p className="mt-1 text-sm text-clinical-muted">
              Expedientes visibles según tu acceso a la unidad Hazlo (RLS).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="/hazlo/review"
              className="rounded px-3 py-1 text-sm bg-orange-100 text-orange-700 hover:bg-orange-200"
            >
              🔍 Revisión Manual ({reviewQueueCount})
            </Link>
            <Link
              href="/action-center?bu=hazloasiya"
              className="text-sm font-medium text-vilo-700 underline-offset-4 hover:underline"
            >
              Ver en Action Center →
            </Link>
          </div>
        </header>

        {schemaWarning ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {schemaWarning}
          </div>
        ) : null}

        {submissionsError && !missingSubmissionsSchema ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            Error cargando expedientes: {submissionsError.message}
          </div>
        ) : null}

        {missingSubmissionsSchema ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Modo estructura: falta la tabla <code>submissions</code> en Supabase. Aplica las migraciones de
            Hazlo para cargar expedientes reales.
          </div>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-clinical-muted">
            Métricas (30 días)
          </h2>
          <HazloMetrics data={metrics} loadError={Boolean(metricsRes.error)} />
        </section>
        <HazloPipelineTable initialSubmissions={rows} />
      </div>
    </div>
  );
}
