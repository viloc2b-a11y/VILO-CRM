"use client";

import { VITALIS_STAGES, type VitalisStage } from "@/lib/constants";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useMemo, useState } from "react";

/** Fila alineada a `patient_leads` + nombre de navigator resuelto en el server. */
export type VitalisPipelineRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  source_campaign: string | null;
  current_stage: VitalisStage;
  last_contact_channel: string | null;
  navigator_name: string | null;
  updated_at: string;
};

function statusColor(stage: string): string {
  if (stage === "New Lead") return "bg-blue-100 text-blue-700";
  if (stage === "Contact Attempted" || stage === "Responded") return "bg-yellow-100 text-yellow-700";
  if (
    stage === "Prescreen Started" ||
    stage === "Prequalified" ||
    stage === "Scheduled" ||
    stage === "Visit Confirmed" ||
    stage === "Enrolled"
  ) {
    return "bg-green-100 text-green-700";
  }
  if (stage === "No-show" || stage === "Screen Fail" || stage === "Patient Lost") {
    return "bg-red-100 text-red-700";
  }
  if (stage === "Nurture / Future Study") return "bg-gray-100 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

export function VitalisPipelineTable({ initialPatients }: { initialPatients: VitalisPipelineRow[] }) {
  const [patients] = useState(initialPatients);
  const [filter, setFilter] = useState<"all" | VitalisStage>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return patients;
    return patients.filter((p) => p.current_stage === filter);
  }, [patients, filter]);

  return (
    <div className="overflow-hidden rounded-xl border border-clinical-line bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-clinical-line p-4">
        <h2 className="font-semibold text-clinical-ink">Pacientes recientes</h2>
        <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded px-2 py-1 text-xs whitespace-nowrap ${
              filter === "all" ? "bg-vitalis-600 text-white" : "bg-clinical-line/40 text-clinical-ink"
            }`}
          >
            Todos
          </button>
          {VITALIS_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded px-2 py-1 text-xs whitespace-nowrap ${
                filter === s ? "bg-vitalis-600 text-white" : "bg-clinical-line/40 text-clinical-ink"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-clinical-line bg-vitalis-50/50">
            <tr className="text-left text-xs text-clinical-muted uppercase">
              <th className="p-3">Nombre</th>
              <th className="p-3">Contacto</th>
              <th className="p-3">Fuente</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Canal</th>
              <th className="p-3">Navigator</th>
              <th className="p-3">Actualizado</th>
              <th className="p-3 text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-clinical-line last:border-0 hover:bg-vitalis-50/30">
                <td className="p-3 font-medium text-clinical-ink">{p.full_name || "Anónimo"}</td>
                <td className="p-3 text-xs text-clinical-muted">
                  {p.phone || "—"}
                  <br />
                  {p.email || ""}
                </td>
                <td className="p-3 text-xs text-clinical-muted capitalize">
                  {(p.source_campaign ?? "").replace(/_/g, " ") || "—"}
                </td>
                <td className="p-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${statusColor(p.current_stage)}`}>
                    {p.current_stage}
                  </span>
                </td>
                <td className="p-3 text-xs text-clinical-muted">{p.last_contact_channel || "—"}</td>
                <td className="p-3 text-xs text-clinical-muted">{p.navigator_name || "Sin asignar"}</td>
                <td className="p-3 text-xs text-clinical-muted">
                  {format(new Date(p.updated_at), "dd MMM HH:mm", { locale: es })}
                </td>
                <td className="p-3 text-center">
                  <Link
                    href={`/vitalis/patients/${p.id}`}
                    className="text-xs text-vitalis-700 hover:underline"
                  >
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-sm text-clinical-muted">
                  No hay pacientes con este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
