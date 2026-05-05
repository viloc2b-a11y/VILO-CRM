import { cn } from "@/lib/cn";
import type React from "react";

export function OpsMetric({
  label,
  value,
  alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-lg border border-clinical-line bg-white px-3 py-2 shadow-sm">
      <div className="text-xs text-clinical-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", alert ? "text-clinical-alert" : "text-clinical-ink")}>
        {value}
      </div>
    </div>
  );
}

export function OpsInput({
  name,
  label,
  type = "text",
  step,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs text-clinical-muted">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink"
      />
    </label>
  );
}

export function OpsSelect<T extends string>({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: readonly T[];
}) {
  return (
    <label className="grid gap-1 text-xs text-clinical-muted">
      {label}
      <select name={name} className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function OpsSubmit({ label }: { label: string }) {
  return (
    <button className="rounded-lg bg-clinical-ink px-3 py-2 text-sm font-medium text-white hover:bg-vilo-800">
      {label}
    </button>
  );
}

export function OpsDataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-clinical-line bg-clinical-paper/80">
          <tr>
            {headers.map((h) => (
              <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="p-6 text-center text-clinical-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((cells, i) => (
              <tr key={i} className="border-b border-clinical-line last:border-0 hover:bg-vilo-50/40">
                {cells.map((c, j) => (
                  <td key={j} className="p-3 text-clinical-muted">
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
