"use client";

import type { VCampaignRoiMetricsRow } from "@/lib/supabase/types";
import { useEffect, useState } from "react";

type RoiFilter = "all" | "positive" | "negative";

function usd0(n: number): string {
  return `$${n.toLocaleString("es-US", { maximumFractionDigits: 0 })}`;
}

function usd2(n: number): string {
  return `$${n.toFixed(2)}`;
}

function csvEscape(cell: string | number): string {
  const s = String(cell);
  return `"${s.replace(/"/g, '""')}"`;
}

function roiBadge(roi: number): string {
  if (roi >= 100) return "bg-green-100 text-green-800";
  if (roi >= 0) return "bg-amber-100 text-amber-900";
  return "bg-red-100 text-red-800";
}

export function CampaignTable({ initialCampaigns }: { initialCampaigns: VCampaignRoiMetricsRow[] }) {
  const [filter, setFilter] = useState<RoiFilter>("all");
  const [campaigns, setCampaigns] = useState(initialCampaigns);

  useEffect(() => {
    setCampaigns(initialCampaigns);
  }, [initialCampaigns]);

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-clinical-line bg-white p-8 text-center text-sm text-clinical-muted">
        No hay filas en <code className="rounded bg-clinical-paper px-1">v_campaign_roi_metrics</code>. Ejecutá{" "}
        <code className="rounded bg-clinical-paper px-1">32_campaign_roi_metrics.sql</code> y rellená campañas /
        atribución.
      </div>
    );
  }

  const filtered = campaigns.filter((c) => {
    const roi = Number(c.roi_percent);
    if (filter === "positive") return roi >= 0;
    if (filter === "negative") return roi < 0;
    return true;
  });

  const exportCSV = () => {
    const headers = [
      "Campaña",
      "Plataforma",
      "Condición",
      "Inversión",
      "Leads",
      "CPL",
      "CAC",
      "ROI %",
      "Revenue",
    ];
    const rows = filtered.map((c) => [
      c.campaign_name,
      c.platform ?? "—",
      c.external_ref ?? "—",
      Number(c.total_spend),
      Number(c.leads),
      Number(c.cost_per_lead).toFixed(2),
      Number(c.cac).toFixed(2),
      Number(c.roi_percent).toFixed(1),
      Number(c.total_revenue),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((cell) => csvEscape(cell)).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roi_campaigns_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-clinical-line bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-clinical-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-clinical-ink">Detalle por campaña</h2>
          <p className="mt-0.5 text-xs text-clinical-muted">
            Vista <code className="rounded bg-clinical-paper px-1">v_campaign_roi_metrics</code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as RoiFilter)}
            className="rounded-md border border-clinical-line bg-white px-3 py-1.5 text-sm text-clinical-ink"
          >
            <option value="all">Todas</option>
            <option value="positive">ROI positivo</option>
            <option value="negative">ROI negativo</option>
          </select>
          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-2 rounded-md bg-vilo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-vilo-700"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-clinical-line bg-clinical-paper/80 text-xs uppercase tracking-wide text-clinical-muted">
            <tr>
              <th className="p-3 text-left font-medium">Campaña</th>
              <th className="p-3 text-left font-medium">Plataforma</th>
              <th className="p-3 text-right font-medium">Inversión</th>
              <th className="p-3 text-right font-medium">Leads</th>
              <th className="p-3 text-right font-medium">CPL</th>
              <th className="p-3 text-right font-medium">CAC</th>
              <th className="p-3 text-right font-medium">ROI %</th>
              <th className="p-3 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const roi = Number(c.roi_percent);
              return (
                <tr key={c.campaign_id} className="border-b border-clinical-line hover:bg-clinical-paper/40">
                  <td className="p-3 font-medium text-clinical-ink">
                    {c.campaign_name}
                    {c.external_ref ? (
                      <div className="text-xs font-normal text-clinical-muted">{c.external_ref}</div>
                    ) : null}
                  </td>
                  <td className="p-3 capitalize text-clinical-muted">{c.platform ?? "—"}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{usd0(Number(c.total_spend))}</td>
                  <td className="p-3 text-right tabular-nums">{Number(c.leads)}</td>
                  <td className="p-3 text-right font-mono text-sm text-clinical-muted tabular-nums">
                    {usd2(Number(c.cost_per_lead))}
                  </td>
                  <td className="p-3 text-right font-mono text-sm font-semibold tabular-nums">
                    {usd2(Number(c.cac))}
                  </td>
                  <td className="p-3 text-right">
                    <span
                      className={`inline-flex rounded px-2 py-1 text-xs font-medium ${roiBadge(roi)}`}
                    >
                      {roi.toFixed(1)}%
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-green-700 tabular-nums">
                    {usd0(Number(c.total_revenue))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-clinical-muted">
            No hay campañas con este filtro.
          </div>
        )}
      </div>
    </div>
  );
}
