"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { ViewToggle } from "@/components/pipeline/ViewToggle";
import { PRIORITIES, VILO_STAGES, type Priority, type ViloStage } from "@/lib/constants";
import { isDateBeforeToday } from "@/lib/dates";
import { useCrmStore } from "@/lib/store";
import type { ViloOpportunity } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { ViloOpportunityForm } from "./ViloOpportunityForm";

const ACTIVE_STAGES = new Set<ViloStage>([
  "Lead Identified",
  "Outreach Sent",
  "Response Received",
  "Intro Call Pending",
  "Feasibility Sent",
  "Budget / CTA",
  "Startup",
  "Active Study",
]);

const STAGE_PROBABILITY: Record<ViloStage, number> = {
  "Lead Identified": 10,
  "Outreach Sent": 15,
  "Response Received": 25,
  "Intro Call Pending": 35,
  "Feasibility Sent": 45,
  "Budget / CTA": 65,
  Startup: 80,
  "Active Study": 90,
  "Closed Won": 100,
  "Closed Lost": 0,
};

const OPPORTUNITY_TYPES = ["Study", "Biospecimen", "IVD", "Partnership", "Vendor"];

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function expectedRevenue(o: ViloOpportunity): number {
  const parsed = Number.parseFloat(String(o.potentialValue || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function displayType(type: string): string {
  if (OPPORTUNITY_TYPES.includes(type)) return type;
  if (!type) return "Study";
  if (type.includes("Lab")) return "Biospecimen";
  return "Study";
}

function nextStep(o: ViloOpportunity): string {
  return o.nextFollowUp || o.notes || "Create next follow-up";
}

export function ViloPipeline() {
  const opps = useCrmStore((s) => s.viloOpportunities);
  const organizations = useCrmStore((s) => s.organizations);
  const contacts = useCrmStore((s) => s.contacts);
  const addViloOpportunity = useCrmStore((s) => s.addViloOpportunity);
  const updateViloOpportunity = useCrmStore((s) => s.updateViloOpportunity);
  const deleteViloOpportunity = useCrmStore((s) => s.deleteViloOpportunity);
  const setViloStage = useCrmStore((s) => s.setViloStage);
  const loadViloOpps = useCrmStore((s) => s.loadViloOpps);
  const loadOrganizations = useCrmStore((s) => s.loadOrganizations);
  const loadContacts = useCrmStore((s) => s.loadContacts);

  useEffect(() => {
    void loadViloOpps();
    void loadOrganizations();
    void loadContacts();
  }, [loadViloOpps, loadOrganizations, loadContacts]);

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filterStage, setFilterStage] = useState<ViloStage | "All">("All");
  const [filterPriority, setFilterPriority] = useState<Priority | "All">("All");
  const [filterOrg, setFilterOrg] = useState<string>("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ViloOpportunity | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const orgNameById = useMemo(() => new Map(organizations.map((o) => [o.id, o.name])), [organizations]);
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c.name])), [contacts]);
  const linkedOpps = useMemo(() => opps.filter((o) => o.organizationId), [opps]);
  const activeOpps = useMemo(() => linkedOpps.filter((o) => ACTIVE_STAGES.has(o.status)), [linkedOpps]);

  const filtered = useMemo(() => {
    return linkedOpps.filter((o) => {
      if (filterStage !== "All" && o.status !== filterStage) return false;
      if (filterPriority !== "All" && o.priority !== filterPriority) return false;
      if (filterOrg !== "All" && o.organizationId !== filterOrg) return false;
      return true;
    });
  }, [linkedOpps, filterStage, filterPriority, filterOrg]);

  const summary = useMemo(() => {
    const pipelineValue = activeOpps.reduce((sum, o) => sum + expectedRevenue(o), 0);
    const weightedPipelineValue = activeOpps.reduce(
      (sum, o) => sum + expectedRevenue(o) * (STAGE_PROBABILITY[o.status] / 100),
      0
    );
    const stuck = activeOpps.filter((o) => {
      const age = daysSince(o.lastContactDate || o.updatedAt);
      return age != null && age > 7;
    }).length;
    const withoutNextStep = activeOpps.filter((o) => !o.nextFollowupDate && !o.nextFollowUp).length;
    return { pipelineValue, weightedPipelineValue, stuck, withoutNextStep };
  }, [activeOpps]);

  function openNew() {
    window.location.href = "/dashboard/ingestion";
  }

  function openEdit(o: ViloOpportunity) {
    setEditing(o);
    setModalOpen(true);
  }

  async function handleSubmit(values: Omit<ViloOpportunity, "id" | "createdAt" | "updatedAt">) {
    try {
      if (editing) await updateViloOpportunity(editing.id, values);
      else await addViloOpportunity(values);
      setModalOpen(false);
      setEditing(null);
    } catch (e) {
      console.error(e);
      window.alert(e instanceof Error ? e.message : "Could not save opportunity");
    }
  }

  async function handleDelete(o: ViloOpportunity) {
    if (!window.confirm(`Delete opportunity for ${o.companyName}?`)) return;
    try {
      await deleteViloOpportunity(o.id);
    } catch (e) {
      console.error(e);
      window.alert(e instanceof Error ? e.message : "Could not delete opportunity");
    }
  }

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Vilo Research Group</div>
          <h1 className="text-2xl font-semibold text-clinical-ink">Opportunity pipeline</h1>
          <p className="mt-1 max-w-2xl text-sm text-clinical-muted">
            Sponsor/CRO opportunities, stuck deals, revenue exposure, and the next action required.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={openNew}>Create opportunity</Button>
        </div>
      </header>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <PipelineKpi label="Pipeline value" value={money(summary.pipelineValue)} />
        <PipelineKpi label="Weighted pipeline" value={money(summary.weightedPipelineValue)} />
        <PipelineKpi label="Deals stuck >7d" value={String(summary.stuck)} alert={summary.stuck > 0} />
        <PipelineKpi label="Without next step" value={String(summary.withoutNextStep)} alert={summary.withoutNextStep > 0} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          className="w-56"
          value={filterOrg}
          onChange={(e) => setFilterOrg(e.target.value)}
        >
          <option value="All">All organizations</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </Select>
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

      {linkedOpps.length === 0 ? (
        <EmptyPipeline onCreate={openNew} />
      ) : view === "list" ? (
        <PipelineTable rows={filtered} onEdit={openEdit} onDelete={handleDelete} orgNameById={orgNameById} contactById={contactById} />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {VILO_STAGES.map((stage) => (
            <div
              key={stage}
              className="w-80 shrink-0 rounded-xl border border-dashed border-clinical-line bg-white/80 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) void setViloStage(id, stage);
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
                  .map((o) => (
                    <OpportunityCard
                      key={o.id}
                      opportunity={o}
                      dragging={dragId === o.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", o.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(o.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onEdit={() => openEdit(o)}
                      onDelete={() => void handleDelete(o)}
                      onStage={(s) => void setViloStage(o.id, s)}
                      organizationName={orgNameById.get(o.organizationId ?? "") ?? o.companyName}
                      primaryContact={contactById.get(o.primaryContactId ?? "") ?? o.contactName}
                    />
                  ))}
                {filtered.filter((o) => o.status === stage).length === 0 ? (
                  <div className="rounded-lg border border-clinical-line bg-clinical-paper px-3 py-4 text-xs text-clinical-muted">
                    No records in this stage.
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit opportunity" : "Create opportunity"}
        wide
      >
        <ViloOpportunityForm initial={editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}

function PipelineKpi({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <Card className={cn("px-4 py-3", alert && "border-clinical-alert/50")}>
      <div className="text-xs font-medium text-clinical-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", alert ? "text-clinical-alert" : "text-clinical-ink")}>
        {value}
      </div>
    </Card>
  );
}

function EmptyPipeline({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto max-w-md">
        <h2 className="text-base font-semibold text-clinical-ink">No active opportunities yet.</h2>
        <p className="mt-2 text-sm text-clinical-muted">
          Start by adding a sponsor/CRO opportunity so the CRM can track next steps, budget follow-ups, and revenue at risk.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={onCreate}>Create opportunity</Button>
          <Button variant="secondary" onClick={() => (window.location.href = "/contacts")}>
            Add sponsor/CRO
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PipelineTable({
  rows,
  onEdit,
  onDelete,
  orgNameById,
  contactById,
}: {
  rows: ViloOpportunity[];
  onEdit: (o: ViloOpportunity) => void;
  onDelete: (o: ViloOpportunity) => void;
  orgNameById: Map<string, string>;
  contactById: Map<string, string>;
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-clinical-line bg-vilo-50/60 text-xs uppercase text-clinical-muted">
          <tr>
            <th className="px-3 py-2">Opportunity</th>
            <th className="px-3 py-2">Organization</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Indication</th>
            <th className="px-3 py-2 text-right">Expected revenue</th>
            <th className="px-3 py-2">Probability</th>
            <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2">Next step</th>
            <th className="px-3 py-2">Next step date</th>
            <th className="px-3 py-2">Last contact</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const overdue = o.nextFollowupDate && isDateBeforeToday(o.nextFollowupDate) && ACTIVE_STAGES.has(o.status);
            return (
              <tr key={o.id} className="border-b border-clinical-line last:border-0">
                <td className="px-3 py-2 font-medium text-clinical-ink">{o.companyName} opportunity</td>
                <td className="px-3 py-2 text-clinical-muted">
                  {o.organizationId ? (
                    <a className="font-medium text-vilo-600 hover:underline" href={`/dashboard/organizations/${o.organizationId}`}>
                      {orgNameById.get(o.organizationId) ?? o.companyName}
                    </a>
                  ) : (
                    "Organization required"
                  )}
                  <div className="text-[11px] text-clinical-muted">
                    {(contactById.get(o.primaryContactId ?? "") ?? o.contactName) || "No primary contact"}
                  </div>
                </td>
                <td className="px-3 py-2">{displayType(o.opportunityType)}</td>
                <td className="px-3 py-2 text-clinical-muted">{o.therapeuticArea || "Add indication"}</td>
                <td className="px-3 py-2 text-right font-mono">{money(expectedRevenue(o))}</td>
                <td className="px-3 py-2">{STAGE_PROBABILITY[o.status]}%</td>
                <td className="px-3 py-2">
                  <Badge tone={o.status === "Closed Lost" ? "alert" : "vilo"}>{o.status}</Badge>
                </td>
                <td className="px-3 py-2 text-clinical-muted">{o.decisionMakerRole || "Unassigned"}</td>
                <td className="max-w-[220px] px-3 py-2 text-clinical-ink">{nextStep(o)}</td>
                <td className={cn("px-3 py-2", overdue && "font-semibold text-clinical-alert")}>
                  {o.nextFollowupDate || "Create follow-up"}
                </td>
                <td className="px-3 py-2 text-clinical-muted">{o.lastContactDate || "No contact logged"}</td>
                <td className="space-x-2 px-3 py-2 text-right">
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onEdit(o)}>
                    Open record
                  </Button>
                  <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => onDelete(o)}>
                    Delete
                  </Button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={12} className="px-3 py-8 text-center text-sm text-clinical-muted">
                No opportunities match these filters. Clear filters or create a new opportunity.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function OpportunityCard({
  opportunity,
  dragging,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
  onStage,
  organizationName,
  primaryContact,
}: {
  opportunity: ViloOpportunity;
  dragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStage: (s: ViloStage) => void;
  organizationName: string;
  primaryContact: string;
}) {
  const overdue =
    opportunity.nextFollowupDate && isDateBeforeToday(opportunity.nextFollowupDate) && ACTIVE_STAGES.has(opportunity.status);
  const stale = ACTIVE_STAGES.has(opportunity.status) && (daysSince(opportunity.lastContactDate || opportunity.updatedAt) ?? 0) > 7;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-lg border border-clinical-line bg-white p-3 shadow-card active:cursor-grabbing",
        dragging && "opacity-70 ring-2 ring-vilo-300",
        (overdue || stale) && "border-clinical-alert/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-clinical-ink">{opportunity.companyName} opportunity</div>
          <div className="truncate text-xs text-clinical-muted">{organizationName}</div>
          <div className="truncate text-[11px] text-clinical-muted">{primaryContact || "No primary contact"}</div>
        </div>
        <Badge tone={opportunity.priority === "High" ? "alert" : "vilo"}>{opportunity.priority}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-clinical-muted">Type</div>
          <div className="font-medium text-clinical-ink">{displayType(opportunity.opportunityType)}</div>
        </div>
        <div>
          <div className="text-clinical-muted">Probability</div>
          <div className="font-medium text-clinical-ink">{STAGE_PROBABILITY[opportunity.status]}%</div>
        </div>
        <div>
          <div className="text-clinical-muted">Revenue</div>
          <div className="font-medium text-clinical-ink">{money(expectedRevenue(opportunity))}</div>
        </div>
        <div>
          <div className="text-clinical-muted">Indication</div>
          <div className="truncate font-medium text-clinical-ink">{opportunity.therapeuticArea || "Add"}</div>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-clinical-line bg-clinical-paper px-2 py-2 text-xs">
        <div className="font-semibold text-clinical-ink">{nextStep(opportunity)}</div>
        <div className={cn("mt-1 text-clinical-muted", overdue && "font-semibold text-clinical-alert")}>
          Due {opportunity.nextFollowupDate || "not scheduled"}
          {overdue ? " · overdue" : ""}
        </div>
      </div>
      <div className="mt-2 text-xs text-clinical-muted">
        Last contact: {opportunity.lastContactDate || "No contact logged"}
        {stale ? <span className="font-semibold text-clinical-alert"> · stuck</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onEdit}>
          Open record
        </Button>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onDelete}>
          Delete
        </Button>
        <Select
          className="min-w-0 flex-1 py-1 text-xs"
          value={opportunity.status}
          onChange={(e) => onStage(e.target.value as ViloStage)}
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
}
