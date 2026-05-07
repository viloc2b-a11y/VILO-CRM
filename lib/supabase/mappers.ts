/**
 * Maps between app models (camelCase, Zustand / UI) and Supabase rows (snake_case, enums v1.0).
 * UI components stay unchanged — call these only from hooks or sync jobs that use repositories.
 *
 * Schema gaps (no matching DB column in 01_schema.sql — kept app-only until you extend SQL):
 * - ViloOpportunity: feasibilitySentAt, negotiationEnteredAt, closedWonAt, closedLostAt
 * - PatientLead: firstOutreachAt, respondedAt, prescreenStartedAt, appointmentAt, appointmentOutcomeRecordedAt, enrolledAt
 * - Contact: therapeuticArea (not persisted to contacts table)
 * - TaskItem: notes (tasks table has no notes column)
 */

import type { Priority, TaskChannel, ViloStage as AppViloStage, VitalisStage } from "@/lib/constants";
import type { Contact, Organization, PatientLead, TaskItem, ViloOpportunity } from "@/lib/types";
import type {
  AgeRangeValue,
  ContactChannel,
  ContactRow,
  GenderValue,
  LeadSource,
  OpportunityType,
  OrganizationRow,
  PatientLeadRow,
  PreferredContactMethod,
  PreferredLanguage,
  TaskRow,
  ViloOpportunityRow,
  ViloStage as DbViloStage,
} from "@/lib/supabase/types";

const OPPORTUNITY_TYPES: OpportunityType[] = [
  "Study",
  "Biospecimen",
  "IVD",
  "Partnership",
  "Vendor",
  "Phase I",
  "Phase II",
  "Phase III",
  "Phase IV",
  "Observational",
  "Registry",
  "Lab/Biobank",
];

const LEAD_SOURCES: LeadSource[] = [
  "LinkedIn",
  "Apollo",
  "ClinicalTrials.gov",
  "Conference",
  "Referral",
  "Cold Email",
  "Other",
];

const GENDERS: GenderValue[] = ["Female", "Male", "Non-binary", "Prefer not to say"];

const AGE_RANGES: AgeRangeValue[] = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

export function viloStageAppToDb(s: AppViloStage): DbViloStage {
  if (s === "Budget / CTA") return "Negotiation";
  if (s === "Closed Won") return "Activated";
  return s as DbViloStage;
}

export function viloStageDbToApp(s: DbViloStage): AppViloStage {
  if (s === "Negotiation") return "Budget / CTA";
  if (s === "Activated") return "Closed Won";
  if (s === "Nurture") return "Lead Identified";
  return s as AppViloStage;
}

export function mapOpportunityTypeToDb(s: string | undefined | null): OpportunityType | null {
  if (!s) return null;
  const t = s.trim();
  return OPPORTUNITY_TYPES.includes(t as OpportunityType) ? (t as OpportunityType) : null;
}

export function mapSourceToLeadSource(s: string | undefined | null): LeadSource | null {
  if (!s) return null;
  const t = s.trim();
  if (LEAD_SOURCES.includes(t as LeadSource)) return t as LeadSource;
  const lower = t.toLowerCase();
  if (lower.includes("linkedin")) return "LinkedIn";
  if (lower.includes("conference")) return "Conference";
  if (lower.includes("referral")) return "Referral";
  if (lower.includes("clinicaltrials")) return "ClinicalTrials.gov";
  return "Other";
}

export function mapPreferredLanguageToDb(s: string | undefined | null): PreferredLanguage {
  const u = (s ?? "").trim().toUpperCase();
  if (u === "EN" || u === "ENGLISH") return "English";
  if (u === "ES" || u === "SPANISH" || u === "ESPAÑOL") return "Spanish";
  if (u.includes("BILING") || u === "ES/EN") return "Bilingual";
  return "Spanish";
}

export function mapPreferredLanguageToApp(lang: PreferredLanguage): string {
  if (lang === "English") return "EN";
  if (lang === "Bilingual") return "ES/EN";
  return "ES";
}

export function mapGenderToDb(s: string | undefined | null): GenderValue | null {
  if (!s) return null;
  const t = s.trim();
  if (GENDERS.includes(t as GenderValue)) return t as GenderValue;
  if (t.toLowerCase() === "non-binary" || t === "Non_binary") return "Non-binary";
  return null;
}

export function mapGenderToApp(g: GenderValue | null): string {
  return g ?? "";
}

