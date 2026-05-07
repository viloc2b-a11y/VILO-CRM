"use client";

import { createManualRecord, importCsvRows, updateStagingStatus, type IngestionResult } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { VILO_STAGES } from "@/lib/constants";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Inbox, Keyboard, Mail, SearchCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition, type InputHTMLAttributes, type ReactNode } from "react";

type Entity = "organization" | "contact" | "opportunity" | "study" | "communication" | "patient_lead" | "financial" | "task";
type CsvRow = Record<string, string>;

export type StagingRow = {
  id: string;
  source_type: string;
  entity_type: string;
  raw_payload: unknown;
  normalized_payload: unknown;
  validation_status: string;
  validation_errors: unknown;
  duplicate_match_id: string | null;
  imported_record_id: string | null;
  created_at: string;
};

type OrgOption = { id: string; name: string };
type ContactOption = { id: string; full_name: string; org_id: string | null };
type StudyOption = { id: string; name: string };

const ENTITY_LABEL: Record<Entity, string> = {
  organization: "Organizations",
  contact: "Contacts",
  opportunity: "Opportunities",
  study: "Studies",
  communication: "Communications",
  patient_lead: "Patient Leads",
  financial: "Financial Items",
  task: "Tasks / Follow-ups",
};

const REQUIRED: Record<Entity, string[]> = {
  organization: ["name", "type"],
  contact: ["name", "email_or_phone", "organization_name"],
  // NOTE: These are UI-level requirements; some values are persisted into existing table columns,
  // and the remainder is packed into existing `notes`/`metadata` columns when needed.
  opportunity: ["organization_id", "indication", "type", "stage", "expected_revenue", "next_step_date", "notes"],
  study: [
    "organization_id",
    "protocol_number",
    "indication",
    "status",
    "startup_date",
    "enrollment_target",
    "current_enrolled",
    "budget_status",
    "cta_status",
  ],
  communication: ["organization_id", "communication_type", "direction", "date", "topic", "follow_up_needed", "notes"],
  patient_lead: ["full_name", "phone", "indication", "source", "status", "contacted_at", "enrolled", "screen_failed"],
  financial: ["organization_id", "item_type", "amount", "status", "due_date", "notes"],
  task: ["title", "owner", "due_date", "priority", "status", "notes"],
};

const FIELD_OPTIONS: Record<Entity, string[]> = {
  organization: ["name", "type", "status", "notes"],
  contact: ["organization_id", "organization_name", "name", "role", "email", "phone", "status", "notes"],
  opportunity: [
    "organization_id",
    "organization_name",
    "contact_id",
    "contact_name",
    "name",
    "type",
    "indication",
    "expected_revenue",
    "probability",
    "stage",
    "owner",
    "next_step",
    "next_step_date",
    "last_contact_date",
    "notes",
  ],
  study: ["organization_id", "protocol_number", "indication", "status", "startup_date", "enrollment_target", "current_enrolled", "budget_status", "cta_status", "notes"],
  communication: ["organization_id", "contact_id", "communication_type", "direction", "date", "topic", "follow_up_needed", "notes"],
  patient_lead: ["study_id", "full_name", "phone", "email", "indication", "source", "status", "contacted_at", "enrolled", "screen_failed", "notes"],
  financial: ["organization_id", "study_id", "item_type", "amount", "status", "due_date", "notes"],
  task: ["organization_id", "title", "owner", "due_date", "priority", "status", "notes"],
};
const CSV_ENTITIES: Entity[] = ["organization", "contact", "opportunity", "task"];

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((h) => h.trim()) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])));
}

