"use server";

import { createServerSideClient } from "@/lib/supabase/server";
import { viloStageAppToDb } from "@/lib/supabase/mappers";
import type { ViloStage } from "@/lib/constants";
import { revalidatePath } from "next/cache";

export type IngestionResult = {
  ok: boolean;
  message: string;
  recordId?: string;
  href?: string;
  imported?: number;
  staged?: number;
  errors?: string[];
};

type EntityType =
  | "organization"
  | "contact"
  | "opportunity"
  | "study"
  | "communication"
  | "patient_lead"
  | "financial"
  | "task";
type CsvRow = Record<string, string>;
type LooseRow = Record<string, unknown>;
type LooseError = { message: string } | null;
type LooseResult<T = LooseRow> = { data: T[] | T | null; error: LooseError };
type LooseQuery<T = LooseRow> = PromiseLike<LooseResult<T>> & {
  select: (columns?: string) => LooseQuery<T>;
  insert: (payload: LooseRow | LooseRow[]) => LooseQuery<T>;
  update: (payload: LooseRow) => LooseQuery<T>;
  eq: (column: string, value: unknown) => LooseQuery<T>;
  ilike: (column: string, value: string) => LooseQuery<T>;
  maybeSingle: () => PromiseLike<LooseResult<T>>;
  single: () => PromiseLike<LooseResult<T>>;
  order: (column: string, options?: LooseRow) => LooseQuery<T>;
  limit: (count: number) => LooseQuery<T>;
};
type LooseClient = { from: (table: string) => LooseQuery };

function db(client: unknown): LooseClient {
  return client as LooseClient;
}

const ORG_TYPES = new Set(["Sponsor", "CRO", "Lab", "Vendor", "Partner"]);
const OPP_TYPES = new Set(["Study", "Biospecimen", "IVD", "Partnership", "Vendor"]);
const PRIORITIES = new Set(["High", "Medium", "Low"]);

function str(v: FormDataEntryValue | string | null | undefined): string {
  return String(v ?? "").trim();
}

function normalize(v: string): string {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

function dateOnly(v: string): string {
  return v ? v.slice(0, 10) : "";
}

function dbOrgType(type: string): string {
  return type === "Vendor" ? "Partner" : type;
}

function dbOpportunityType(type: string): string {
  if (type === "Biospecimen" || type === "IVD") return "Lab/Biobank";
  return "Observational";
}

async function logActivity(params: {
  related_type: string;
  related_id?: string;
  activity_type: "created" | "imported" | "updated" | "follow_up" | "note";
  title: string;
  description?: string;
}) {
  const sb = db(await createServerSideClient());
  await sb
    .from("activity_log")
    .insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      user_name: "CRM ingestion",
      action: params.activity_type,
      entity_type: params.related_type,
      entity_id: params.related_id ?? null,
      entity_label: params.title,
      metadata: { description: params.description ?? null, ingestion: true },
    })
    .then(() => undefined, () => undefined);
}

async function stageRow(params: {
  source_type: "manual" | "csv" | "email" | "pdf" | "api";
  entity_type: EntityType;
  raw_payload: unknown;
  normalized_payload: unknown;
  validation_status: "pending" | "valid" | "invalid" | "needs_review" | "imported";
  validation_errors: string[];
  duplicate_match_id?: string | null;
  imported_record_id?: string | null;
}) {
  const sb = db(await createServerSideClient());
  await sb
    .from("ingestion_staging")
    .insert({
      source_type: params.source_type,
      entity_type: params.entity_type,
      raw_payload: params.raw_payload,
      normalized_payload: params.normalized_payload,
      validation_status: params.validation_status,
      validation_errors: params.validation_errors,
      duplicate_match_id: params.duplicate_match_id ?? null,
      imported_record_id: params.imported_record_id ?? null,
    })
    .then(() => undefined, () => undefined);
}

function singleRow(data: LooseResult["data"]): LooseRow {
  if (Array.isArray(data)) return data[0] ?? {};
  return (data ?? {}) as LooseRow;
}

async function findOrganization(nameOrId: string): Promise<LooseRow | null> {
  const sb = db(await createServerSideClient());
  if (!nameOrId) return null;
  const byId = await sb.from("organizations").select("*").eq("id", nameOrId).maybeSingle();
  if (byId.data) return singleRow(byId.data);
  const { data } = await sb.from("organizations").select("*").eq("archived", false);
  const target = normalize(nameOrId);
  const rows = Array.isArray(data) ? data : [];
  return rows.find((o) => normalize(String(o.name ?? "")) === target) ?? null;
}

