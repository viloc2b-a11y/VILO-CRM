"use client";

import { cn } from "@/lib/cn";

export function ViewToggle({
  value,
  onChange,
}: {
  value: "kanban" | "list";
  onChange: (v: "kanban" | "list") => void;
}) {
  const opts = [
    { id: "kanban" as const, label: "Kanban" },
    { id: "list" as const, label: "List" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-clinical-line bg-white p-0.5 text-sm shadow-sm">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition-colors",
            value === o.id ? "bg-vilo-100 text-vilo-900" : "text-clinical-muted hover:text-clinical-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
