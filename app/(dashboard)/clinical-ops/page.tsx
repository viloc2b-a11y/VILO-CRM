import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { OpsDataTable, OpsInput, OpsMetric, OpsSelect, OpsSubmit } from "@/components/ops/OpsPrimitives";
import { createServerSideClient } from "@/lib/supabase/server";
import type { PatientVisit, PatientVisitStatus, Study, StudyPayment, StudySite } from "@/lib/supabase/types";
import { format } from "date-fns";
import { createPatientVisit, createStudy, createStudyPayment, createStudySite, updatePatientVisitStatus } from "./actions";

export const dynamic = "force-dynamic";

const VISIT_STATUSES: PatientVisitStatus[] = ["scheduled", "completed", "no_show", "canceled"];

function money(v: number | null | undefined): string {
  return v == null ? "$0" : `$${Number(v).toLocaleString("en-US")}`;
}

function dateTime(v: string | null): string {
  return v ? format(new Date(v), "MMM dd HH:mm") : "-";
}

function toneForStatus(status: string): "success" | "alert" | "vilo" | "vitalis" | "neutral" {
  if (["completed", "paid", "active"].includes(status)) return "success";
  if (["no_show", "canceled", "void", "closed"].includes(status)) return "alert";
  if (["scheduled", "invoiced"].includes(status)) return "vitalis";
  if (["initiating", "planning"].includes(status)) return "vilo";
  return "neutral";
}