export function mapAgeRangeToDb(s: string | undefined | null): AgeRangeValue | null {
  if (!s) return null;
  const t = s.replace(/_/g, "-").trim();
  const normalized = AGE_RANGES.includes(t as AgeRangeValue) ? (t as AgeRangeValue) : null;
  if (normalized) return normalized;
  if (t === "65+") return "65+";
  return null;
}

export function mapAgeRangeToApp(a: AgeRangeValue | null): string {
  return a ?? "";
}

export function mapContactChannelToDb(s: string | undefined | null): ContactChannel {
  const t = (s ?? "").trim();
  const allowed: ContactChannel[] = ["WhatsApp", "Phone", "SMS", "Email"];
  if (allowed.includes(t as ContactChannel)) return t as ContactChannel;
  if (t.toLowerCase() === "sms") return "SMS";
  return "WhatsApp";
}

export function mapContactChannelToApp(c: ContactChannel): string {
  return c;
}

export function mapTaskChannelToDb(ch: TaskChannel): "vilo" | "vitalis" {
  return ch === "vitalis" ? "vitalis" : "vilo";
}

export function mapTaskChannelToApp(ch: "vilo" | "vitalis"): TaskChannel {
  return ch;
}

export function dueAtToDateOnly(iso: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10);
}

export function dateOnlyToDueAt(date: string): string {
  return `${date}T12:00:00.000Z`;
}

export function organizationRowToApp(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    website: row.website ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export function organizationToDbInsert(o: Omit<Organization, "id" | "createdAt"> & { id?: string }) {
  const base = {
    name: o.name,
    website: o.website ?? null,
    notes: o.notes ?? null,
    type: "Partner" as const,
    archived: false,
  };
  return o.id ? { ...base, id: o.id } : base;
}

export function organizationToDbUpdate(patch: Partial<Organization>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.website !== undefined) out.website = patch.website ?? null;
  if (patch.notes !== undefined) out.notes = patch.notes ?? null;
  return out;
}

