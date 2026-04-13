"use client";

import { cn } from "@/lib/cn";

export function StageBars({
  items,
  accent = "vilo",
}: {
  items: { label: string; value: number }[];
  accent?: "vilo" | "vitalis";
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const bar =
    accent === "vilo"
      ? "bg-gradient-to-r from-vilo-400 to-vilo-600"
      : "bg-gradient-to-r from-vitalis-400 to-vitalis-600";

  return (
    <div className="space-y-2">
      {items.map((row) => (
        <div key={row.label} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
          <div className="min-w-0 truncate text-clinical-muted" title={row.label}>
            {row.label}
          </div>
          <div className="tabular-nums text-clinical-ink">{row.value}</div>
          <div className="col-span-2 h-2 overflow-hidden rounded-full bg-vilo-100">
            <div
              className={cn("h-full rounded-full transition-all", bar)}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
