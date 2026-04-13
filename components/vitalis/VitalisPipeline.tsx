"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { StageBars } from "@/components/charts/StageBars";
import { ViewToggle } from "@/components/pipeline/ViewToggle";
import { VITALIS_STAGES, type VitalisStage } from "@/lib/constants";
import { isDateBeforeToday } from "@/lib/dates";
import { useCrmStore } from "@/lib/store";
import type { PatientLead } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useMemo, useState } from "react";
import { PatientLeadForm } from "./PatientLeadForm";

function langTone(lang: string): "vilo" | "vitalis" | "neutral" | "alert" | "success" {
  const u = lang.toUpperCase();
  if (u.includes("ES")) return "vitalis";
  if (u.includes("EN")) return "vilo";
  return "neutral";
}

function langLabel(lang: string): string {
  const u = lang.toUpperCase();
  if (!u) return "—";
  if (u.includes("ES") && u.includes("EN")) return "ES/EN";
  if (u.includes("ES")) return "ES";
  if (u.includes("EN")) return "EN";
  return lang.slice(0, 3);
}

export function VitalisPipeline() {
  const leads = useCrmStore((s) => s.patientLeads);
  const addPatientLead = useCrmStore((s) => s.addPatientLead);
  const updatePatientLead = useCrmStore((s) => s.updatePatientLead);
  const deletePatientLead = useCrmStore((s) => s.deletePatientLead);
  const setVitalisStage = useCrmStore((s) => s.setVitalisStage);

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filterStage, setFilterStage] = useState<VitalisStage | "All">("All");
  const [filterLang, setFilterLang] = useState<"All" | "ES" | "EN">("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PatientLead | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filterStage !== "All" && l.currentStage !== filterStage) return false;
      if (filterLang === "All") return true;
      const u = l.preferredLanguage.toUpperCase();
      if (filterLang === "ES") return u.includes("ES");
      if (filterLang === "EN") return u.includes("EN");
      return true;
    });
  }, [leads, filterStage, filterLang]);

  const stageCounts = useMemo(() => {
    return VITALIS_STAGES.map((s) => ({
      label: s,
      value: leads.filter((l) => l.currentStage === s).length,
    }));
  }, [leads]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(l: PatientLead) {
    setEditing(l);
    setModalOpen(true);
  }

  function handleSubmit(values: Omit<PatientLead, "id" | "createdAt" | "updatedAt">) {
    if (editing) {
      updatePatientLead(editing.id, values);
    } else {
      addPatientLead(values);
    }
    setModalOpen(false);
    setEditing(null);
  }

  function handleDelete(l: PatientLead) {
    if (!window.confirm(`Delete lead ${l.fullName}?`)) return;
    deletePatientLead(l.id);
  }

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-vitalis-700">Vitalis</div>
          <h1 className="text-2xl font-semibold text-clinical-ink">B2C patient pipeline</h1>
          <p className="mt-1 max-w-xl text-sm text-clinical-muted">
            Patient leads, prescreening, and enrollment. Kept separate from Vilo B2B records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={openNew}>New lead</Button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          className="w-52"
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value as VitalisStage | "All")}
        >
          <option value="All">All stages</option>
          {VITALIS_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select className="w-40" value={filterLang} onChange={(e) => setFilterLang(e.target.value as typeof filterLang)}>
          <option value="All">All languages</option>
          <option value="ES">ES</option>
          <option value="EN">EN</option>
        </Select>
      </div>

      {view === "list" ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-clinical-line bg-vitalis-50/50 text-xs uppercase text-clinical-muted">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Language</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Next action</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const overdue = l.nextAction && isDateBeforeToday(l.nextAction);
                return (
                  <tr key={l.id} className="border-b border-clinical-line last:border-0">
                    <td className="px-3 py-2 font-medium">{l.fullName}</td>
                    <td className="px-3 py-2">
                      <Badge tone="vitalis">{l.currentStage}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={langTone(l.preferredLanguage)}>{langLabel(l.preferredLanguage)}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-clinical-muted">{l.preferredContactChannel || "—"}</td>
                    <td className={cn("px-3 py-2 text-xs", overdue && "font-semibold text-clinical-alert")}>
                      {l.nextAction || "—"}
                    </td>
                    <td className="space-x-2 px-3 py-2 text-right">
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => openEdit(l)}>
                        Edit
                      </Button>
                      <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => handleDelete(l)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-clinical-muted">
                    No leads match filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {VITALIS_STAGES.map((stage) => (
            <div
              key={stage}
              className="w-72 shrink-0 rounded-xl border border-dashed border-clinical-line bg-white/80 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) setVitalisStage(id, stage);
                setDragId(null);
              }}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-clinical-ink">{stage}</span>
                <span className="text-[11px] text-clinical-muted">
                  {filtered.filter((l) => l.currentStage === stage).length}
                </span>
              </div>
              <div className="space-y-2">
                {filtered
                  .filter((l) => l.currentStage === stage)
                  .map((l) => {
                    const overdue = l.nextAction && isDateBeforeToday(l.nextAction);
                    return (
                      <div
                        key={l.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", l.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragId(l.id);
                        }}
                        onDragEnd={() => setDragId(null)}
                        className={cn(
                          "cursor-grab rounded-lg border border-clinical-line bg-white p-3 shadow-card active:cursor-grabbing",
                          dragId === l.id && "opacity-70 ring-2 ring-vitalis-300"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-clinical-ink">{l.fullName}</div>
                            <div className="truncate text-xs text-clinical-muted">{l.sourceCampaign || "—"}</div>
                          </div>
                          <Badge tone={langTone(l.preferredLanguage)}>{langLabel(l.preferredLanguage)}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {l.preferredContactChannel && (
                            <Badge tone="neutral">{l.preferredContactChannel}</Badge>
                          )}
                        </div>
                        <div
                          className={cn(
                            "mt-2 text-xs",
                            overdue ? "font-semibold text-clinical-alert" : "text-clinical-muted"
                          )}
                        >
                          Next: {l.nextAction || "—"}
                          {overdue ? " · overdue" : ""}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => openEdit(l)}>
                            Edit
                          </Button>
                          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => handleDelete(l)}>
                            Delete
                          </Button>
                          <Select
                            className="min-w-0 flex-1 py-1 text-xs"
                            value={l.currentStage}
                            onChange={(e) => setVitalisStage(l.id, e.target.value as VitalisStage)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {VITALIS_STAGES.map((s) => (
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

      <div className="mt-8">
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold text-clinical-ink">Pipeline by stage</div>
          <StageBars items={stageCounts} accent="vitalis" />
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit patient lead" : "New patient lead"}
        wide
      >
        <PatientLeadForm initial={editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}