async function dedupeOrganization(name: string): Promise<LooseRow | null> {
  return findOrganization(name);
}

async function dedupeContact(input: { email?: string; phone?: string; name: string; orgId?: string | null }): Promise<LooseRow | null> {
  const sb = db(await createServerSideClient());
  if (input.email) {
    const { data } = await sb.from("contacts").select("*").eq("archived", false).ilike("email", input.email).maybeSingle();
    if (data) return singleRow(data);
  }
  if (input.phone) {
    const { data } = await sb.from("contacts").select("*").eq("archived", false).eq("phone", input.phone).maybeSingle();
    if (data) return singleRow(data);
  }
  const { data } = await sb.from("contacts").select("*").eq("archived", false);
  const target = normalize(input.name);
  return (
    (Array.isArray(data) ? data : []).find(
      (c) => normalize(String(c.full_name ?? "")) === target && (!input.orgId || c.org_id === input.orgId)
    ) ?? null
  );
}

async function dedupeOpportunity(input: { name: string; orgId?: string | null; organizationName: string }): Promise<LooseRow | null> {
  const sb = db(await createServerSideClient());
  const { data } = await sb.from("vilo_opportunities").select("*").eq("archived", false);
  const targetName = normalize(input.name);
  const targetOrg = normalize(input.organizationName);
  return (
    (Array.isArray(data) ? data : []).find((o) => {
      const companyName = String(o.company_name ?? "");
      const sameOrg = input.orgId ? o.org_id === input.orgId : normalize(companyName) === targetOrg;
      const sameName = normalize(String(o.notes ?? companyName)) === targetName || normalize(companyName) === targetName;
      return sameOrg && sameName;
    }) ?? null
  );
}

function validateOrganization(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!row.name) errors.push("name is required");
  if (!row.type) errors.push("type is required");
  if (row.type && !ORG_TYPES.has(row.type)) errors.push("type must be Sponsor, CRO, Lab, Vendor, or Partner");
  return errors;
}

function validateContact(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!row.name) errors.push("name is required");
  if (!row.email && !row.phone) errors.push("email or phone is required");
  if (!row.organization_id && !row.organization_name) errors.push("organization_name is required when organization_id is missing");
  return errors;
}

function validateOpportunity(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!row.name && !row.indication) errors.push("name or indication is required");
  if (!row.organization_id && !row.organization_name) errors.push("organization_id is required");
  if (!row.indication) errors.push("indication is required");
  if (!row.type && !row.study_type) errors.push("study_type is required");
  if (!row.stage) errors.push("stage is required");
  if (!row.expected_revenue && !row.expected_value) errors.push("expected_value is required");
  if (!row.next_step_date && !row.next_follow_up_date) errors.push("next_follow_up_date is required");
  if (!row.owner) errors.push("owner is required");
  if (!row.notes) errors.push("notes is required");
  if (!row.stage) errors.push("stage is required");
  if (row.type && !OPP_TYPES.has(row.type)) errors.push("type must be Study, Biospecimen, IVD, Partnership, or Vendor");
  if (row.study_type && !OPP_TYPES.has(row.study_type)) errors.push("study_type must be Study, Biospecimen, IVD, Partnership, or Vendor");
  return errors;
}

function validateStudy(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!row.organization_id) errors.push("organization_id is required");
  if (!row.protocol_number) errors.push("protocol_number is required");
  if (!row.indication) errors.push("indication is required");
  if (!row.status) errors.push("status is required");
  if (!row.startup_date) errors.push("startup_date is required");
  if (!row.enrollment_target) errors.push("enrollment_target is required");
  if (!row.current_enrolled) errors.push("current_enrolled is required");
  if (!row.budget_status) errors.push("budget_status is required");
  if (!row.cta_status) errors.push("cta_status is required");
  return errors;
}

function validateCommunication(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!row.organization_id) errors.push("organization_id is required");
  if (!row.communication_type) errors.push("communication_type is required");
  if (!row.direction) errors.push("direction is required");
  if (!row.date) errors.push("date is required");
  if (!row.topic) errors.push("topic is required");
  if (!row.follow_up_needed) errors.push("follow_up_needed is required");
  if (!row.notes) errors.push("notes is required");
  return errors;
}