export function contactRowToApp(row: ContactRow): Contact {
  return {
    id: row.id,
    organizationId: row.org_id ?? "",
    name: row.full_name,
    role: row.role ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    therapeuticArea: undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export function contactToDbInsert(
  c: Omit<Contact, "id" | "createdAt"> & { id?: string },
  preferredContact: PreferredContactMethod = "Email"
) {
  const base = {
    org_id: c.organizationId || null,
    full_name: c.name,
    role: c.role ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    preferred_contact: preferredContact,
    notes: c.notes ?? null,
    archived: false,
  };
  return c.id ? { ...base, id: c.id } : base;
}

export function contactToDbUpdate(patch: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.organizationId !== undefined) out.org_id = patch.organizationId || null;
  if (patch.name !== undefined) out.full_name = patch.name;
  if (patch.role !== undefined) out.role = patch.role ?? null;
  if (patch.email !== undefined) out.email = patch.email ?? null;
  if (patch.phone !== undefined) out.phone = patch.phone ?? null;
  if (patch.notes !== undefined) out.notes = patch.notes ?? null;
  return out;
}

export function viloRowToApp(row: ViloOpportunityRow): ViloOpportunity {
  return {
    id: row.id,
    organizationId: row.org_id ?? undefined,
    primaryContactId: row.contact_id ?? undefined,
    companyName: row.company_name,
    contactName: row.contact_name ?? "",
    role: row.role ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    therapeuticArea: row.therapeutic_area ?? "",
    opportunityType: row.opportunity_type ?? "",
    source: row.source ?? "",
    lastContactDate: row.last_contact_date ?? "",
    nextFollowupDate: row.next_followup_date ?? "",
    status: viloStageDbToApp(row.status),
    notes: row.notes ?? "",
    potentialValue: row.potential_value != null ? String(row.potential_value) : "",
    priority: row.priority as Priority,
    feasibilitySentAt: undefined,
    negotiationEnteredAt: undefined,
    closedWonAt: undefined,
    closedLostAt: undefined,
    decisionMakerRole: row.decision_maker_role ?? undefined,
    lastInteractionType: row.last_interaction_type ?? undefined,
    nextFollowUp: row.next_follow_up ?? undefined,
    relationshipStrength: row.relationship_strength ?? undefined,
    enrichmentStatus: row.enrichment_status ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function viloToDbInsert(o: Omit<ViloOpportunity, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const base = {
    org_id: o.organizationId ?? null,
    contact_id: o.primaryContactId ?? null,
    company_name: o.companyName,
    contact_name: o.contactName || null,
    role: o.role || null,
    email: o.email || null,
    phone: o.phone || null,
    therapeutic_area: o.therapeuticArea || null,
    opportunity_type: mapOpportunityTypeToDb(o.opportunityType),
    source: mapSourceToLeadSource(o.source),
    last_contact_date: o.lastContactDate || null,
    next_followup_date: o.nextFollowupDate || null,
    status: viloStageAppToDb(o.status),
    notes: o.notes || null,
    potential_value: o.potentialValue ? Number.parseFloat(o.potentialValue) : null,
    priority: o.priority as ViloOpportunityRow["priority"],
    archived: false,
    decision_maker_role: o.decisionMakerRole ?? null,
    last_interaction_type: o.lastInteractionType ?? null,
    next_follow_up: o.nextFollowUp ?? null,
    relationship_strength: o.relationshipStrength ?? null,
    enrichment_status: (o.enrichmentStatus as ViloOpportunityRow["enrichment_status"]) ?? "pending",
  };
  return o.id ? { ...base, id: o.id } : base;
}

export function viloToDbUpdate(patch: Partial<ViloOpportunity>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.organizationId !== undefined) out.org_id = patch.organizationId ?? null;
  if (patch.primaryContactId !== undefined) out.contact_id = patch.primaryContactId ?? null;
  if (patch.companyName !== undefined) out.company_name = patch.companyName;
  if (patch.contactName !== undefined) out.contact_name = patch.contactName || null;
  if (patch.role !== undefined) out.role = patch.role || null;
  if (patch.email !== undefined) out.email = patch.email || null;
  if (patch.phone !== undefined) out.phone = patch.phone || null;
  if (patch.therapeuticArea !== undefined) out.therapeutic_area = patch.therapeuticArea || null;
  if (patch.opportunityType !== undefined) out.opportunity_type = mapOpportunityTypeToDb(patch.opportunityType);
  if (patch.source !== undefined) out.source = mapSourceToLeadSource(patch.source);
  if (patch.lastContactDate !== undefined) out.last_contact_date = patch.lastContactDate || null;
  if (patch.nextFollowupDate !== undefined) out.next_followup_date = patch.nextFollowupDate || null;
  if (patch.status !== undefined) out.status = viloStageAppToDb(patch.status);
  if (patch.notes !== undefined) out.notes = patch.notes || null;
  if (patch.potentialValue !== undefined)
    out.potential_value = patch.potentialValue ? Number.parseFloat(patch.potentialValue) : null;
  if (patch.priority !== undefined) out.priority = patch.priority;
  if (patch.decisionMakerRole !== undefined) out.decision_maker_role = patch.decisionMakerRole || null;
  if (patch.lastInteractionType !== undefined) out.last_interaction_type = patch.lastInteractionType || null;
  if (patch.nextFollowUp !== undefined) out.next_follow_up = patch.nextFollowUp || null;
  if (patch.relationshipStrength !== undefined) out.relationship_strength = patch.relationshipStrength ?? null;
  if (patch.enrichmentStatus !== undefined) out.enrichment_status = patch.enrichmentStatus || null;
  return out;
}

export function patientRowToApp(row: PatientLeadRow): PatientLead {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email ?? "",
    preferredLanguage: mapPreferredLanguageToApp(row.preferred_language),
    ageRange: mapAgeRangeToApp(row.age_range),
    gender: mapGenderToApp(row.gender),
    conditionOrStudyInterest: row.condition_or_study_interest ?? "",
    sourceCampaign: row.source_campaign ?? "",
    zipCode: row.zip_code ?? "",
    preferredContactChannel: mapContactChannelToApp(row.preferred_contact_channel),
    lastContactDate: row.last_contact_date ?? "",
    nextAction: row.next_action ?? "",
    currentStage: row.current_stage as VitalisStage,
    screenFailReason: row.screen_fail_reason ?? "",
    notes: row.notes ?? "",
    firstOutreachAt: undefined,
    respondedAt: undefined,
    prescreenStartedAt: undefined,
    appointmentAt: undefined,
    appointmentOutcomeRecordedAt: undefined,
    enrolledAt: undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function patientToDbInsert(l: Omit<PatientLead, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const base = {
    full_name: l.fullName,
    phone: l.phone,
    email: l.email || null,
    preferred_language: mapPreferredLanguageToDb(l.preferredLanguage),
    age_range: mapAgeRangeToDb(l.ageRange),
    gender: mapGenderToDb(l.gender),
    condition_or_study_interest: l.conditionOrStudyInterest || null,
    source_campaign: l.sourceCampaign || null,
    zip_code: l.zipCode || null,
    preferred_contact_channel: mapContactChannelToDb(l.preferredContactChannel),
    last_contact_date: l.lastContactDate || null,
    next_action: l.nextAction || null,
    current_stage: l.currentStage as PatientLeadRow["current_stage"],
    screen_fail_reason: l.screenFailReason || null,
    notes: l.notes || null,
    archived: false,
  };
  return l.id ? { ...base, id: l.id } : base;
}

export function patientToDbUpdate(patch: Partial<PatientLead>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.fullName !== undefined) out.full_name = patch.fullName;
  if (patch.phone !== undefined) out.phone = patch.phone;
  if (patch.email !== undefined) out.email = patch.email || null;
  if (patch.preferredLanguage !== undefined) out.preferred_language = mapPreferredLanguageToDb(patch.preferredLanguage);
  if (patch.ageRange !== undefined) out.age_range = mapAgeRangeToDb(patch.ageRange);
  if (patch.gender !== undefined) out.gender = mapGenderToDb(patch.gender);
  if (patch.conditionOrStudyInterest !== undefined)
    out.condition_or_study_interest = patch.conditionOrStudyInterest || null;
  if (patch.sourceCampaign !== undefined) out.source_campaign = patch.sourceCampaign || null;
  if (patch.zipCode !== undefined) out.zip_code = patch.zipCode || null;
  if (patch.preferredContactChannel !== undefined)
    out.preferred_contact_channel = mapContactChannelToDb(patch.preferredContactChannel);
  if (patch.lastContactDate !== undefined) out.last_contact_date = patch.lastContactDate || null;
  if (patch.nextAction !== undefined) out.next_action = patch.nextAction || null;
  if (patch.currentStage !== undefined) out.current_stage = patch.currentStage as PatientLeadRow["current_stage"];
  if (patch.screenFailReason !== undefined) out.screen_fail_reason = patch.screenFailReason || null;
  if (patch.notes !== undefined) out.notes = patch.notes || null;
  return out;
}

export function taskRowToApp(row: TaskRow): TaskItem {
  const hasVilo = row.linked_vilo_id != null;
  const hasVit = row.linked_vitalis_id != null;
  let channel: TaskChannel = mapTaskChannelToApp(row.channel);
  if (!hasVilo && !hasVit) channel = "other";
  return {
    id: row.id,
    title: row.title,
    dueAt: dateOnlyToDueAt(row.due_date),
    channel,
    priority: row.priority as Priority,
    completed: row.done,
    entityType: hasVilo ? "vilo_opportunity" : hasVit ? "patient_lead" : undefined,
    entityId: row.linked_vilo_id ?? row.linked_vitalis_id ?? undefined,
    createdAt: row.created_at,
  };
}

export function taskToDbInsert(t: Omit<TaskItem, "id" | "createdAt"> & { id?: string }) {
  const ch = mapTaskChannelToDb(t.channel);
  const viloId = t.entityType === "vilo_opportunity" ? t.entityId ?? null : null;
  const leadId = t.entityType === "patient_lead" ? t.entityId ?? null : null;
  const base = {
    title: t.title,
    channel: ch,
    priority: t.priority as TaskRow["priority"],
    due_date: dueAtToDateOnly(t.dueAt),
    done: t.completed,
    linked_vilo_id: viloId,
    linked_vitalis_id: leadId,
  };
  return t.id ? { ...base, id: t.id } : base;
}

export function taskToDbUpdate(patch: Partial<TaskItem>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.dueAt !== undefined) out.due_date = dueAtToDateOnly(patch.dueAt);
  if (patch.channel !== undefined) out.channel = mapTaskChannelToDb(patch.channel);
  if (patch.priority !== undefined) out.priority = patch.priority;
  if (patch.completed !== undefined) out.done = patch.completed;
  if (patch.entityType !== undefined || patch.entityId !== undefined) {
    const et = patch.entityType;
    const eid = patch.entityId;
    if (et === "vilo_opportunity") {
      out.linked_vilo_id = eid ?? null;
      out.linked_vitalis_id = null;
    } else if (et === "patient_lead") {
      out.linked_vitalis_id = eid ?? null;
      out.linked_vilo_id = null;
    }
  }
  return out;
}
