import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { OpsDataTable, OpsInput, OpsMetric, OpsSelect, OpsSubmit } from "@/components/ops/OpsPrimitives";
import { createServerSideClient } from "@/lib/supabase/server";
import type { PatientVisit, Shipment, ShipmentStatus, Specimen, SpecimenStatus, Study } from "@/lib/supabase/types";
import { format } from "date-fns";
import { createShipment, createSpecimen, updateShipmentStatus, updateSpecimenStatus } from "./actions";

export const dynamic = "force-dynamic";

const SPECIMEN_STATUSES: SpecimenStatus[] = ["planned", "collected", "processed", "stored", "shipped", "received", "lost", "destroyed"];
const SHIPMENT_STATUSES: ShipmentStatus[] = ["draft", "ready", "in_transit", "delivered", "exception", "canceled"];

function dateTime(v: string | null): string {
  return v ? format(new Date(v), "MMM dd HH:mm") : "-";
}

function tone(status: string): "success" | "alert" | "vilo" | "vitalis" | "neutral" {
  if (["received", "delivered", "stored", "processed"].includes(status)) return "success";
  if (["lost", "destroyed", "exception", "canceled"].includes(status)) return "alert";
  if (["collected", "in_transit", "ready"].includes(status)) return "vitalis";
  if (["shipped"].includes(status)) return "vilo";
  return "neutral";
}