function validatePatientLead(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!row.full_name) errors.push("full_name is required");
  if (!row.phone) errors.push("phone is required");
  if (!row.indication) errors.push("indication is required");
  if (!row.source) errors.push("source is required");
  if (!row.status) errors.push("status is required");
  if (!row.contacted_at) errors.push("contacted_at is required");
  if (!row.enrolled) errors.push("enrolled is required");
  if (!row.screen_failed) errors.push("screen_failed is required");
  return errors;
}

function validateFinancial(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!row.organization_id) errors.push("organization_id is required");
  if (!row.item_type) errors.push("item_type is required");
  if (!row.amount) errors.push("amount is required");
  if (!row.status) errors.push("status is required");
  if (!row.due_date) errors.push("due_date is required");
  if (!row.notes) errors.push("notes is required");
  return errors;
}

function validateTaskV2(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!row.title) errors.push("title is required");
  if (!row.owner) errors.push("owner is required");
  if (!row.due_date) errors.push("due_date is required");
  if (!row.priority) errors.push("priority is required");
  if (row.priority && !PRIORITIES.has(row.priority)) errors.push("priority must be High, Medium, or Low");
  if (!row.status) errors.push("status is required");
  if (!row.notes) errors.push("notes is required");
  return errors;
}

function validateEntity(entity: EntityType, row: CsvRow): string[] {
  if (entity === "organization") return validateOrganization(row);
  if (entity === "contact") return validateContact(row);
  if (entity === "opportunity") return validateOpportunity(row);
  if (entity === "study") return validateStudy(row);
  if (entity === "communication") return validateCommunication(row);
  if (entity === "patient_lead") return validatePatientLead(row);
  if (entity === "financial") return validateFinancial(row);
  return validateTaskV2(row);
}

function normalizeStudyStatus(status: string): string {
  const s = normalize(status);
  if (s.includes("active")) return "active";
  if (s.includes("pause")) return "paused";
  if (s.includes("close") || s.includes("won")) return "closed";
  return "planning";
}

function normalizePatientStage(row: CsvRow): string {
  if (row.enrolled === "true" || row.enrolled === "yes" || row.status.toLowerCase() === "enrolled") return "Enrolled";
  if (row.screen_failed === "true" || row.screen_failed === "yes" || row.status.toLowerCase().includes("screen")) return "Screen Fail";
  if (row.contacted_at) return "Responded";
  return "New Lead";
}

function normalizeInvoiceStatus(status: string): string {
  const s = normalize(status);
  if (s.includes("paid") && !s.includes("partial")) return "paid";
  if (s.includes("partial")) return "partially_paid";
  if (s.includes("overdue")) return "overdue";
  if (s.includes("sent") || s.includes("pending")) return "sent";
  if (s.includes("void") || s.includes("cancel")) return "void";
  return "draft";
}

