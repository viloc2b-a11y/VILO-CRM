import { VitalisPipelineTable, type VitalisPipelineRow } from "./components/PipelineTable";
import { createServerSideClient } from "@/lib/supabase/server";
import type { VitalisStage } from "@/lib/constants";

export const dynamic = "force-dynamic";

type VitalisLeadRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  source_campaign: string | null;
  current_stage: string;
  last_contact_channel?: string | null;
  assigned_navigator?: string | null;
  updated_at: string;
};

export default async function Page() {
  const supabase = await createServerSideClient();

  let schemaWarning: string | null = null;
  const leadQuery = await supabase
    .from("patient_leads")
    .select(
      "id, full_name, phone, email, source_campaign, current_stage, last_contact_channel, assigned_navigator, updated_at",
    )
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(200);
  let leads: VitalisLeadRow[] | null = leadQuery.data as VitalisLeadRow[] | null;
  let error = leadQuery.error;

  if (error) {
    const missingOptionalContactColumn =
      error.message.includes("last_contact_channel") || error.message.includes("schema cache");

    if (missingOptionalContactColumn) {
      schemaWarning =
        "Este Supabase no tiene todas las columnas opcionales del pipeline Vitalis. La tabla se muestra con datos core.";

      const fallback = await supabase
        .from("patient_leads")
        .select("id, full_name, phone, email, source_campaign, current_stage, updated_at")
        .eq("archived", false)
        .order("updated_at", { ascending: false })
        .limit(200);

      leads = fallback.data as VitalisLeadRow[] | null;
      error = fallback.error;
    }
  }

  if (error) {
    schemaWarning = `No se pudo leer patient_leads: ${error.message}`;
    leads = [];
  }

  const navIds = [
    ...new Set(
      ((leads ?? []) as VitalisLeadRow[])
        .map((l) => l.assigned_navigator)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const navigatorNames = new Map<string, string>();
  if (navIds.length > 0) {
    const { data: profiles } = await supabase.from("user_profiles").select("id, full_name").in("id", navIds);
    for (const row of profiles ?? []) {
      navigatorNames.set(row.id, row.full_name);
    }
  }

  const initialPatients: VitalisPipelineRow[] = ((leads ?? []) as VitalisLeadRow[]).map((l) => ({
    id: l.id,
    full_name: l.full_name,
    phone: l.phone,
    email: l.email,
    source_campaign: l.source_campaign,
    current_stage: l.current_stage as VitalisStage,
    last_contact_channel: l.last_contact_channel ?? null,
    navigator_name: l.assigned_navigator ? navigatorNames.get(l.assigned_navigator) ?? null : null,
    updated_at: l.updated_at,
  }));

  return (
    <div className="min-h-screen p-4 md:p-6">
      <header className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-vitalis-700">Vitalis</div>
        <h1 className="text-2xl font-semibold text-clinical-ink">Pipeline B2C</h1>
        <p className="mt-1 max-w-xl text-sm text-clinical-muted">
          Últimos 200 leads activos desde <code className="text-xs">patient_leads</code>.
        </p>
      </header>
      {schemaWarning ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {schemaWarning}
        </div>
      ) : null}
      <VitalisPipelineTable initialPatients={initialPatients} />
    </div>
  );
}
