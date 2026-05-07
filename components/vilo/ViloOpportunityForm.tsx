"use client";

import { PRIORITIES, VILO_STAGES, type Priority, type ViloStage } from "@/lib/constants";
import type { ViloOpportunity } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useEffect, useState } from "react";

type ViloFormValues = Omit<
  ViloOpportunity,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "organizationId"
  | "primaryContactId"
  | "feasibilitySentAt"
  | "negotiationEnteredAt"
  | "closedWonAt"
  | "closedLostAt"
>;

function opportunityToForm(o: ViloOpportunity): ViloFormValues {
  return {
    companyName: o.companyName,
    contactName: o.contactName,
    role: o.role,
    email: o.email,
    phone: o.phone,
    therapeuticArea: o.therapeuticArea,
    opportunityType: o.opportunityType,
    source: o.source,
    lastContactDate: o.lastContactDate,
    nextFollowupDate: o.nextFollowupDate,
    status: o.status,
    notes: o.notes,
    potentialValue: o.potentialValue,
    priority: o.priority,
  };
}

const empty: ViloFormValues = {
  companyName: "",
  contactName: "",
  role: "",
  email: "",
  phone: "",
  therapeuticArea: "",
  opportunityType: "",
  source: "",
  lastContactDate: "",
  nextFollowupDate: "",
  status: "Lead Identified",
  notes: "",
  potentialValue: "",
  priority: "Medium",
};

const OPPORTUNITY_TYPES = ["Study", "Biospecimen", "IVD", "Partnership", "Vendor"] as const;

export function ViloOpportunityForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: ViloOpportunity | null;
  onSubmit: (values: Omit<ViloOpportunity, "id" | "createdAt" | "updatedAt">) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<ViloFormValues>(() => (initial ? opportunityToForm(initial) : { ...empty }));

  useEffect(() => {
    setV(initial ? opportunityToForm(initial) : { ...empty });
  }, [initial]);

  function patch<K extends keyof typeof v>(key: K, val: (typeof v)[K]) {
    setV((s) => ({ ...s, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.companyName.trim()) return;
    await onSubmit({
      ...v,
      status: v.status as ViloStage,
      priority: v.priority as Priority,
      organizationId: initial?.organizationId,
      primaryContactId: initial?.primaryContactId,
      feasibilitySentAt: initial?.feasibilitySentAt,
      negotiationEnteredAt: initial?.negotiationEnteredAt,
      closedWonAt: initial?.closedWonAt,
      closedLostAt: initial?.closedLostAt,
    });
  }

  const grid = "grid gap-3 md:grid-cols-2";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className={grid}>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Organization</span>
          <Input required value={v.companyName} onChange={(e) => patch("companyName", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Contact name</span>
          <Input value={v.contactName} onChange={(e) => patch("contactName", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Role</span>
          <Input value={v.role} onChange={(e) => patch("role", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Email</span>
          <Input type="email" value={v.email} onChange={(e) => patch("email", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Phone</span>
          <Input value={v.phone} onChange={(e) => patch("phone", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Indication</span>
          <Input value={v.therapeuticArea} onChange={(e) => patch("therapeuticArea", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Opportunity type</span>
          <Select value={v.opportunityType} onChange={(e) => patch("opportunityType", e.target.value)}>
            <option value="">Select type</option>
            {OPPORTUNITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Source</span>
          <Input value={v.source} onChange={(e) => patch("source", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Last contact date</span>
          <Input type="date" value={v.lastContactDate} onChange={(e) => patch("lastContactDate", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Next step date</span>
          <Input type="date" value={v.nextFollowupDate} onChange={(e) => patch("nextFollowupDate", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Status</span>
          <Select value={v.status} onChange={(e) => patch("status", e.target.value as ViloStage)}>
            {VILO_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Expected revenue</span>
          <Input value={v.potentialValue} onChange={(e) => patch("potentialValue", e.target.value)} placeholder="e.g. 125000" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Priority</span>
          <Select value={v.priority} onChange={(e) => patch("priority", e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-clinical-muted">Next action / notes</span>
        <Textarea value={v.notes} onChange={(e) => patch("notes", e.target.value)} />
      </label>
      <div className="flex justify-end gap-2 border-t border-clinical-line pt-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{initial ? "Save changes" : "Create opportunity"}</Button>
      </div>
    </form>
  );
}
