import type { VHazloMetricsRow } from "@/lib/supabase/types";

export function HazloMetrics({
  data,
  loadError,
}: {
  data: VHazloMetricsRow | null;
  loadError?: boolean;
}) {
  if (loadError && !data) {
    return (
      <p className="text-sm text-amber-800">
        No se pudieron cargar las métricas agregadas. La tabla de expedientes puede seguir mostrándose.
      </p>
    );
  }

  if (!data) return null;

  const conv =
    data.conversion_rate_pct_paid_over_all_30d != null &&
    Number.isFinite(Number(data.conversion_rate_pct_paid_over_all_30d))
      ? `${Number(data.conversion_rate_pct_paid_over_all_30d).toFixed(1)}%`
      : "—";

  const cards = [
    {
      label: "Funnels completados",
      value: data.funnels_completed.toLocaleString("es-US"),
      color: "bg-blue-50 text-blue-700",
    },
    {
      label: "Pagos exitosos",
      value: data.paid_count.toLocaleString("es-US"),
      color: "bg-green-50 text-green-700",
    },
    {
      label: "Revenue (30d)",
      value: `$${Number(data.revenue_usd_estimate).toLocaleString("es-US", { maximumFractionDigits: 0 })}`,
      color: "bg-purple-50 text-purple-700",
    },
    {
      label: "Por revisar",
      value: data.pending_reviews.toLocaleString("es-US"),
      color: "bg-orange-50 text-orange-700",
    },
    {
      label: "Upsell candidates",
      value: data.upsell_candidates_pdf_delivered.toLocaleString("es-US"),
      color: "bg-pink-50 text-pink-700",
    },
    {
      label: "Conversión",
      value: conv,
      color: "bg-teal-50 text-teal-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border border-current/10 p-4 ${card.color}`}
        >
          <div className="text-2xl font-bold tabular-nums">{card.value}</div>
          <div className="text-sm opacity-80">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