export default async function ClinicalOpsPage() {
  const supabase = await createServerSideClient();

  const [studiesRes, sitesRes, visitsRes, paymentsRes, patientsRes] = await Promise.all([
    supabase.from("studies").select("*").eq("archived", false).order("updated_at", { ascending: false }).limit(100),
    supabase.from("study_sites").select("*").order("updated_at", { ascending: false }).limit(100),
    supabase.from("patient_visits").select("*").order("scheduled_at", { ascending: true, nullsFirst: false }).limit(100),
    supabase.from("study_payments").select("*").order("due_date", { ascending: true, nullsFirst: false }).limit(100),
    supabase.from("patient_leads").select("id, full_name, current_stage").eq("archived", false).order("updated_at", { ascending: false }).limit(100),
  ]);

  const studies = (studiesRes.data ?? []) as Study[];
  const sites = (sitesRes.data ?? []) as StudySite[];
  const visits = (visitsRes.data ?? []) as PatientVisit[];
  const payments = (paymentsRes.data ?? []) as StudyPayment[];
  const patients = (patientsRes.data ?? []) as { id: string; full_name: string; current_stage: string }[];

  const studyName = new Map(studies.map((s) => [s.id, s.name]));
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const patientName = new Map(patients.map((p) => [p.id, p.full_name]));

  const scheduledVisits = visits.filter((v) => v.status === "scheduled").length;
  const expectedRevenue = visits.reduce((sum, v) => sum + Number(v.expected_revenue_usd ?? 0), 0);
  const openPayments = payments.filter((p) => p.status !== "paid" && p.status !== "void");

  return (
    <div className="min-h-screen bg-clinical-paper/80">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">CTMS-lite</div>
            <h1 className="text-2xl font-bold text-clinical-ink">Clinical Ops</h1>
            <p className="mt-1 text-sm text-clinical-muted">
              Studies, sites, patient visits, and study payment milestones.
            </p>
          </div>
          <a href="/action-center" className="text-sm font-medium text-vilo-700 underline-offset-4 hover:underline">
            Open Action Center
          </a>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OpsMetric label="Active studies" value={String(studies.filter((s) => s.status !== "closed").length)} />
          <OpsMetric label="Active sites" value={String(sites.filter((s) => s.activation_status === "active").length)} />
          <OpsMetric label="Scheduled visits" value={String(scheduledVisits)} />
          <OpsMetric label="Visit revenue" value={money(expectedRevenue)} />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-clinical-ink">New Study</h2>
            </CardHeader>
            <CardBody>
              <form action={createStudy} className="grid gap-3">
                <OpsInput name="name" label="Study name" required />
                <OpsInput name="protocol_identifier" label="Protocol" />
                <OpsInput name="sponsor_display_name" label="Sponsor" />
                <OpsSelect name="status" label="Status" options={["planning", "active", "paused", "closed"]} />
                <OpsInput name="notes" label="Notes" />
                <OpsSubmit label="Create study" />
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-clinical-ink">New Site</h2>
            </CardHeader>
            <CardBody>
              <form action={createStudySite} className="grid gap-3">
                <StudySelect studies={studies} />
                <OpsInput name="name" label="Site name" required />
                <OpsInput name="site_number" label="Site number" />
                <OpsSelect name="activation_status" label="Activation" options={["not_started", "initiating", "active", "closed"]} />
                <OpsInput name="notes" label="Notes" />
                <OpsSubmit label="Create site" />
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-clinical-ink">New Patient Visit</h2>
            </CardHeader>
            <CardBody>
              <form action={createPatientVisit} className="grid gap-3">
                <StudySelect studies={studies} optional />
                <PatientSelect patients={patients} optional />
                <OpsInput name="visit_name" label="Visit name" required />
                <OpsInput name="scheduled_at" label="Scheduled at" type="datetime-local" />
                <OpsInput name="expected_revenue_usd" label="Expected revenue" type="number" step="0.01" />
                <OpsInput name="notes" label="Notes" />
                <OpsSubmit label="Create visit" />
              </form>
            </CardBody>
          </Card>
        </section>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-clinical-ink">Patient Visits</h2>
            <span className="text-xs text-clinical-muted">{visits.length} latest</span>
          </CardHeader>
          <CardBody className="p-0">
            <OpsDataTable
              headers={["Visit", "Study", "Patient", "Scheduled", "Revenue", "Status", "Update"]}
              empty="No visits yet."
              rows={visits.map((v) => [
                <strong key="visit" className="text-clinical-ink">{v.visit_name}</strong>,
                studyName.get(v.study_id ?? "") ?? "-",
                patientName.get(v.patient_lead_id ?? "") ?? "-",
                dateTime(v.scheduled_at),
                money(v.expected_revenue_usd),
                <Badge key="status" tone={toneForStatus(v.status)}>{v.status}</Badge>,
                <form key="form" action={updatePatientVisitStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={v.id} />
                  <select name="status" defaultValue={v.status} className="rounded border border-clinical-line bg-white px-2 py-1 text-xs">
                    {VISIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="rounded bg-clinical-ink px-2 py-1 text-xs text-white">Save</button>
                </form>,
              ])}
            />
          </CardBody>
        </Card>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-clinical-ink">Study Payments</h2>
            </CardHeader>
            <CardBody className="p-0">
              <OpsDataTable
                headers={["Description", "Study", "Site", "Due", "Amount", "Status"]}
                empty="No payment milestones."
                rows={payments.map((p) => [
                  <strong key="d" className="text-clinical-ink">{p.description}</strong>,
                  studyName.get(p.study_id) ?? "-",
                  siteName.get(p.study_site_id ?? "") ?? "-",
                  p.due_date ?? "-",
                  money(p.amount_usd),
                  <Badge key="s" tone={toneForStatus(p.status)}>{p.status}</Badge>,
                ])}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-clinical-ink">New Payment Milestone</h2>
            </CardHeader>
            <CardBody>
              <form action={createStudyPayment} className="grid gap-3 sm:grid-cols-2">
                <StudySelect studies={studies} />
                <SiteSelect sites={sites} optional />
                <OpsInput name="description" label="Description" required />
                <OpsInput name="milestone_label" label="Milestone" />
                <OpsInput name="amount_usd" label="Amount" type="number" step="0.01" required />
                <OpsInput name="due_date" label="Due date" type="date" />
                <OpsSelect name="status" label="Status" options={["planned", "invoiced", "paid", "void"]} />
                <div className="sm:col-span-2"><OpsSubmit label="Create milestone" /></div>
              </form>
              {openPayments.length > 0 ? (
                <p className="mt-3 text-xs text-clinical-muted">{openPayments.length} open payment milestones need follow-up.</p>
              ) : null}
            </CardBody>
          </Card>
        </section>
      </div>
    </div>
  );
}

function StudySelect({ studies, optional }: { studies: Study[]; optional?: boolean }) {
  return (
    <label className="grid gap-1 text-xs text-clinical-muted">
      Study
      <select name="study_id" required={!optional} className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink">
        {optional ? <option value="">Unassigned</option> : null}
        {studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
}

function SiteSelect({ sites, optional }: { sites: StudySite[]; optional?: boolean }) {
  return (
    <label className="grid gap-1 text-xs text-clinical-muted">
      Site
      <select name="study_site_id" required={!optional} className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink">
        {optional ? <option value="">Unassigned</option> : null}
        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
}

function PatientSelect({ patients, optional }: { patients: { id: string; full_name: string }[]; optional?: boolean }) {
  return (
    <label className="grid gap-1 text-xs text-clinical-muted">
      Patient
      <select name="patient_lead_id" required={!optional} className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink">
        {optional ? <option value="">Unassigned</option> : null}
        {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
    </label>
  );
}