function errorsFor(entity: Entity, row: CsvRow): string[] {
  const e: string[] = [];
  if (entity === "organization") {
    if (!row.name) e.push("name required");
    if (!row.type) e.push("type required");
  }
  if (entity === "contact") {
    if (!row.name) e.push("name required");
    if (!row.email && !row.phone) e.push("email or phone required");
    if (!row.organization_id && !row.organization_name) e.push("organization required");
  }
  if (entity === "opportunity") {
    for (const f of REQUIRED.opportunity) if (!row[f]) e.push(`${f} required`);
  }
  if (entity === "study") {
    for (const f of REQUIRED.study) if (!row[f]) e.push(`${f} required`);
  }
  if (entity === "communication") {
    for (const f of REQUIRED.communication) if (!row[f]) e.push(`${f} required`);
  }
  if (entity === "patient_lead") {
    for (const f of REQUIRED.patient_lead) if (!row[f]) e.push(`${f} required`);
  }
  if (entity === "financial") {
    for (const f of REQUIRED.financial) if (!row[f]) e.push(`${f} required`);
  }
  if (entity === "task") {
    for (const f of REQUIRED.task) if (!row[f]) e.push(`${f} required`);
  }
  return e;
}

export function IngestionCenterClient({
  organizations,
  contacts,
  studies,
  stagingRows,
  stagingAvailable,
  availableEntities,
}: {
  organizations: OrgOption[];
  contacts: ContactOption[];
  studies: StudyOption[];
  stagingRows: StagingRow[];
  stagingAvailable: boolean;
  availableEntities: Record<Entity, boolean>;
}) {
  const [tab, setTab] = useState<"manual" | "csv" | "staging">("manual");
  const [manualEntity, setManualEntity] = useState<Entity>("organization");
  const [csvEntity, setCsvEntity] = useState<Entity>("organization");
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const headers = Object.keys(parsedRows[0] ?? {});
  const mappedRows = useMemo(
    () =>
      parsedRows.map((row) => {
        const out: CsvRow = {};
        for (const h of headers) {
          const target = mapping[h] || h;
          if (target) out[target] = row[h] ?? "";
        }
        return out;
      }),
    [headers, mapping, parsedRows]
  );
  const validCount = mappedRows.filter((r) => errorsFor(csvEntity, r).length === 0).length;

  async function onCsvFile(file: File | null) {
    setResult(null);
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text).slice(0, 250);
    setParsedRows(rows);
    const auto: Record<string, string> = {};
    for (const h of Object.keys(rows[0] ?? {})) {
      const normalized = h.toLowerCase().trim().replace(/\s+/g, "_");
      auto[h] = FIELD_OPTIONS[csvEntity].includes(normalized) ? normalized : "";
    }
    setMapping(auto);
  }

  function submitCsv() {
    setResult(null);
    startTransition(async () => setResult(await importCsvRows(csvEntity, mappedRows)));
  }

  return (
    <div className="min-h-screen bg-clinical-paper/80 p-4 md:p-6">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Vilo Research Group</div>
          <h1 className="text-2xl font-semibold text-clinical-ink">Ingestion Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-clinical-muted">
            Bring CRM data in, validate it, deduplicate it, and convert it into actionable records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "manual"} onClick={() => setTab("manual")} icon={<Keyboard />}>
            Manual Entry
          </TabButton>
          <TabButton active={tab === "csv"} onClick={() => setTab("csv")} icon={<FileSpreadsheet />}>
            CSV Import
          </TabButton>
          <TabButton active={tab === "staging"} onClick={() => setTab("staging")} icon={<Inbox />}>
            Staging Queue
          </TabButton>
        </div>
      </header>

      {result ? <ResultBanner result={result} /> : null}

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <IngestionOption title="Manual Entry" text="Fast-create organizations, contacts, opportunities, and follow-up tasks." icon={<Keyboard />} />
        <IngestionOption title="CSV Import" text="Upload, preview, map, validate, then import valid rows." icon={<Upload />} />
        <IngestionOption title="Staging Queue" text="Invalid, duplicate, or needs-review rows stay visible before import." icon={<SearchCheck />} />
      </div>

      {tab === "manual" ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-clinical-ink">Manual entry</h2>
              <p className="text-xs text-clinical-muted">Required fields are validated before create. Errors are shown here.</p>
            </div>
            <Select className="w-full sm:w-56" value={manualEntity} onChange={(e) => setManualEntity(e.target.value as Entity)}>
              {Object.entries(ENTITY_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </CardHeader>
          <CardBody>
            <ManualForm
              entity={manualEntity}
              organizations={organizations}
              contacts={contacts}
              studies={studies}
              available={availableEntities[manualEntity]}
              pending={isPending}
              onSubmit={(fd) => {
                setResult(null);
                startTransition(async () => setResult(await createManualRecord(manualEntity, fd)));
              }}
            />
          </CardBody>
        </Card>
      ) : null}

      {tab === "csv" ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-clinical-ink">CSV import</h2>
              <p className="text-xs text-clinical-muted">
                Required: {REQUIRED[csvEntity].join(", ")}. Invalid rows go to staging.
              </p>
            </div>
            <Select className="w-full sm:w-56" value={csvEntity} onChange={(e) => setCsvEntity(e.target.value as Entity)}>
              {CSV_ENTITIES.map((key) => (
                <option key={key} value={key}>
                  {ENTITY_LABEL[key]}
                </option>
              ))}
            </Select>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input type="file" accept=".csv,text/csv" onChange={(e) => void onCsvFile(e.target.files?.[0] ?? null)} />
            {headers.length > 0 ? (
              <>
                <div className="grid gap-2 md:grid-cols-3">
                  {headers.map((h) => (
                    <label key={h} className="space-y-1">
                      <span className="text-xs font-medium text-clinical-muted">{h}</span>
                      <Select value={mapping[h] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}>
                        <option value="">Ignore</option>
                        {FIELD_OPTIONS[csvEntity].map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-clinical-line bg-clinical-paper p-3 text-sm">
                  <span className="text-clinical-muted">
                    Preview: {mappedRows.length} rows · {validCount} valid · {mappedRows.length - validCount} staging
                  </span>
                  <Button disabled={isPending || mappedRows.length === 0} onClick={submitCsv}>
                    Import valid rows
                  </Button>
                </div>
                <PreviewTable rows={mappedRows.slice(0, 8)} entity={csvEntity} />
              </>
            ) : (
              <Empty title="No CSV uploaded yet." body="Upload a CSV, then map the columns before importing." cta="Choose CSV above" />
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "staging" ? (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-clinical-ink">Staging queue</h2>
            <p className="text-xs text-clinical-muted">Rows that are invalid, duplicated, or need review before import.</p>
          </CardHeader>
          <CardBody>
            {!stagingAvailable ? (
              <Empty
                title="Staging table is not installed yet."
                body="Apply the SQL migration to store invalid CSV rows and future email/PDF ingestion payloads."
                cta="Review migration"
              />
            ) : stagingRows.length === 0 ? (
              <Empty title="No staged rows." body="Invalid CSV rows and future email/PDF payloads will appear here." cta="Import CSV" />
            ) : (
              <StagingTable rows={stagingRows} pending={isPending} onResult={setResult} />
            )}
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <FutureCard title="Email-to-CRM" icon={<Mail />} />
        <FutureCard title="PDF/Excel extraction" icon={<FileSpreadsheet />} />
        <FutureCard title="Sponsor feasibility packet parsing" icon={<AlertTriangle />} />
      </div>
    </div>
  );
}

function ManualForm({
  entity,
  organizations,
  contacts,
  studies,
  available,
  pending,
  onSubmit,
}: {
  entity: Entity;
  organizations: OrgOption[];
  contacts: ContactOption[];
  studies: StudyOption[];
  available: boolean;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  if (!available) {
    return (
      <Empty
        title={`${ENTITY_LABEL[entity]} not connected yet.`}
        body="The backing Supabase table is not installed or is not available to this user. Apply the matching migration before creating records here."
        cta="TODO: connect table"
      />
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      {entity === "organization" ? <OrganizationFields /> : null}
      {entity === "contact" ? <ContactFields organizations={organizations} /> : null}
      {entity === "opportunity" ? <OpportunityFields organizations={organizations} contacts={contacts} /> : null}
      {entity === "study" ? <StudyFields organizations={organizations} /> : null}
      {entity === "communication" ? <CommunicationFields organizations={organizations} contacts={contacts} /> : null}
      {entity === "patient_lead" ? <PatientLeadFields studies={studies} /> : null}
      {entity === "financial" ? <FinancialFields organizations={organizations} studies={studies} /> : null}
      {entity === "task" ? <TaskFields organizations={organizations} /> : null}
      <div className="flex justify-end border-t border-clinical-line pt-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : `Create ${entity}`}
        </Button>
      </div>
    </form>
  );
}

function OrganizationFields() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field name="name" label="Name" required />
      <SelectField name="type" label="Type" options={["Sponsor", "CRO", "Lab", "Vendor", "Partner"]} />
      <Field name="status" label="Status" defaultValue="active" />
      <TextAreaField name="notes" label="Notes" />
    </div>
  );
}

function ContactFields({ organizations }: { organizations: OrgOption[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SelectField name="organization_id" label="Organization" options={organizations.map((o) => ({ value: o.id, label: o.name }))} />
      <Field name="organization_name" label="Organization name fallback" />
      <Field name="name" label="Name" required />
      <Field name="role" label="Role" />
      <Field name="email" label="Email" type="email" />
      <Field name="phone" label="Phone" />
      <Field name="status" label="Status" defaultValue="active" />
      <TextAreaField name="notes" label="Notes" />
    </div>
  );
}

function OpportunityFields({ organizations, contacts }: { organizations: OrgOption[]; contacts: ContactOption[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SelectField name="organization_id" label="Organization" options={organizations.map((o) => ({ value: o.id, label: o.name }))} />
      <Field name="organization_name" label="Organization name fallback" />
      <SelectField name="contact_id" label="Contact" options={contacts.map((c) => ({ value: c.id, label: c.full_name }))} />
      <Field name="contact_name" label="Contact name fallback" />
      <Field name="name" label="Opportunity name (optional)" />
      <SelectField name="type" label="Study type" options={["Study", "Biospecimen", "IVD", "Partnership", "Vendor"]} />
      <Field name="indication" label="Indication" required />
      <Field name="expected_revenue" label="Expected value" type="number" required />
      <Field name="probability" label="Probability" type="number" min={0} max={100} />
      <SelectField name="stage" label="Stage" options={[...VILO_STAGES]} />
      <Field name="owner" label="Owner" required />
      <Field name="next_step" label="Next step" />
      <Field name="next_step_date" label="Next follow-up date" type="date" required />
      <Field name="last_contact_date" label="Last contact date" type="date" />
      <TextAreaField name="notes" label="Notes" required />
    </div>
  );
}

function StudyFields({ organizations }: { organizations: OrgOption[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SelectField name="organization_id" label="Organization" options={organizations.map((o) => ({ value: o.id, label: o.name }))} />
      <Field name="protocol_number" label="Protocol number" required />
      <Field name="indication" label="Indication" required />
      <SelectField name="status" label="Status" options={["planning", "active", "paused", "closed"]} />
      <Field name="startup_date" label="Startup date" type="date" required />
      <Field name="enrollment_target" label="Enrollment target" type="number" required />
      <Field name="current_enrolled" label="Current enrolled" type="number" required />
      <Field name="budget_status" label="Budget status" required />
      <Field name="cta_status" label="CTA status" required />
      <TextAreaField name="notes" label="Notes" />
    </div>
  );
}

function CommunicationFields({ organizations, contacts }: { organizations: OrgOption[]; contacts: ContactOption[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SelectField name="organization_id" label="Organization" options={organizations.map((o) => ({ value: o.id, label: o.name }))} />
      <SelectField name="contact_id" label="Contact" options={contacts.map((c) => ({ value: c.id, label: c.full_name }))} />
      <SelectField name="communication_type" label="Communication type" options={["email", "linkedin", "call", "meeting", "whatsapp", "other"]} />
      <SelectField name="direction" label="Direction" options={["outbound", "inbound", "internal"]} />
      <Field name="date" label="Date" type="datetime-local" required />
      <Field name="topic" label="Topic" required />
      <SelectField name="follow_up_needed" label="Follow-up needed" options={["no", "yes"]} />
      <TextAreaField name="notes" label="Notes" required />
    </div>
  );
}

function PatientLeadFields({ studies }: { studies: StudyOption[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SelectField name="study_id" label="Study" options={studies.map((s) => ({ value: s.id, label: s.name }))} />
      <Field name="full_name" label="Full name" required />
      <Field name="phone" label="Phone" required />
      <Field name="email" label="Email" type="email" />
      <Field name="indication" label="Indication" required />
      <Field name="source" label="Source" required />
      <SelectField name="status" label="Status" options={["New Lead", "Responded", "Scheduled", "Enrolled", "Screen Fail"]} />
      <Field name="contacted_at" label="Contacted at" type="datetime-local" required />
      <SelectField name="enrolled" label="Enrolled" options={["no", "yes"]} />
      <SelectField name="screen_failed" label="Screen failed" options={["no", "yes"]} />
      <TextAreaField name="notes" label="Notes" />
    </div>
  );
}

function FinancialFields({ organizations, studies }: { organizations: OrgOption[]; studies: StudyOption[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SelectField name="organization_id" label="Organization" options={organizations.map((o) => ({ value: o.id, label: o.name }))} />
      <SelectField name="study_id" label="Study" options={studies.map((s) => ({ value: s.id, label: s.name }))} />
      <Field name="item_type" label="Item type" required />
      <Field name="amount" label="Amount" type="number" required />
      <SelectField name="status" label="Status" options={["draft", "sent", "partially_paid", "paid", "overdue", "void"]} />
      <Field name="due_date" label="Due date" type="date" required />
      <TextAreaField name="notes" label="Notes" required />
    </div>
  );
}

function TaskFields({ organizations }: { organizations: OrgOption[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SelectField name="organization_id" label="Organization" options={organizations.map((o) => ({ value: o.id, label: o.name }))} />
      <Field name="title" label="Title" required />
      <Field name="owner" label="Owner" required />
      <SelectField name="priority" label="Priority" options={["High", "Medium", "Low"]} />
      <Field name="due_date" label="Due date" type="date" required />
      <SelectField name="status" label="Status" options={["pending", "in_progress", "completed", "canceled"]} />
      <TextAreaField name="notes" label="Notes" required />
    </div>
  );
}

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-clinical-muted">{label}</span>
      <Input {...props} />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: (string | { value: string; label: string })[];
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-clinical-muted">{label}</span>
      <Select name={name}>
        <option value="">Select</option>
        {options.map((o) => {
          const value = typeof o === "string" ? o : o.value;
          const labelText = typeof o === "string" ? o : o.label;
          return (
            <option key={value} value={value}>
              {labelText}
            </option>
          );
        })}
      </Select>
    </label>
  );
}

function TextAreaField({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="space-y-1 md:col-span-2">
      <span className="text-xs font-medium text-clinical-muted">{label}</span>
      <Textarea name={name} required={required} />
    </label>
  );
}

function PreviewTable({ rows, entity }: { rows: CsvRow[]; entity: Entity }) {
  const headers = Object.keys(rows[0] ?? {});
  return (
    <div className="overflow-x-auto rounded-lg border border-clinical-line">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-clinical-paper text-clinical-muted">
          <tr>
            <th className="px-3 py-2">Status</th>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-clinical-line">
          {rows.map((r, i) => {
            const errors = errorsFor(entity, r);
            return (
              <tr key={i}>
                <td className="px-3 py-2">
                  <Badge tone={errors.length ? "alert" : "vilo"}>{errors.length ? errors.join(", ") : "valid"}</Badge>
                </td>
                {headers.map((h) => (
                  <td key={h} className="max-w-[220px] truncate px-3 py-2 text-clinical-muted">
                    {r[h] || "Empty"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StagingTable({
  rows,
  pending,
  onResult,
}: {
  rows: StagingRow[];
  pending: boolean;
  onResult: (r: IngestionResult) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-clinical-line">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-clinical-paper text-xs uppercase text-clinical-muted">
          <tr>
            {["Source", "Entity", "Status", "Errors", "Duplicate", "Created", "Actions"].map((h) => (
              <th key={h} className="px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-clinical-line">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-2">{row.source_type}</td>
              <td className="px-3 py-2">{row.entity_type}</td>
              <td className="px-3 py-2">
                <Badge tone={row.validation_status === "invalid" ? "alert" : "vilo"}>{row.validation_status}</Badge>
              </td>
              <td className="max-w-[260px] px-3 py-2 text-clinical-muted">{JSON.stringify(row.validation_errors ?? [])}</td>
              <td className="px-3 py-2 text-clinical-muted">{row.duplicate_match_id ? "Possible duplicate" : "No warning"}</td>
              <td className="px-3 py-2 text-clinical-muted">{new Date(row.created_at).toLocaleString()}</td>
              <td className="flex flex-wrap gap-2 px-3 py-2">
                <Button variant="secondary" className="px-2 py-1 text-xs" disabled>
                  Review
                </Button>
                <Button
                  className="px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={async () => onResult(await updateStagingStatus(row.id, "imported"))}
                >
                  Import
                </Button>
                <Button
                  variant="danger"
                  className="px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={async () => onResult(await updateStagingStatus(row.id, "invalid"))}
                >
                  Mark invalid
                </Button>
                <Button variant="secondary" className="px-2 py-1 text-xs" disabled>
                  Merge with existing
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultBanner({ result }: { result: IngestionResult }) {
  return (
    <div
      className={
        result.ok
          ? "mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200"
          : "mb-4 rounded-lg border border-clinical-alert/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        <span>{result.message}</span>
        {result.href ? (
          <Link className="font-semibold underline" href={result.href}>
            Open created record area
          </Link>
        ) : null}
      </div>
      {result.imported != null ? <div className="mt-1">Imported {result.imported}; staged {result.staged ?? 0}.</div> : null}
      {result.errors?.length ? <div className="mt-1 text-xs">{result.errors.join(" | ")}</div> : null}
    </div>
  );
}

function IngestionOption({ title, text, icon }: { title: string; text: string; icon: ReactNode }) {
  return (
    <Card>
      <CardBody className="p-4">
        <div className="text-vilo-600">{icon}</div>
        <h2 className="mt-3 text-sm font-semibold text-clinical-ink">{title}</h2>
        <p className="mt-1 text-xs text-clinical-muted">{text}</p>
      </CardBody>
    </Card>
  );
}

function FutureCard({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <Card className="opacity-75">
      <CardBody className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-vilo-600">{icon}</div>
          <Badge tone="neutral">Coming next</Badge>
        </div>
        <h3 className="mt-3 text-sm font-semibold text-clinical-ink">{title}</h3>
        <p className="mt-1 text-xs text-clinical-muted">Requires staging + validation before auto-import.</p>
      </CardBody>
    </Card>
  );
}

function Empty({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div className="rounded-lg border border-dashed border-clinical-line bg-clinical-paper p-6 text-center">
      <h3 className="text-sm font-semibold text-clinical-ink">{title}</h3>
      <p className="mt-1 text-sm text-clinical-muted">{body}</p>
      <div className="mt-3 text-xs font-semibold text-vilo-600">{cta}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-2 rounded-lg border border-vilo-200 bg-vilo-300 px-3 py-2 text-sm font-semibold text-clinical-ink"
          : "inline-flex items-center gap-2 rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm font-medium text-clinical-ink hover:bg-vilo-50"
      }
    >
      {icon}
      {children}
    </button>
  );
}
