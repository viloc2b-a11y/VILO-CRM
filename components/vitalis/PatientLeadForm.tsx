"use client";

import { VITALIS_STAGES, type VitalisStage } from "@/lib/constants";
import type { PatientLead } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useEffect, useState } from "react";

type LeadFormValues = Omit<
  PatientLead,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "firstOutreachAt"
  | "respondedAt"
  | "prescreenStartedAt"
  | "appointmentAt"
  | "appointmentOutcomeRecordedAt"
  | "enrolledAt"
>;

function leadToForm(l: PatientLead): LeadFormValues {
  return {
    fullName: l.fullName,
    phone: l.phone,
    email: l.email,
    preferredLanguage: l.preferredLanguage,
    ageRange: l.ageRange,
    gender: l.gender,
    conditionOrStudyInterest: l.conditionOrStudyInterest,
    sourceCampaign: l.sourceCampaign,
    zipCode: l.zipCode,
    preferredContactChannel: l.preferredContactChannel,
    lastContactDate: l.lastContactDate,
    nextAction: l.nextAction,
    currentStage: l.currentStage,
    screenFailReason: l.screenFailReason,
    notes: l.notes,
  };
}

const empty: LeadFormValues = {
  fullName: "",
  phone: "",
  email: "",
  preferredLanguage: "",
  ageRange: "",
  gender: "",
  conditionOrStudyInterest: "",
  sourceCampaign: "",
  zipCode: "",
  preferredContactChannel: "",
  lastContactDate: "",
  nextAction: "",
  currentStage: "New Lead",
  screenFailReason: "",
  notes: "",
};

export function PatientLeadForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: PatientLead | null;
  onSubmit: (values: Omit<PatientLead, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<LeadFormValues>({ ...empty });

  useEffect(() => {
    setV(initial ? leadToForm(initial) : { ...empty });
  }, [initial]);

  function patch<K extends keyof typeof v>(key: K, val: (typeof v)[K]) {
    setV((s) => ({ ...s, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.fullName.trim() || !v.phone.trim()) return;
    onSubmit({
      ...v,
      currentStage: v.currentStage as VitalisStage,
      firstOutreachAt: initial?.firstOutreachAt,
      respondedAt: initial?.respondedAt,
      prescreenStartedAt: initial?.prescreenStartedAt,
      appointmentAt: initial?.appointmentAt,
      appointmentOutcomeRecordedAt: initial?.appointmentOutcomeRecordedAt,
      enrolledAt: initial?.enrolledAt,
    });
  }

  const showScreenFail = v.currentStage === "Screen Fail";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Full name</span>
          <Input required value={v.fullName} onChange={(e) => patch("fullName", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Phone</span>
          <Input required value={v.phone} onChange={(e) => patch("phone", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Email</span>
          <Input type="email" value={v.email} onChange={(e) => patch("email", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Preferred language</span>
          <Select value={v.preferredLanguage} onChange={(e) => patch("preferredLanguage", e.target.value)}>
            <option value="">—</option>
            <option value="ES">ES</option>
            <option value="EN">EN</option>
            <option value="ES/EN">ES/EN</option>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Age range</span>
          <Input value={v.ageRange} onChange={(e) => patch("ageRange", e.target.value)} placeholder="e.g. 45-54" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Gender</span>
          <Input value={v.gender} onChange={(e) => patch("gender", e.target.value)} />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-medium text-clinical-muted">Condition / study interest</span>
          <Input value={v.conditionOrStudyInterest} onChange={(e) => patch("conditionOrStudyInterest", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Source campaign</span>
          <Input value={v.sourceCampaign} onChange={(e) => patch("sourceCampaign", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">ZIP code</span>
          <Input value={v.zipCode} onChange={(e) => patch("zipCode", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Preferred contact channel</span>
          <Select
            value={v.preferredContactChannel}
            onChange={(e) => patch("preferredContactChannel", e.target.value)}
          >
            <option value="">—</option>
            <option value="Phone">Phone</option>
            <option value="SMS">SMS</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Email">Email</option>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Last contact date</span>
          <Input type="date" value={v.lastContactDate} onChange={(e) => patch("lastContactDate", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-clinical-muted">Next action (date)</span>
          <Input type="date" value={v.nextAction} onChange={(e) => patch("nextAction", e.target.value)} />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-medium text-clinical-muted">Current stage</span>
          <Select value={v.currentStage} onChange={(e) => patch("currentStage", e.target.value as VitalisStage)}>
            {VITALIS_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
        {showScreenFail && (
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-clinical-muted">Screen fail reason</span>
            <Input value={v.screenFailReason} onChange={(e) => patch("screenFailReason", e.target.value)} />
          </label>
        )}
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-clinical-muted">Notes</span>
        <Textarea value={v.notes} onChange={(e) => patch("notes", e.target.value)} />
      </label>
      <div className="flex justify-end gap-2 border-t border-clinical-line pt-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{initial ? "Save lead" : "Create lead"}</Button>
      </div>
    </form>
  );
}
