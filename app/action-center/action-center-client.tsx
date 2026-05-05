"use client";

import ActionCenterTable from "@/app/action-center/components/ActionCenterTable";
import ActionCenterFilters, {
  ACTION_CENTER_FILTERS_DEFAULT,
  type ActionCenterFilterValues,
} from "@/components/action-center/ActionCenterFilters";
import { isActionItemOverdue, isAgentOriginatedActionItem } from "@/lib/action-center";
import type { ActionItem, ActionItemStatus, BuEnum } from "@/lib/supabase/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, BriefcaseBusiness, Clock3, CreditCard, HeartPulse } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

const BU_LABEL: Record<BuEnum, string> = {
  vilo_research: "Vilo Research",
  vitalis: "Vitalis",
  hazloasiya: "HazloAsíYa",
};

const STATUS_ES: Record<ActionItemStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  canceled: "Cancelada",
};

const PRIORITY_ES: Record<ActionItem["priority"], string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

const ACTION_GROUPS = [
  {
    key: "due",
    title: "Tareas vencidas y de hoy",
    description: "Compromisos abiertos con fecha límite vencida o para hoy.",
    icon: AlertTriangle,
  },
  {
    key: "vitalis",
    title: "Vitalis sin contactar (<2h)",
    description: "Leads de paciente generados por reglas de contacto rápido.",
    icon: HeartPulse,
  },
  {
    key: "hazlo",
    title: "Pagos fallidos HazloAsíYa",
    description: "Expedientes que necesitan recuperación de pago.",
    icon: CreditCard,
  },
  {
    key: "vilo",
    title: "Vilo sin movimiento (>5 días)",
    description: "Oportunidades B2B que requieren empuje comercial.",
    icon: BriefcaseBusiness,
  },
  {
    key: "other",
    title: "Otras acciones abiertas",
    description: "Tareas operativas en ventana de foco.",
    icon: Clock3,
  },
] as const;

type ActionGroupKey = (typeof ACTION_GROUPS)[number]["key"];

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function actionGroupFor(item: ActionItem, today = startOfLocalDay()): ActionGroupKey {
  if (item.due_date) {
    const due = new Date(item.due_date);
    const dueDay = startOfLocalDay(due);
    if (dueDay.getTime() <= today.getTime()) return "due";
  }

  const source = item.source ?? "";
  const text = `${source} ${item.title} ${item.next_action ?? ""}`.toLowerCase();
  if (item.business_unit === "vitalis" && (source.includes("2h") || text.includes("<2h"))) return "vitalis";
  if (item.business_unit === "hazloasiya" && (source.includes("payment") || text.includes("pago fallido"))) {
    return "hazlo";
  }
  if (item.business_unit === "vilo_research" && (source.includes("stale") || text.includes("sin movimiento"))) {
    return "vilo";
  }
  return "other";
}

function csvEscapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function isBuEnum(v: string): v is BuEnum {
  return v === "vilo_research" || v === "vitalis" || v === "hazloasiya";
}

export default function ActionCenterClient({
  initialData,
  teammates = [],
  initialBu,
  initialSearch,
}: {
  initialData: ActionItem[];
  teammates?: { id: string; full_name: string }[];
  /** Desde `?bu=` en la URL (p. ej. enlace desde Hazlo). */
  initialBu?: string;
  /** Desde `?search=` o derivado de `?record=submission:uuid`. */
  initialSearch?: string;
}) {
  const [filters, setFilters] = useState<ActionCenterFilterValues>(() => {
    let base: ActionCenterFilterValues = { ...ACTION_CENTER_FILTERS_DEFAULT };
    if (initialBu && isBuEnum(initialBu)) base = { ...base, bu: initialBu };
    if (initialSearch?.trim()) base = { ...base, search: initialSearch.trim() };
    return base;
  });
  const handleFilterChange = useCallback((f: ActionCenterFilterValues) => {
    setFilters(f);
  }, []);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return initialData.filter((item) => {
      if (filters.bu !== "all" && item.business_unit !== filters.bu) return false;
      if (filters.priority !== "all" && item.priority !== filters.priority) return false;
      if (filters.status === "overdue") {
        if (!isActionItemOverdue(item)) return false;
      } else if (item.status !== filters.status) return false;
      if (q) {
        const haystack = `${item.title} ${item.record_type} ${item.record_id}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [initialData, filters.bu, filters.priority, filters.status, filters.search]);

  const grouped = useMemo(() => {
    const today = startOfLocalDay();
    const map = new Map<ActionGroupKey, ActionItem[]>();
    for (const group of ACTION_GROUPS) map.set(group.key, []);
    for (const item of filtered) {
      const key = actionGroupFor(item, today);
      map.get(key)?.push(item);
    }
    return ACTION_GROUPS.map((group) => ({ ...group, rows: map.get(group.key) ?? [] }));
  }, [filtered]);

  const exportCSV = useCallback(() => {
    const headers = [
      "UE",
      "Registro",
      "Tipo",
      "Origen",
      "Estado",
      "Siguiente Acción",
      "Fecha Límite",
      "Prioridad",
      "Valor USD",
      "Notas",
      "Delegado",
    ];
    const rows = filtered.map((i) => {
      const overdue = isActionItemOverdue(i);
      const estado = overdue ? `Vencida · ${STATUS_ES[i.status]}` : STATUS_ES[i.status];
      const delegado = i.assigned_to
        ? teammates.find((t) => t.id === i.assigned_to)?.full_name ?? i.assigned_to.slice(0, 8)
        : "Pool";
      const origen = isAgentOriginatedActionItem(i.source) ? "Auto (agente)" : "Manual";
      return [
        BU_LABEL[i.business_unit],
        i.title,
        i.record_type,
        origen,
        estado,
        i.next_action ?? "",
        i.due_date ? format(new Date(i.due_date), "dd/MM/yyyy", { locale: es }) : "",
        PRIORITY_ES[i.priority],
        i.value_usd != null ? String(Number(i.value_usd)) : "",
        i.notes ?? "",
        delegado,
      ].map((c) => csvEscapeCell(c));
    });
    const csv = [headers.map(csvEscapeCell).join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `viloos_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filtered, teammates]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-clinical-line bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-clinical-muted">
          Primero urgencia, luego valor USD y movimiento de pipeline.
        </p>
        <button
          type="button"
          onClick={exportCSV}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-vilo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-vilo-700"
        >
          Exportar CSV
        </button>
      </div>
      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {grouped.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.key} className="rounded-lg border border-clinical-line bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-xs font-medium text-clinical-muted">{group.title}</div>
                <Icon className="h-4 w-4 shrink-0 text-vilo-600" />
              </div>
              <div className="mt-1 text-2xl font-semibold text-clinical-ink">{group.rows.length}</div>
            </div>
          );
        })}
      </section>
      <ActionCenterFilters
        externalBu={filters.bu}
        initialSearch={initialSearch?.trim() ?? ""}
        onClearAll={() => setFilters(ACTION_CENTER_FILTERS_DEFAULT)}
        onChange={handleFilterChange}
      />
      <div className="space-y-4">
        {grouped
          .filter((group) => group.rows.length > 0)
          .map((group) => (
            <ActionCenterTable
              key={group.key}
              filtered={group.rows}
              teammates={teammates}
              title={group.title}
              description={group.description}
              showBusinessUnitChips={false}
            />
          ))}
        {filtered.length === 0 ? (
          <ActionCenterTable
            filtered={[]}
            teammates={teammates}
            title="Sin acciones"
            description="No hay ítems pendientes con los filtros actuales."
            showBusinessUnitChips={false}
          />
        ) : null}
      </div>
    </>
  );
}
