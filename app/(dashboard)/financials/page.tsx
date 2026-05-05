import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { OpsDataTable, OpsInput, OpsMetric, OpsSelect, OpsSubmit } from "@/components/ops/OpsPrimitives";
import { createServerSideClient } from "@/lib/supabase/server";
import type { Invoice, InvoiceStatus, Organization, Study, VRevenueLeakageRow } from "@/lib/supabase/types";
import { createInvoice, updateInvoiceStatus } from "./actions";

export const dynamic = "force-dynamic";

const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent", "partially_paid", "paid", "overdue", "void"];

function money(v: number | null | undefined): string {
  return `$${Number(v ?? 0).toLocaleString("en-US")}`;
}

function tone(status: string, overdue?: boolean): "success" | "alert" | "vilo" | "vitalis" | "neutral" {
  if (overdue || status === "overdue") return "alert";
  if (status === "paid") return "success";
  if (status === "sent" || status === "partially_paid") return "vitalis";
  if (status === "draft") return "vilo";
  return "neutral";
}

export default async function FinancialsPage() {
  const supabase = await createServerSideClient();

  const [invoicesRes, leakageRes, studiesRes, orgsRes, studyPaymentsRes] = await Promise.all([
    supabase.from("invoices").select("*").order("due_date", { ascending: true, nullsFirst: false }).limit(150),
    supabase.from("v_revenue_leakage").select("*").order("due_date", { ascending: true, nullsFirst: false }).limit(150),
    supabase.from("studies").select("*").eq("archived", false).order("updated_at", { ascending: false }).limit(100),
    supabase.from("organizations").select("*").eq("archived", false).in("type", ["Sponsor", "CRO"]).order("name").limit(100),
    supabase.from("study_payments").select("amount_usd, status").limit(500),
  ]);

  const invoices = (invoicesRes.data ?? []) as Invoice[];
  const leakageRows = (leakageRes.data ?? []) as VRevenueLeakageRow[];
  const studies = (studiesRes.data ?? []) as Study[];
  const orgs = (orgsRes.data ?? []) as Organization[];
  const studyPayments = (studyPaymentsRes.data ?? []) as { amount_usd: number; status: string }[];

  const studyName = new Map(studies.map((s) => [s.id, s.name]));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  const billed = invoices.reduce((sum, i) => sum + Number(i.amount_usd ?? 0), 0);
  const collected = invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.amount_usd ?? 0), 0);
  const overdue = leakageRows.filter((r) => r.is_overdue);
  const grossMargin = leakageRows.reduce((sum, r) => sum + Number(r.gross_margin_usd ?? 0), 0);
  const uninvoicedMilestones = studyPayments
    .filter((p) => p.status === "planned")
    .reduce((sum, p) => sum + Number(p.amount_usd ?? 0), 0);

  return (
    <div className="min-h-screen bg-clinical-paper/80">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Revenue operations</div>
            <h1 className="text-2xl font-bold text-clinical-ink">Financials</h1>
            <p className="mt-1 text-sm text-clinical-muted">
              Invoices, pass-through costs, gross margin, and revenue leakage.
            </p>
          </div>
          <a href="/clinical-ops" className="text-sm font-medium text-vilo-700 underline-offset-4 hover:underline">
            Clinical Ops
          </a>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <OpsMetric label="Billed" value={money(billed)} />
          <OpsMetric label="Collected" value={money(collected)} />
          <OpsMetric label="Gross margin" value={money(grossMargin)} />
          <OpsMetric label="Overdue invoices" value={String(overdue.length)} alert={overdue.length > 0} />
          <OpsMetric label="Uninvoiced milestones" value={money(uninvoicedMilestones)} />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-1">
            <CardHeader>
              <h2 className="text-sm font-semibold text-clinical-ink">New Invoice</h2>
            </CardHeader>
            <CardBody>
              <form action={createInvoice} className="grid gap-3">
                <StudySelect studies={studies} optional />
                <OrganizationSelect orgs={orgs} optional />
                <OpsInput name="invoice_number" label="Invoice #" />
                <OpsInput name="amount_usd" label="Amount" type="number" step="0.01" required />
                <OpsInput name="pass_through_costs_usd" label="Pass-through costs" type="number" step="0.01" />
                <OpsInput name="due_date" label="Due date" type="date" />
                <OpsSelect name="status" label="Status" options={INVOICE_STATUSES} />
                <OpsInput name="notes" label="Notes" />
                <OpsSubmit label="Create invoice" />
              </form>
            </CardBody>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <h2 className="text-sm font-semibold text-clinical-ink">Revenue Leakage</h2>
            </CardHeader>
            <CardBody className="p-0">
              <OpsDataTable
                headers={["Invoice", "Sponsor/CRO", "Study", "Due", "Amount", "Costs", "Margin", "Status"]}
                empty="No invoice leakage rows."
                rows={leakageRows.map((r) => [
                  <strong key="n" className="text-clinical-ink">{r.invoice_number ?? r.id.slice(0, 8)}</strong>,
                  orgName.get(r.organization_id ?? "") ?? "-",
                  studyName.get(r.study_id ?? "") ?? "-",
                  r.due_date ?? "-",
                  money(r.amount_usd),
                  money(r.pass_through_costs_usd),
                  money(r.gross_margin_usd),
                  <Badge key="s" tone={tone(r.status, r.is_overdue)}>{r.is_overdue ? "overdue" : r.status}</Badge>,
                ])}
              />
            </CardBody>
          </Card>
        </section>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-clinical-ink">Invoices</h2>
            <span className="text-xs text-clinical-muted">{invoices.length} latest</span>
          </CardHeader>
          <CardBody className="p-0">
            <OpsDataTable
              headers={["Invoice", "Sponsor/CRO", "Study", "Due", "Amount", "Costs", "Status", "Update"]}
              empty="No invoices yet."
              rows={invoices.map((i) => [
                <strong key="n" className="text-clinical-ink">{i.invoice_number ?? i.id.slice(0, 8)}</strong>,
                orgName.get(i.organization_id ?? "") ?? "-",
                studyName.get(i.study_id ?? "") ?? "-",
                i.due_date ?? "-",
                money(i.amount_usd),
                money(i.pass_through_costs_usd),
                <Badge key="s" tone={tone(i.status)}>{i.status}</Badge>,
                <form key="form" action={updateInvoiceStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={i.id} />
                  <select name="status" defaultValue={i.status} className="rounded border border-clinical-line bg-white px-2 py-1 text-xs">
                    {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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

function OrganizationSelect({ orgs, optional }: { orgs: Organization[]; optional?: boolean }) {
  return (
    <label className="grid gap-1 text-xs text-clinical-muted">
      Sponsor/CRO
      <select name="organization_id" required={!optional} className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink">
        {optional ? <option value="">Unassigned</option> : null}
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