export default async function BiospecimensPage() {
  const supabase = await createServerSideClient();

  const [studiesRes, visitsRes, specimensRes, shipmentsRes, patientsRes] = await Promise.all([
    supabase.from("studies").select("*").eq("archived", false).order("updated_at", { ascending: false }).limit(100),
    supabase.from("patient_visits").select("*").order("scheduled_at", { ascending: false, nullsFirst: false }).limit(100),
    supabase.from("specimens").select("*").order("created_at", { ascending: false }).limit(150),
    supabase.from("shipments").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("patient_leads").select("id, full_name").eq("archived", false).order("updated_at", { ascending: false }).limit(100),
  ]);

  const studies = (studiesRes.data ?? []) as Study[];
  const visits = (visitsRes.data ?? []) as PatientVisit[];
  const specimens = (specimensRes.data ?? []) as Specimen[];
  const shipments = (shipmentsRes.data ?? []) as Shipment[];
  const patients = (patientsRes.data ?? []) as { id: string; full_name: string }[];

  const studyName = new Map(studies.map((s) => [s.id, s.name]));
  const patientName = new Map(patients.map((p) => [p.id, p.full_name]));
  const visitName = new Map(visits.map((v) => [v.id, v.visit_name]));
  const exceptions = specimens.filter((s) => ["lost", "destroyed"].includes(s.status)).length + shipments.filter((s) => s.status === "exception").length;

  return (
    <div className="min-h-screen bg-clinical-paper/80">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-vitalis-700">Lab operations</div>
            <h1 className="text-2xl font-bold text-clinical-ink">Biospecimens</h1>
            <p className="mt-1 text-sm text-clinical-muted">
              Sample collection, chain of custody, shipment tracking, and exception visibility.
            </p>
          </div>
          <a href="/clinical-ops" className="text-sm font-medium text-vilo-700 underline-offset-4 hover:underline">
            Clinical Ops
          </a>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OpsMetric label="Specimens" value={String(specimens.length)} />
          <OpsMetric label="Collected" value={String(specimens.filter((s) => ["collected", "processed", "stored"].includes(s.status)).length)} />
          <OpsMetric label="Shipments active" value={String(shipments.filter((s) => ["ready", "in_transit"].includes(s.status)).length)} />
          <OpsMetric label="Exceptions" value={String(exceptions)} alert={exceptions > 0} />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-clinical-ink">New Specimen</h2>
            </CardHeader>
            <CardBody>
              <form action={createSpecimen} className="grid gap-3 sm:grid-cols-2">
                <StudySelect studies={studies} optional />
                <PatientSelect patients={patients} optional />
                <VisitSelect visits={visits} optional />
                <OpsInput name="accession_number" label="Accession #" />
                <OpsInput name="specimen_type" label="Specimen type" required />
                <OpsInput name="collected_at" label="Collected at" type="datetime-local" />
                <OpsSelect name="status" label="Status" options={SPECIMEN_STATUSES} />
                <OpsInput name="current_location" label="Location" />
                <div className="sm:col-span-2"><OpsInput name="notes" label="Notes" /></div>
                <div className="sm:col-span-2"><OpsSubmit label="Create specimen" /></div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-clinical-ink">New Shipment</h2>
            </CardHeader>
            <CardBody>
              <form action={createShipment} className="grid gap-3 sm:grid-cols-2">
                <StudySelect studies={studies} optional />
                <OpsInput name="courier" label="Courier" />
                <OpsInput name="tracking_number" label="Tracking #" />
                <OpsInput name="destination_name" label="Destination" required />
                <OpsInput name="destination_address" label="Address" />
                <OpsInput name="shipped_at" label="Shipped at" type="datetime-local" />
                <OpsSelect name="status" label="Status" options={SHIPMENT_STATUSES} />
                <OpsInput name="notes" label="Notes" />
                <div className="sm:col-span-2"><OpsSubmit label="Create shipment" /></div>
              </form>
            </CardBody>
          </Card>
        </section>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-clinical-ink">Specimen Inventory</h2>
            <span className="text-xs text-clinical-muted">{specimens.length} latest</span>
          </CardHeader>
          <CardBody className="p-0">
            <OpsDataTable
              headers={["Accession", "Type", "Study", "Patient", "Visit", "Collected", "Location", "Status", "Update"]}
              empty="No specimens yet."
              rows={specimens.map((s) => [
                <strong key="a" className="text-clinical-ink">{s.accession_number ?? s.id.slice(0, 8)}</strong>,
                s.specimen_type,
                studyName.get(s.study_id ?? "") ?? "-",
                patientName.get(s.patient_lead_id ?? "") ?? "-",
                visitName.get(s.patient_visit_id ?? "") ?? "-",
                dateTime(s.collected_at),
                s.current_location ?? "-",
                <Badge key="status" tone={tone(s.status)}>{s.status}</Badge>,
                <form key="form" action={updateSpecimenStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <select name="status" defaultValue={s.status} className="rounded border border-clinical-line bg-white px-2 py-1 text-xs">
                    {SPECIMEN_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                  <button className="rounded bg-clinical-ink px-2 py-1 text-xs text-white">Save</button>
                </form>,
              ])}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-clinical-ink">Shipments</h2>
            <span className="text-xs text-clinical-muted">{shipments.length} latest</span>
          </CardHeader>
          <CardBody className="p-0">
            <OpsDataTable
              headers={["Destination", "Study", "Courier", "Tracking", "Shipped", "Delivered", "Status", "Update"]}
              empty="No shipments yet."
              rows={shipments.map((s) => [
                <strong key="d" className="text-clinical-ink">{s.destination_name ?? "-"}</strong>,
                studyName.get(s.study_id ?? "") ?? "-",
                s.courier ?? "-",
                s.tracking_number ?? "-",
                dateTime(s.shipped_at),
                dateTime(s.delivered_at),
                <Badge key="status" tone={tone(s.status)}>{s.status}</Badge>,
                <form key="form" action={updateShipmentStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <select name="status" defaultValue={s.status} className="rounded border border-clinical-line bg-white px-2 py-1 text-xs">
                    {SHIPMENT_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                  <button className="rounded bg-clinical-ink px-2 py-1 text-xs text-white">Save</button>
                </form>,
              ])}
            />
          </CardBody>
        </Card>
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

function VisitSelect({ visits, optional }: { visits: PatientVisit[]; optional?: boolean }) {
  return (
    <label className="grid gap-1 text-xs text-clinical-muted">
      Visit
      <select name="patient_visit_id" required={!optional} className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink">
        {optional ? <option value="">Unassigned</option> : null}
        {visits.map((v) => <option key={v.id} value={v.id}>{v.visit_name}</option>)}
      </select>
    </label>
  );
}
