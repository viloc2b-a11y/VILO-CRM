"use client";

import { reassignTask, updateActionItem } from "@/app/action-center/actions";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { isActionItemOverdue, isAgentOriginatedActionItem } from "@/lib/action-center";
import type { ActionItem, ActionItemStatus, BuEnum } from "@/lib/supabase/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Bot, Check, Clock3, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";

const BU_LABEL: Record<BuEnum, string> = {
  vilo_research: "Vilo Research",
  vitalis: "Vitalis",
  hazloasiya: "HazloAsíYa",
};

const BU_PILL: Record<BuEnum, string> = {
  vilo_research: "bg-vilo-100 text-vilo-800 border-vilo-200",
  vitalis: "bg-vitalis-100 text-vitalis-800 border-vitalis-200",
  hazloasiya: "bg-violet-100 text-violet-800 border-violet-200",
};

const STATUS_ES: Record<ActionItemStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  canceled: "Cancelada",
};

const BU_CHIP_KEYS = ["all", "vilo_research", "vitalis", "hazloasiya"] as const;
type UpdateActionItemCommand = "complete" | "snooze_24h" | "snooze_7d" | "escalate";

function priorityBadgeClass(p: ActionItem["priority"]): string {
  if (p === "critical") return "bg-red-100 text-red-800";
  if (p === "high") return "bg-orange-100 text-orange-800";
  if (p === "medium") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function recordHref(item: ActionItem): string {
  if (item.record_type === "opportunity" || item.record_type === "company" || item.record_type === "contact") return "/vilo";
  if (item.record_type === "patient" || item.record_type === "campaign") return "/vitalis";
  if (item.record_type === "submission" || item.record_type === "user") return "/hazlo";
  if (item.record_type === "study" || item.record_type === "study_site" || item.record_type === "monitoring_visit") {
    return "/clinical-ops";
  }
  if (item.record_type === "study_payment") return "/financials";
  return "/tasks";
}

function organizationGroupLabel(item: ActionItem): string {
  if (item.business_unit === "vilo_research" && ["opportunity", "company", "contact"].includes(item.record_type)) {
    return item.title || "Unassigned organization";
  }
  return "Unassigned organization";
}

export function ActionCenterTable({
  filtered,
  teammates = [],
  businessUnitFilter = "all",
  onBusinessUnitChange,
  title = "Tareas activas",
  description,
  showBusinessUnitChips = true,
}: {
  filtered: ActionItem[];
  teammates?: { id: string; full_name: string }[];
  businessUnitFilter?: string;
  onBusinessUnitChange?: (bu: string) => void;
  title?: string;
  description?: string;
  showBusinessUnitChips?: boolean;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const router = useRouter();
  const groupedRows = filtered.reduce<{ label: string; rows: ActionItem[] }[]>((acc, item) => {
    const label = organizationGroupLabel(item);
    let group = acc.find((g) => g.label === label);
    if (!group) {
      group = { label, rows: [] };
      acc.push(group);
    }
    group.rows.push(item);
    return acc;
  }, []);

  async function runCommand(itemId: string, command: UpdateActionItemCommand) {
    setPendingId(itemId);
    try {
      await updateActionItem(itemId, command);
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo actualizar el ítem");
    } finally {
      setPendingId(null);
    }
  }

  async function runReassign(itemId: string, newUserId: string | null) {
    setPendingId(itemId);
    try {
      await reassignTask(itemId, newUserId);
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo reasignar");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-clinical-line bg-white shadow-sm">
      {showBusinessUnitChips || title || description ? (
        <div className="flex flex-col gap-3 border-b border-clinical-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title ? <h2 className="text-sm font-semibold text-clinical-ink">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-clinical-muted">{description}</p> : null}
          </div>
          {showBusinessUnitChips && onBusinessUnitChange ? (
            <div className="flex flex-wrap gap-2">
              {BU_CHIP_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onBusinessUnitChange(key)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    businessUnitFilter === key
                      ? "bg-vilo-600 text-white"
                      : "bg-clinical-paper text-clinical-muted hover:bg-vilo-50",
                  )}
                >
                  {key === "all" ? "Todas" : BU_LABEL[key as BuEnum]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-clinical-line bg-clinical-paper">
              <tr>
                {[
                  "UE",
                  "Registro",
                  "Tipo",
                  "Origen",
                  "Estado",
                  "Siguiente acción",
                  "Fecha límite",
                  "Prioridad",
                  "Valor",
                  "Notas",
                  "Acciones",
                ].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "p-3 text-xs font-semibold uppercase tracking-wide text-clinical-muted",
                      h === "Acciones" ? "text-center" : "text-left",
                      h === "Valor" && "text-right",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-clinical-line">
              {groupedRows.map((group) => (
                <Fragment key={group.label}>
                  <tr key={`${group.label}-header`} className="bg-clinical-paper/80">
                    <td colSpan={11} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                      {group.label}
                    </td>
                  </tr>
                  {group.rows.map((item) => {
                const overdue = isActionItemOverdue(item);
                const generated = item.source === "crm_task" || item.source === "crm_opportunity";
                return (
                  <tr key={item.id} className={cn("hover:bg-vilo-50/50", overdue && "bg-red-50/50")}>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-1 text-xs font-medium",
                          BU_PILL[item.business_unit],
                        )}
                      >
                        {BU_LABEL[item.business_unit]}
                      </span>
                    </td>
                    <td className="max-w-[220px] p-3 font-medium text-clinical-ink">{item.title}</td>
                    <td className="p-3 text-clinical-muted">
                      <span className="text-clinical-ink">{item.record_type}</span>
                      <span className="mt-0.5 block font-mono text-[10px] opacity-70">
                        {item.record_id.slice(0, 8)}…
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-3 text-clinical-ink" title={item.source ?? undefined}>
                      <span className="inline-flex items-center gap-1.5">
                        {isAgentOriginatedActionItem(item.source) ? (
                          <>
                            <Bot className="h-3.5 w-3.5" />
                            Auto
                          </>
                        ) : (
                          <>
                            <User className="h-3.5 w-3.5" />
                            Manual
                          </>
                        )}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {overdue && (
                          <Badge tone="alert" className="text-[10px]">
                            Vencida
                          </Badge>
                        )}
                        <span
                          className={cn(
                            "rounded border px-2 py-0.5 text-xs",
                            overdue ? "border-red-200 bg-white text-red-800" : "border-clinical-line bg-white text-clinical-muted",
                          )}
                        >
                          {STATUS_ES[item.status]}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[180px] p-3 text-clinical-ink">{item.next_action || "Create next action"}</td>
                    <td className="whitespace-nowrap p-3 text-clinical-muted">
                      {item.due_date
                        ? format(new Date(item.due_date), "dd MMM yyyy HH:mm", { locale: es })
                        : "Schedule due date"}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
                          priorityBadgeClass(item.priority),
                        )}
                        aria-label={item.priority}
                      >
                        <span className="capitalize">{item.priority}</span>
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-clinical-ink">
                      {item.value_usd != null ? `$${Number(item.value_usd).toLocaleString("es-US")}` : "No value"}
                    </td>
                    <td className="max-w-xs truncate p-3 text-clinical-muted" title={item.notes ?? undefined}>
                      {item.notes || "No notes"}
                    </td>
                    <td className="flex flex-wrap items-center justify-center gap-2 p-3">
                      <Link
                        href={recordHref(item)}
                        className="rounded bg-vilo-100 px-2 py-1 text-xs font-medium text-vilo-800 transition-colors hover:bg-vilo-200"
                      >
                        Open record
                      </Link>
                      <Link
                        href="/tasks"
                        className="rounded border border-clinical-line bg-white px-2 py-1 text-xs font-medium text-clinical-ink transition-colors hover:bg-vilo-50"
                      >
                        Create follow-up
                      </Link>
                      <select
                        key={`${item.id}-${item.assigned_to ?? ""}`}
                        aria-label="Asignar ítem"
                        disabled={pendingId === item.id || generated}
                        defaultValue={item.assigned_to || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          void runReassign(item.id, v.length > 0 ? v : null);
                          e.target.blur();
                        }}
                        className="cursor-pointer rounded border border-clinical-line bg-white p-1 text-xs text-clinical-ink outline-none focus:border-vilo-400 focus:ring-1 focus:ring-vilo-200"
                      >
                        <option value="">Asignar a…</option>
                        {teammates.map((tm) => (
                          <option key={tm.id} value={tm.id}>
                            {tm.full_name}
                          </option>
                        ))}
                        {item.assigned_to && !teammates.some((t) => t.id === item.assigned_to) ? (
                          <option value={item.assigned_to}>Asignado (fuera de lista)</option>
                        ) : null}
                      </select>
                      <button
                        type="button"
                        disabled={pendingId === item.id || generated}
                        title="Mark done"
                        className="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-200 disabled:opacity-50"
                        onClick={() => void runCommand(item.id, "complete")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Mark done
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === item.id || generated}
                        title="+24 h"
                        className="rounded bg-gray-100 px-2 py-1 text-xs text-clinical-ink transition-colors hover:bg-gray-200 disabled:opacity-50"
                        onClick={() => void runCommand(item.id, "snooze_24h")}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          +1d
                        </span>
                      </button>
                    </td>
                  </tr>
                );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      {filtered.length === 0 && (
        <div className="p-6 text-center text-sm text-clinical-muted">No hay acciones pendientes con estos filtros.</div>
      )}
    </div>
  );
}

export default ActionCenterTable;
