import { KanbanBoard, type PipelineKanbanOpp } from "./components/KanbanBoard";
import { viloRowToApp } from "@/lib/supabase/mappers";
import { createServerSideClient } from "@/lib/supabase/server";
import type { OpportunityWithRefs, ViloOpportunityRow } from "@/lib/supabase/types";

export default async function ViloPipelinePage() {
  const supabase = await createServerSideClient();

  const { data, error } = await supabase
    .from("vilo_opportunities")
    .select("*, organization:organizations(id, name, type), contact:contacts(id, full_name)")
    .eq("archived", false)
    .not("status", "in", '("Activated","Closed Lost","Nurture")')
    .order("expected_close_date", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as OpportunityWithRefs[];
  const initialOpportunities: PipelineKanbanOpp[] = rows.map((r) => {
    const { organization: org, ...base } = r;
    const app = viloRowToApp(base as ViloOpportunityRow);
    return {
      id: app.id,
      company_name: app.companyName,
      organization_type: org?.type ?? null,
      opportunity_type: app.opportunityType || null,
      status: app.status,
      potential_value: base.potential_value != null ? Number(base.potential_value) : null,
      expected_close_date: base.expected_close_date ?? null,
      relationship_strength: base.relationship_strength ?? null,
    };
  });

  return (
    <div className="min-h-screen bg-clinical-paper p-4 md:p-6">
      <header className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Vilo Research Group</div>
        <h1 className="text-2xl font-semibold text-clinical-ink">Pipeline Vilo Research</h1>
        <p className="mt-1 max-w-xl text-sm text-clinical-muted">
          Open deals only (excludes Activated, Closed Lost, and Nurture). Ordered by expected close date.
        </p>
      </header>
      <KanbanBoard initialOpportunities={initialOpportunities} />
    </div>
  );
}