async function createOrganizationRow(row: CsvRow, activity: "created" | "imported") {
  const sb = db(await createServerSideClient());
  const duplicate = await dedupeOrganization(row.name);
  if (duplicate) return { id: duplicate.id as string, duplicate: true };
  const { data, error } = await sb
    .from("organizations")
    .insert({
      name: row.name,
      type: dbOrgType(ORG_TYPES.has(row.type) ? row.type : "Partner"),
      website: null,
      notes: row.notes || null,
      archived: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const rowOut = singleRow(data);
  await logActivity({
    related_type: "organization",
    related_id: rowOut.id as string,
    activity_type: activity,
    title: activity === "imported" ? "Organization imported from CSV" : "Organization created manually",
    description: row.name,
  });
  return { id: rowOut.id as string, duplicate: false };
}

async function createContactRow(row: CsvRow, activity: "created" | "imported") {
  const sb = db(await createServerSideClient());
  const org = row.organization_id ? await findOrganization(row.organization_id) : await findOrganization(row.organization_name);
  if (!org) throw new Error(`Organization not found: ${row.organization_name || row.organization_id}`);
  const orgRow = org as LooseRow;
  const duplicate = await dedupeContact({ name: row.name, email: row.email, phone: row.phone, orgId: orgRow.id as string });
  if (duplicate) return { id: duplicate.id as string, duplicate: true };
  const { data, error } = await sb
    .from("contacts")
    .insert({
      org_id: orgRow.id,
      full_name: row.name,
      role: row.role || null,
      email: row.email || null,
      phone: row.phone || null,
      preferred_contact: row.email ? "Email" : "Phone",
      notes: row.notes || null,
      archived: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const contactRow = singleRow(data);
  await logActivity({
    related_type: "contact",
    related_id: contactRow.id as string,
    activity_type: activity,
    title: activity === "imported" ? "Contact imported from CSV" : "Contact created manually",
    description: row.name,
  });
  return { id: contactRow.id as string, duplicate: false };
}

async function createOpportunityRow(row: CsvRow, activity: "created" | "imported") {
  const sb = db(await createServerSideClient());
  const org = row.organization_id ? await findOrganization(row.organization_id) : await findOrganization(row.organization_name);
  if (!org) throw new Error(`Organization not found: ${row.organization_name || row.organization_id}`);
  const orgRow = org as LooseRow;
  const duplicate = await dedupeOpportunity({
    name: row.name || row.indication,
    orgId: orgRow.id as string,
    organizationName: String(orgRow.name ?? ""),
  });
  if (duplicate) return { id: duplicate.id as string, duplicate: true };
  const contact = row.contact_id
      ? { id: row.contact_id, full_name: row.contact_name || null }
    : row.contact_name
      ? await dedupeContact({ name: row.contact_name, orgId: orgRow.id as string })
      : null;
  const stage = (row.stage || "Lead Identified") as ViloStage;
  const { data, error } = await sb
    .from("vilo_opportunities")
    .insert({
      org_id: orgRow.id,
      organization_id: orgRow.id,
      contact_id: (contact as LooseRow | null)?.id ?? null,
      company_name: orgRow.name,
      contact_name: row.contact_name || String((contact as LooseRow | null)?.full_name ?? "") || null,
      role: null,
      email: null,
      phone: null,
      therapeutic_area: row.indication || null,
      opportunity_type: dbOpportunityType(row.type || row.study_type || "Study"),
      source: "Other",
      status: viloStageAppToDb(stage),
      priority: "High",
      potential_value: row.expected_revenue || row.expected_value ? Number(row.expected_revenue || row.expected_value) : null,
      notes: [
        row.name ? `Opportunity: ${row.name}` : "",
        `Indication: ${row.indication}`,
        `Study type: ${row.type || row.study_type}`,
        `Stage: ${row.stage}`,
        `Owner: ${row.owner}`,
        row.next_step ? `Next step: ${row.next_step}` : "",
        `Expected value: ${row.expected_revenue || row.expected_value}`,
        row.notes,
      ]
        .filter(Boolean)
        .join(" | "),
      last_contact_date: row.last_contact_date || null,
      next_followup_date: row.next_step_date || row.next_follow_up_date || null,
      archived: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const oppRow = singleRow(data);
  await logActivity({
    related_type: "opportunity",
    related_id: oppRow.id as string,
    activity_type: activity,
    title: activity === "imported" ? "Opportunity imported from CSV" : "Opportunity created manually",
    description: row.name,
  });
  return { id: oppRow.id as string, duplicate: false };
}

async function createStudyRow(row: CsvRow, activity: "created" | "imported") {
  const sb = db(await createServerSideClient());
  const org = await findOrganization(row.organization_id);
  if (!org) throw new Error(`Organization not found: ${row.organization_id}`);
  const orgRow = org as LooseRow;
  const { data, error } = await sb
    .from("studies")
    .insert({
      name: row.protocol_number ? `${row.protocol_number} - ${row.indication}` : row.indication,
      protocol_identifier: row.protocol_number,
      sponsor_display_name: orgRow.name,
      status: normalizeStudyStatus(row.status),
      notes: [
        `Sponsor org_id: ${String(orgRow.id ?? "")}`,
        `Indication: ${row.indication}`,
        `Startup date: ${row.startup_date}`,
        `Enrollment target: ${row.enrollment_target}`,
        `Current enrolled: ${row.current_enrolled}`,
        `Budget status: ${row.budget_status}`,
        `CTA status: ${row.cta_status}`,
        row.notes,
      ]
        .filter(Boolean)
        .join(" | "),
      archived: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const studyRow = singleRow(data);
  await logActivity({
    related_type: "study",
    related_id: studyRow.id as string,
    activity_type: activity,
    title: activity === "imported" ? "Study imported from CSV" : "Study created manually",
    description: row.protocol_number,
  });
  return { id: studyRow.id as string, duplicate: false };
}

async function createCommunicationRow(row: CsvRow, activity: "created" | "imported") {
  const sb = db(await createServerSideClient());
  const org = await findOrganization(row.organization_id);
  if (!org) throw new Error(`Organization not found: ${row.organization_id}`);
  const { data, error } = await sb
    .from("communications_log")
    .insert({
      org_id: row.organization_id,
      contact_id: row.contact_id || null,
      channel: row.communication_type || "other",
      direction: row.direction || "internal",
      type: row.topic || "note",
      subject: row.topic,
      body: row.notes || null,
      metadata: { follow_up_needed: row.follow_up_needed || null, ingestion_date: row.date || null },
      created_at: row.date ? new Date(row.date).toISOString() : new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const commRow = singleRow(data);
  await logActivity({
    related_type: "organization",
    related_id: row.organization_id,
    activity_type: activity,
    title: activity === "imported" ? "Communication imported" : "Communication logged manually",
    description: row.topic,
  });
  return { id: commRow.id as string, duplicate: false };
}

async function createPatientLeadRow(row: CsvRow, activity: "created" | "imported") {
  const sb = db(await createServerSideClient());
  const stage = normalizePatientStage(row);
  const { data, error } = await sb
    .from("patient_leads")
    .insert({
      full_name: row.full_name,
      phone: row.phone,
      email: row.email || null,
      condition_or_study_interest: row.indication,
      source_campaign: row.source,
      current_stage: stage,
      last_contact_date: row.contacted_at ? dateOnly(row.contacted_at) : null,
      screen_fail_reason: stage === "Screen Fail" ? row.notes || "Screen failed" : null,
      notes: [`Study ID: ${row.study_id || "none"}`, `Status: ${row.status}`, `Enrolled: ${row.enrolled}`, `Screen failed: ${row.screen_failed}`, row.notes]
        .filter(Boolean)
        .join(" | "),
      archived: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const leadRow = singleRow(data);
  await logActivity({
    related_type: "patient_lead",
    related_id: leadRow.id as string,
    activity_type: activity,
    title: activity === "imported" ? "Patient lead imported" : "Patient lead created manually",
    description: row.indication,
  });
  return { id: leadRow.id as string, duplicate: false };
}

async function createFinancialRow(row: CsvRow, activity: "created" | "imported") {
  const sb = db(await createServerSideClient());
  const org = await findOrganization(row.organization_id);
  if (!org) throw new Error(`Organization not found: ${row.organization_id}`);
  const { data, error } = await sb
    .from("invoices")
    .insert({
      organization_id: row.organization_id,
      study_id: row.study_id || null,
      invoice_number: row.invoice_number || null,
      status: normalizeInvoiceStatus(row.status),
      amount_usd: Number(row.amount),
      due_date: row.due_date || null,
      notes: [`Item type: ${row.item_type}`, row.notes].filter(Boolean).join(" | "),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const financialRow = singleRow(data);
  await logActivity({
    related_type: "financial",
    related_id: financialRow.id as string,
    activity_type: activity,
    title: activity === "imported" ? "Financial item imported" : "Financial item created manually",
    description: `${row.item_type}: ${row.amount}`,
  });
  return { id: financialRow.id as string, duplicate: false };
}

async function createTaskRow(row: CsvRow, activity: "created" | "imported") {
  const sb = db(await createServerSideClient());
  const { data: existing } = await sb
    .from("tasks")
    .select("*")
    .eq("title", row.title)
    .eq("due_date", dateOnly(row.due_date))
    .eq("done", false)
    .limit(1);
  const duplicate = Boolean(existing?.length);
  const { data, error } = await sb
    .from("tasks")
    .insert({
      title: row.title,
      channel: "vilo",
      priority: row.priority || "Medium",
      due_date: dateOnly(row.due_date),
      done: row.status === "completed",
      related_type: row.organization_id ? "organization" : null,
      related_id: row.organization_id || null,
      owner: row.owner || null,
      status: (row.status as unknown as string) || "pending",
      next_action: row.notes || null,
      completed_at: row.status === "completed" ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const taskRow = singleRow(data);
  await logActivity({
    related_type: "task",
    related_id: taskRow.id as string,
    activity_type: "follow_up",
    title: activity === "imported" ? "Follow-up task imported" : "Follow-up task created",
    description: duplicate ? `${row.notes} (possible duplicate)` : row.notes,
  });
  return { id: taskRow.id as string, duplicate };
}

export async function createManualRecord(entity: EntityType, formData: FormData): Promise<IngestionResult> {
  try {
    const row = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, str(v)])) as CsvRow;
    const errors = validateEntity(entity, row);
    if (errors.length) {
      await stageRow({
        source_type: "manual",
        entity_type: entity,
        raw_payload: row,
        normalized_payload: row,
        validation_status: "invalid",
        validation_errors: errors,
      });
      return { ok: false, message: "Validation failed. Row sent to staging queue.", errors };
    }
    const result =
      entity === "organization"
        ? await createOrganizationRow(row, "created")
        : entity === "contact"
          ? await createContactRow(row, "created")
          : entity === "opportunity"
            ? await createOpportunityRow(row, "created")
            : entity === "study"
              ? await createStudyRow(row, "created")
              : entity === "communication"
                ? await createCommunicationRow(row, "created")
                : entity === "patient_lead"
                  ? await createPatientLeadRow(row, "created")
                  : entity === "financial"
                    ? await createFinancialRow(row, "created")
                    : await createTaskRow(row, "created");
    await stageRow({
      source_type: "manual",
      entity_type: entity,
      raw_payload: row,
      normalized_payload: row,
      validation_status: result.duplicate ? "needs_review" : "imported",
      validation_errors: result.duplicate ? ["Possible duplicate matched; existing or new record linked."] : [],
      duplicate_match_id: result.duplicate ? result.id : null,
      imported_record_id: result.id,
    });
    revalidatePath("/");
    revalidatePath("/action-center");
    revalidatePath("/dashboard/ingestion");
    return {
      ok: true,
      message: result.duplicate ? "Record matched an existing duplicate." : "Record created.",
      recordId: result.id,
      href:
        entity === "organization" || entity === "contact"
          ? "/contacts"
          : entity === "task"
            ? "/tasks"
            : entity === "patient_lead"
              ? "/vitalis"
              : entity === "study"
                ? "/clinical-ops"
                : entity === "financial"
                  ? "/financials"
                  : "/vilo",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create record";
    const row = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, str(v)])) as CsvRow;
    await stageRow({
      source_type: "manual",
      entity_type: entity,
      raw_payload: row,
      normalized_payload: row,
      validation_status: "needs_review",
      validation_errors: [message],
    });
    return { ok: false, message };
  }
}

export async function importCsvRows(entity: EntityType, rows: CsvRow[]): Promise<IngestionResult> {
  let imported = 0;
  let staged = 0;
  const errorsOut: string[] = [];
  for (const row of rows) {
    const errors = validateEntity(entity, row);
    if (errors.length) {
      staged++;
      errorsOut.push(`${row.name || row.title || "Row"}: ${errors.join(", ")}`);
      await stageRow({
        source_type: "csv",
        entity_type: entity,
        raw_payload: row,
        normalized_payload: row,
        validation_status: "invalid",
        validation_errors: errors,
      });
      continue;
    }
    try {
      const result =
        entity === "organization"
          ? await createOrganizationRow(row, "imported")
          : entity === "contact"
            ? await createContactRow(row, "imported")
            : entity === "opportunity"
              ? await createOpportunityRow(row, "imported")
              : await createTaskRow(row, "imported");
      imported++;
      await stageRow({
        source_type: "csv",
        entity_type: entity,
        raw_payload: row,
        normalized_payload: row,
        validation_status: result.duplicate ? "needs_review" : "imported",
        validation_errors: result.duplicate ? ["Possible duplicate matched."] : [],
        duplicate_match_id: result.duplicate ? result.id : null,
        imported_record_id: result.id,
      });
    } catch (e) {
      staged++;
      const msg = e instanceof Error ? e.message : "Import failed";
      errorsOut.push(`${row.name || row.title || "Row"}: ${msg}`);
      await stageRow({
        source_type: "csv",
        entity_type: entity,
        raw_payload: row,
        normalized_payload: row,
        validation_status: "needs_review",
        validation_errors: [msg],
      });
    }
  }
  revalidatePath("/");
  revalidatePath("/action-center");
  revalidatePath("/dashboard/ingestion");
  return { ok: true, message: "CSV processed.", imported, staged, errors: errorsOut.slice(0, 10) };
}

export async function updateStagingStatus(id: string, status: "invalid" | "needs_review" | "imported"): Promise<IngestionResult> {
  const sb = db(await createServerSideClient());
  const { error } = await sb.from("ingestion_staging").update({ validation_status: status }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/ingestion");
  return { ok: true, message: "Staging row updated." };
}
