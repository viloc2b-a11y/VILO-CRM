import { cn } from "@/lib/cn";

export function ROICards({
  spend,
  revenue,
  leads,
  avgCAC,
}: {
  spend: number;
  revenue: number;
  leads: number;
  avgCAC: number;
}) {
  const roi = spend > 0 ? ((revenue - spend) / spend) * 100 : 0;

  const cards = [
    {
      label: "Inversión total",
      value: `$${spend.toLocaleString("es-US", { maximumFractionDigits: 0 })}`,
      color: "bg-blue-50 text-blue-700",
      icon: "💰",
    },
    {
      label: "Revenue generado",
      value: `$${revenue.toLocaleString("es-US", { maximumFractionDigits: 0 })}`,
      color: "bg-green-50 text-green-700",
      icon: "📈",
    },
    {
      label: "Leads totales",
      value: leads.toLocaleString("es-US"),
      color: "bg-purple-50 text-purple-700",
      icon: "👥",
    },
    {
      label: "CAC promedio",
      value: avgCAC > 0 ? `$${avgCAC.toFixed(2)}` : "—",
      color: "bg-orange-50 text-orange-700",
      icon: "🎯",
    },
    {
      label: "ROI global",
      value: `${roi.toFixed(1)}%`,
      color: roi >= 0 ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-700",
      icon: roi >= 0 ? "✅" : "⚠️",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            "rounded-lg border border-current/10 p-4 shadow-sm",
            card.color,
          )}
        >
          <div className="mb-1 text-2xl">{card.icon}</div>
          <div className="text-2xl font-bold tabular-nums">{card.value}</div>
          <div className="text-sm opacity-80">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
