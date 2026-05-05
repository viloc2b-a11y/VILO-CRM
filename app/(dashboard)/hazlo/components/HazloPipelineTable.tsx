"use client";

import { cn } from "@/lib/cn";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useMemo, useState } from "react";

export type HazloPipelineRow = {
  id: string;
  name: string;
  email: string | null;
  funnel_type: string;
  payment_status: string | null;
  validation: string;
  growth: string;
  created_at: string;
  /** Para filtro “Revisión” (manual, humano o listo para revisión). */
  needs_review: boolean;
};

type PipelineFilter = "all" | "pending" | "paid" | "failed" | "review";

const FILTER_CHIPS: { key: PipelineFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendientes" },
  { key: "paid", label: "Pagados" },
  { key: "failed", label: "Fallidos" },
  { key: "review", label: "Revisión" },
];

function isPendingPayment(ps: string | null): boolean {
  if (ps == null || ps === "") return true;
  return ps === "pending";
}

function paymentBadgeClasses(ps: string | null): string {
  if (ps === "paid") return "bg-green-100 text-green-800";
  if (ps === "failed") return "bg-red-100 text-red-800";
  return "bg-yellow-100 text-yellow-800";
}

function paymentBadgeLabel(ps: string | null): string {
  if (ps === "paid") return "paid";
  if (ps === "failed") return "failed";
  if (ps == null || ps === "") return "pending";
  return ps;
}

function validationBadge(validation: string): { label: string; className: string } {
  if (validation === "OK") return { label: validation, className: "bg-green-100 text-green-800" };
  if (validation === "Falló") return { label: validation, className: "bg-red-100 text-red-800" };
  if (validation === "Humano" || validation === "Revisión manual")
    return { label: validation, className: "bg-orange-100 text-orange-800" };
  if (validation === "—" || validation === "")
    return { label: "—", className: "bg-gray-100 text-gray-700" };
  return { label: validation, className: "bg-gray-100 text-gray-800" };
}

function growthBadge(growth: string): { label: string; className: string } {
  if (growth === "Campaña enviada")
    return { label: "contacted", className: "bg-purple-100 text-purple-800" };
  if (growth.startsWith("Score ")) return { label: growth, className: "bg-blue-100 text-blue-800" };
  if (growth === "Bajo umbral") return { label: growth, className: "bg-amber-100 text-amber-900" };
  if (growth === "—") return { label: "—", className: "bg-gray-100 text-gray-700" };
  return { label: growth, className: "bg-gray-100 text-gray-800" };
}

export function HazloPipelineTable({
  initialSubmissions,
  emptyMessage,
}: {
  initialSubmissions: HazloPipelineRow[];
  emptyMessage?: string;
}) {
  const [filter, setFilter] = useState<PipelineFilter>("all");
  const [funnelKey, setFunnelKey] = useState<string>("all");
  const [search, setSearch] = useState("");

  const funnelOptions = useMemo(() => {
    const set = new Set(initialSubmissions.map((s) => s.funnel_type).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [initialSubmissions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialSubmissions.filter((s) => {
      if (filter === "all") {
        /* pass */
      } else if (filter === "pending") {
        if (!isPendingPayment(s.payment_status)) return false;
      } else if (filter === "paid") {
        if (s.payment_status !== "paid") return false;
      } else if (filter === "failed") {
        if (s.payment_status !== "failed") return false;
      } else if (filter === "review") {
        if (!s.needs_review) return false;
      }
      if (funnelKey !== "all" && s.funnel_type !== funnelKey) return false;
      if (q) {
        const name = (s.name ?? "").toLowerCase();
        const email = (s.email ?? "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [initialSubmissions, filter, funnelKey, search]);

  if (initialSubmissions.length === 0) {
    return (
      <div className="rounded-xl border border-clinical-line bg-white p-8 text-center text-sm text-clinical-muted">
        {emptyMessage ?? "No hay expedientes que coincidan con tu acceso."}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-clinical-line bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-clinical-line p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-clinical-ink">Expedientes recientes</h2>
          <div className="flex flex-wrap gap-2">
            {FILTER_CHIPS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  filter === f.key
                    ? "bg-vilo-600 text-white"
                    : "bg-clinical-paper text-clinical-ink hover:bg-vilo-50",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-clinical-muted">
            Buscar
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o email…"
              className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink"
            />
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-clinical-muted">
            Trámite
            <select
              value={funnelKey}
              onChange={(e) => setFunnelKey(e.target.value)}
              className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink"
            >
              <option value="all">Todos</option>
              {funnelOptions.map((ft) => (
                <option key={ft} value={ft}>
                  {ft.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-clinical-line bg-clinical-paper/80">
            <tr>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                Usuario
              </th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                Trámite
              </th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                Pago
              </th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                Validación
              </th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                Growth
              </th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                Creado
              </th>
              <th className="p-3 text-center text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-clinical-muted">
                  Ningún expediente con este filtro.
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const v = validationBadge(s.validation);
                const g = growthBadge(s.growth);
                const payLabel = paymentBadgeLabel(s.payment_status);
                return (
                  <tr key={s.id} className="border-b border-clinical-line hover:bg-vilo-50/40">
                    <td className="p-3">
                      <div className="font-medium text-clinical-ink">{s.name || "Sin nombre"}</div>
                      <div className="text-xs text-clinical-muted">{s.email ?? "—"}</div>
                    </td>
                    <td className="p-3 capitalize text-clinical-ink">
                      {s.funnel_type.replace(/_/g, " ")}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-1 text-xs font-medium",
                          paymentBadgeClasses(s.payment_status),
                        )}
                      >
                        {payLabel}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={cn("inline-flex rounded px-2 py-1 text-xs font-medium", v.className)}>
                        {v.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={cn("inline-flex rounded px-2 py-1 text-xs font-medium", g.className)}>
                        {g.label}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-clinical-muted">
                      {format(new Date(s.created_at), "dd MMM HH:mm", { locale: es })}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Link
                          href={`/hazlo/submissions/${s.id}`}
                          className="text-xs font-medium text-clinical-ink underline-offset-2 hover:underline"
                        >
                          Ficha
                        </Link>
                        <Link
                          href={`/action-center?bu=hazloasiya&record=${encodeURIComponent(`submission:${s.id}`)}`}
                          className="text-xs font-medium text-vilo-700 underline-offset-2 hover:underline"
                        >
                          Tareas →
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
