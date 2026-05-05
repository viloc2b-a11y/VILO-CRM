import { CampaignTable } from "./components/CampaignTable";
import { ROICards } from "./components/ROICards";
import { createServerSideClient } from "@/lib/supabase/server";
import type { VCampaignRoiMetricsRow } from "@/lib/supabase/types";
import Link from "next/link";

export default async function AnalyticsPage() {
  const supabase = await createServerSideClient();

  const { data, error } = await supabase
    .from("v_campaign_roi_metrics")
    .select("*")
    .order("total_spend", { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen bg-clinical-paper/80 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Error cargando métricas: {error.message}. Comprobá que exista la vista{" "}
          <code className="rounded bg-white/80 px-1">v_campaign_roi_metrics</code> (SQL 32) y tu acceso RLS.
        </div>
      </div>
    );
  }

  const campaigns = (data ?? []) as VCampaignRoiMetricsRow[];

  const totalSpend = campaigns.reduce((sum, c) => sum + Number(c.total_spend ?? 0), 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + Number(c.total_revenue ?? 0), 0);
  const totalLeads = campaigns.reduce((sum, c) => sum + Number(c.leads ?? 0), 0);

  const withCac = campaigns.filter((c) => Number(c.cac) > 0);
  const avgCAC =
    withCac.length > 0
      ? withCac.reduce((sum, c) => sum + Number(c.cac), 0) / withCac.length
      : 0;

  return (
    <div className="min-h-screen bg-clinical-paper/80">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-clinical-ink">ROI y CAC por campaña</h1>
            <p className="mt-1 text-sm text-clinical-muted">
              Agregados desde <code className="rounded bg-white px-1 text-xs">v_campaign_roi_metrics</code>.
            </p>
          </div>
          <Link
            href="/action-center"
            className="text-sm font-medium text-vilo-700 underline-offset-4 hover:underline"
          >
            ← Action Center
          </Link>
        </header>

        <ROICards spend={totalSpend} revenue={totalRevenue} leads={totalLeads} avgCAC={avgCAC} />

        <CampaignTable initialCampaigns={campaigns} />
      </div>
    </div>
  );
}
