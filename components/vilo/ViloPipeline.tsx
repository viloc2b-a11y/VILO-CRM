"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { StageBars } from "@/components/charts/StageBars";
import { ViewToggle } from "@/components/pipeline/ViewToggle";
import { PRIORITIES, VILO_STAGES, type Priority, type ViloStage } from "@/lib/constants";
import { isDateBeforeToday } from "@/lib/dates";
import { useCrmStore } from "@/lib/store";
import type { ViloOpportunity } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useMemo, useState } from "react";
import { ViloOpportunityForm } from "./ViloOpportunityForm";

export function ViloPipeline() {
  const opps = useCrmStore((s) => s.viloOpportunities);
  const addViloOpportunity = useCrmStore((s) => s.addViloOpportunity);
  const updateViloOpportunity = useCrmStore((s) => s.updateViloOpportunity);
  const deleteViloOpportunity = useCrmStore((s) => s.deleteViloOpportunity);
  const setViloStage = useCrmStore((s) => s.setViloStage);

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filterStage, setFilterStage] = useState<ViloStage | "All">("All");
  const [filterPriority, setFilterPriority] = useState<Priority | "All">("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ViloOpportunity | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return opps.filter((o) => {
      if (filterStage !== "All" && o.status !== filterStage) return false;
      if (filterPriority !== "All" && o.priority !== filterPriority) return false;
      return true;
    });
  }, [opps, filterStage, filterPriority]);

  const stageCounts = useMemo(() => {
    return VILO_STAGES.map((s) => ({
      label: s,
      value: opps.filter((o) => o.status === s).length,
    }));
  }, [opps]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(o: ViloOpportunity) {
    setEditing(o);
    setModalOpen(true);
  }

  function handleSubmit(values: Omit<ViloOpportunity, "id" | "createdAt" | "updatedAt">) {
    if (editing) {
      updateViloOpportunity(editing.id, values);
    } else {
      addViloOpportunity(values);
    }
    setModalOpen(false);
    setEditing(null);
  }

  function handleDelete(o: ViloOpportunity) {
    if (!window.confirm(`Delete opportunity for ${o.companyName}?`)) return;
    deleteViloOpportunity(o.id);
  }

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Vilo Research Group</div>
          <h1 className="text-2xl font-semibold text-clinical-ink">B2B pipeline</h1>
          <p className="mt-1 max-w-xl text-sm text-clinical-muted">
            Sponsors, CROs, labs, and partners. Separate from Vitalis patient leads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={openNew}>New opportunity</Button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          className="w-44"
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value as ViloStage | "All")}
        >
          <option value="All">All stages</option>
          {VILO_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          className="w-40"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as Priority | "All")}
        >
          <option value="All">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>

      {view === "list" ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-clinical-line bg-vilo-50/60 text-xs uppercase text-clinical-muted">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Next follow-up</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const overdue =
                  o.nextFollowupDate && isDateBeforeToday(o.nextFollowupDate) && o.status !== "Closed Lost";
                return (
                  <tr key={o.id} className="border-b border-clinical-line last:border-0">
                    <td className="px-3 py-2 font-medium">{o.companyName}</td>
                    <td className="px-3 py-2 text-clinical-muted">{o.contactName || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone="vilo">{o.status}</Badge>
                    </td>
                    <td className="px-3 py-2">{o.priority}</td>
                    <td className={cn("px-3 py-2", overdue && "font-semibold text-clinical-alert")}>
                      {o.nextFollowupDate || "—"}
                    </td>
                    <td className="space-x-2 px-3 py-2 text-right">
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => openEdit(o)}>
                        Edit
                      </Button>
                      <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => handleDelete(o)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-clinical-muted">
                    No opportunities match filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {VILO_STAGES.map((stage) => (
            <div
              key={stage}
              className="w-72 shrink-0 rounded-xl border border-dashed border-clinical-line bg-white/80 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) setViloStage(id, stage);
                setDragId(null);
              }}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-clinical-ink">{stage}</span>
                <span className="text-[11px] text-clinical-muted">
                  {filtered.filter((o) => o.status === stage).length}
                </span>
              </div>
              <div className="space-y-2">
                {filtered
                  .filter((o) => o.status === stage)
                  .map((o) => {
                    const overdue =
                      o.nextFollowupDate &&
                      isDateBeforeToday(o.nextFollowupDate) &&
                      o.status !== "Closed Lost";
                    return (
                      <div
                        key={o.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", o.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragId(o.id);
                        }}
                        onDragEnd={() => setDragId(null)}
                        className={cn(
                          "cursor-grab rounded-lg border border-clinical-line bg-white p-3 shadow-card active:cursor-grabbing",
                          dragId === o.id && "opacity-70 ring-2 ring-vilo-300"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-clinical-ink">{o.companyName}</div>
                            <div className="truncate text-xs text-clinical-muted">{o.contactName}</div>
                          </div>
                          <Badge tone={o.priority === "High" ? "alert" : "vilo"}>{o.priority}</Badge>
                        </div>
                        <div className="mt-2 text-xs text-clinical-muted">{o.therapeuticArea || "—"}</div>
                        <div className="mt-1 text-xs text-clinical-ink">
                          Value:{" "}
                          <span className="font-medium">{o.potentialValue ? `$${o.potentialValue}` : "—"}</span>
                        </div>
                        <div
                          className={cn(
                            "mt-2 text-xs",
                            overdue ? "font-semibold text-clinical-alert" : "text-clinical-muted"
                          )}
                        >
                          Next: {o.nextFollowupDate || "—"}
                          {overdue ? " · overdue" : ""}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => openEdit(o)}>
                            Edit
                          </Button>
                          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => handleDelete(o)}>
                            Delete
                          </Button>
                          <Select
                            className="min-w-0 flex-1 py-1 text-xs"
                            value={o.status}
                            onChange={(e) => setViloStage(o.id, e.target.value as ViloStage)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {VILO_STAGES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold text-clinical-ink">Pipeline by stage</div>
          <StageBars items={stageCounts} accent="vilo" />
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit opportunity" : "New opportunity"}
        wide
      >
        <ViloOpportunityForm initial={editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}
