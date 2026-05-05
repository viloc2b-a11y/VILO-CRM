import { cn } from "@/lib/cn";
import { createServerSideClient } from "@/lib/supabase/server";
import type { VActionMetricsRow } from "@/lib/supabase/types";

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Tarjetas desde `v_action_metrics` (RLS del usuario). Requiere migración `10_v_action_metrics.sql`.
 */
export async function MetricsDashboard() {
  const supabase = await createServerSideClient();

  const { data, error } = await supabase.from("v_action_metrics").select("metric, value, status");

  const metrics: Record<string, number> = {};
  if (!error && data) {
    for (const row of data as VActionMetricsRow[]) {
      metrics[row.metric] = num(row.value);
    }
  }

  const pipeline = metrics.total_pipeline_value ?? 0;
  const cards = [
    {
      label: "Pipeline activo",
      value: `$${pipeline.toLocaleString("es-US", { maximumFractionDigits: 0 })}`,
      className: "bg-vilo-50 text-vilo-900 border-vilo-200",
      icon: "💰",
    },
    {
      label: "Vencidas (due date)",
      value: metrics.overdue_count ?? 0,
      className: "bg-red-50 text-red-800 border-red-200",
      icon: "🚨",
    },
    {
      label: "Vilo Research",
      value: metrics.vilo_tasks ?? 0,
      className: "bg-vilo-100/80 text-vilo-900 border-vilo-200",
      icon: "🧬",
    },
    {
      label: "Vitalis",
      value: metrics.vitalis_tasks ?? 0,
      className: "bg-vitalis-50 text-vitalis-900 border-vitalis-200",
      icon: "🩺",
    },
    {
      label: "HazloAsíYa",
      value: metrics.hazloasiya_tasks ?? 0,
      className: "bg-violet-50 text-violet-900 border-violet-200",
      icon: "📝",
    },
  ];

  return (
    <div className="mb-6">
      {error && (
        <p className="mb-3 text-xs text-clinical-muted">
          Métricas no disponibles (¿aplicaste <code className="rounded bg-clinical-paper px-1">10_v_action_metrics.sql</code>?):{" "}
          {error.message}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        {cards.map((card) => (
          <div key={card.label} className={cn("rounded-lg border p-4 shadow-sm", card.className)}>
            <div className="mb-1 text-2xl leading-none">{card.icon}</div>
            <div className="text-2xl font-bold tabular-nums">{card.value}</div>
            <div className="mt-1 text-xs font-medium opacity-90">{card.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MetricsDashboard;
