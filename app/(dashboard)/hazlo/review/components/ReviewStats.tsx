import { cn } from "@/lib/cn";

export type HazloReviewStats = {
  pending_reviews: number;
  critical_reviews: number;
  /** Media de confianza en cola (0–1); null si no hay filas. */
  avg_confidence: number | null;
  approved_today: number;
  rejected_today: number;
};

export function ReviewStats({
  data,
  loadError,
}: {
  data: HazloReviewStats | null;
  loadError?: string;
}) {
  if (loadError) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {loadError}
      </p>
    );
  }

  const d = data ?? {
    pending_reviews: 0,
    critical_reviews: 0,
    avg_confidence: null,
    approved_today: 0,
    rejected_today: 0,
  };

  const avgLabel =
    d.avg_confidence != null && !Number.isNaN(d.avg_confidence)
      ? `${(d.avg_confidence * 100).toFixed(0)}%`
      : "—";

  const cards: {
    label: string;
    value: string | number;
    color: string;
    critical?: boolean;
  }[] = [
    {
      label: "Pendientes de revisión",
      value: d.pending_reviews,
      color: "bg-orange-50 text-orange-700 border-orange-200/80",
      critical: d.critical_reviews > 0,
    },
    {
      label: "Confianza promedio (cola)",
      value: avgLabel,
      color: "bg-blue-50 text-blue-700 border-blue-200/80",
    },
    {
      label: "Aprobados hoy",
      value: d.approved_today,
      color: "bg-green-50 text-green-700 border-green-200/80",
    },
    {
      label: "Rechazados hoy",
      value: d.rejected_today,
      color: "bg-red-50 text-red-700 border-red-200/80",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            "rounded-lg border p-4 shadow-sm",
            card.color,
            card.critical && "ring-2 ring-red-400 ring-offset-2 ring-offset-clinical-paper/80",
          )}
        >
          <div className="text-2xl font-bold tabular-nums">{card.value}</div>
          <div className="text-sm opacity-80">{card.label}</div>
          {card.critical && (
            <div className="mt-1 text-xs font-medium text-red-600">Hay revisiones críticas en cola</div>
          )}
        </div>
      ))}
    </div>
  );
}
