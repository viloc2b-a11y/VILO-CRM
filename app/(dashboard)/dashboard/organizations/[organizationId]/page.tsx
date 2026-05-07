import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { createServerSideClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Result<T = Row> = { data: T[] | T | null; error: { message: string } | null };
type Query<T = Row> = PromiseLike<Result<T>> & {
  select: (columns?: string) => Query<T>;
  insert: (payload: Row | Row[]) => Query<T>;
  eq: (column: string, value: unknown) => Query<T>;
  or: (filters: string) => Query<T>;
  order: (column: string, options?: Row) => Query<T>;
  limit: (count: number) => Query<T>;
  single: () => PromiseLike<Result<T>>;
};
type Db = { from: (table: string) => Query };

function db(client: unknown): Db {
  return client as Db;
}

function rows(data: Result["data"]): Row[] {
  return Array.isArray(data) ? data : data ? [data] : [];
}

function text(v: unknown, fallback = "Not set"): string {
  const s = String(v ?? "").trim();
  return s || fallback;
}

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function date(v: unknown): string {
  return v ? new Date(String(v)).toLocaleString() : "No activity yet";
}

function probabilityForStage(stage: string): number {
  const map: Record<string, number> = {
    "Lead Identified": 10,
    "Outreach Sent": 15,
    "Response Received": 25,
    "Intro Call Pending": 35,
    "Feasibility Sent": 45,
    Negotiation: 65,
    "Budget / CTA": 65,
    Startup: 80,
    "Active Study": 90,
    Activated: 100,
    "Closed Won": 100,
  };
  return map[stage] ?? 0;
}

function isActiveOpportunity(o: Row): boolean {
  return !["Closed Lost", "Activated", "Closed Won"].includes(String(o.status ?? ""));
}

async function addOrganizationNote(formData: FormData) {
  "use server";
  const organizationId = String(formData.get("organization_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!organizationId || !title) return;
  const sb = db(await createServerSideClient());
  await sb.from("activity_log").insert({
    user_id: "00000000-0000-0000-0000-000000000000",
    user_name: "CRM",
    action: "note",
    entity_type: "organization",
    entity_id: organizationId,
    entity_label: title,
    metadata: { description: body, related_type: "organization", note: true },
  });
  revalidatePath(`/dashboard/organizations/${organizationId}`);
}

export default async function OrganizationWorkspacePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const supabase = db(await createServerSideClient());

  const [orgRes, contactsRes, oppsRes, studiesRes, allTasksRes, activitiesRes, invoicesRes] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", organizationId).single(),
    supabase.from("contacts").select("*").eq("org_id", organizationId).order("updated_at", { ascending: false }),
    supabase.from("vilo_opportunities").select("*").eq("org_id", organizationId).eq("archived", false).order("updated_at", { ascending: false }),
    supabase
      .from("studies")
      .select("*")
      .or(`sponsor_id.eq.${organizationId},cro_id.eq.${organizationId}`)
      .order("updated_at", { ascending: false }),
    supabase.from("tasks").select("*").order("due_date", { ascending: true }).limit(300),
    supabase.from("activity_log").select("*").eq("entity_id", organizationId).order("created_at", { ascending: false }).limit(100),
    supabase.from("invoices").select("*").eq("organization_id", organizationId).order("due_date", { ascending: true }),
  ]);

  if (orgRes.error || !orgRes.data) notFound();

  const org = rows(orgRes.data)[0];
  const contacts = rows(contactsRes.data);
  const opportunities = rows(oppsRes.data);
  const studies = rows(studiesRes.data);
  const opportunityIds = new Set(opportunities.map((o) => String(o.id)));
  const tasks = rows(allTasksRes.data).filter((t) => {
    const relatedType = String(t.related_type ?? "");
    const relatedId = String(t.related_id ?? "");
    const linkedViloId = String(t.linked_vilo_id ?? "");
    return (
      (relatedType === "organization" && relatedId === organizationId) ||
      (relatedType === "opportunity" && opportunityIds.has(relatedId)) ||
      opportunityIds.has(linkedViloId)
    );
  });
  const activities = rows(activitiesRes.data);
  const invoices = rows(invoicesRes.data);

  const primaryContact = contacts[0] ?? null;
  const activeOpps = opportunities.filter(isActiveOpportunity);
  const activeStudies = studies.filter((s) => String(s.status ?? "") !== "closed");
  const lastActivity = activities[0]?.created_at ?? opportunities[0]?.updated_at ?? contacts[0]?.updated_at ?? org.created_at;
  const nextOpp = activeOpps.find((o) => o.next_follow_up || o.next_followup_date) ?? activeOpps[0];
  const expected = opportunities.reduce((sum, o) => sum + Number(o.potential_value ?? 0), 0);
  const weighted = opportunities.reduce(
    (sum, o) => sum + Number(o.potential_value ?? 0) * (probabilityForStage(String(o.status ?? "")) / 100),
    0
  );
  const actual = invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.amount_usd ?? 0), 0);
  const revenueAtRisk = opportunities
    .filter((o) => isActiveOpportunity(o) && o.next_followup_date && String(o.next_followup_date) < new Date().toISOString().slice(0, 10))
    .reduce((sum, o) => sum + Number(o.potential_value ?? 0), 0);
  const pendingInvoices = invoices.filter((i) => !["paid", "void"].includes(String(i.status ?? "")));

  return (
    <div className="min-h-screen bg-clinical-paper/80 p-4 md:p-6">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <header className="rounded-xl border border-clinical-line bg-white p-4 shadow-card">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Organization Workspace</div>
              <h1 className="mt-1 text-2xl font-bold text-clinical-ink">{text(org.name)}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="vilo">{text(org.type)}</Badge>
                <Badge tone="neutral">{text(org.status, "active")}</Badge>
              </div>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2 xl:min-w-[560px]">
              <HeaderFact label="Primary contact" value={primaryContact ? text(primaryContact.full_name) : "Add first contact"} />
              <HeaderFact label="Last activity" value={date(lastActivity)} />
              <HeaderFact label="Next step" value={nextOpp ? text(nextOpp.next_follow_up ?? nextOpp.notes, "Create next step") : "No linked opportunity"} />
              <HeaderFact label="Open opportunities" value={String(activeOpps.length)} />
              <HeaderFact label="Active studies" value={String(activeStudies.length)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Quick href={`/dashboard/ingestion`} label="Add contact" />
            <Quick href={`/dashboard/ingestion`} label="Add opportunity" />
            <Quick href={`/dashboard/ingestion`} label="Create task" />
            <Quick href="#note" label="Add note" />
            <Quick href="#timeline" label="Log activity" />
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-5">
          <Metric label="Total expected revenue" value={money(expected)} />
          <Metric label="Actual revenue" value={money(actual)} />
          <Metric label="Open pipeline value" value={money(activeOpps.reduce((s, o) => s + Number(o.potential_value ?? 0), 0))} />
          <Metric label="Weighted pipeline" value={money(weighted)} />
          <Metric label="Revenue at risk" value={money(revenueAtRisk)} alert={revenueAtRisk > 0 || pendingInvoices.length > 0} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <WorkspaceCard title="Contacts" empty="No contacts yet. Add the first sponsor/CRO contact.">
            {contacts.length > 0 ? (
              <Table
                headers={["Name", "Role", "Email", "Phone", "Status", "Next follow-up"]}
                rows={contacts.map((c) => [
                  <Link key="n" href={`/vilo/contacts/${c.id}`} className="font-semibold text-vilo-600 hover:underline">{text(c.full_name)}</Link>,
                  text(c.role),
                  text(c.email),
                  text(c.phone),
                  text(c.status, "active"),
                  "Create follow-up",
                ])}
              />
            ) : null}
          </WorkspaceCard>

          <WorkspaceCard title="Tasks" empty="No organization-related tasks yet. Create a follow-up to keep sponsor activity moving.">
            {tasks.length > 0 ? (
              <TaskGroups tasks={tasks} />
            ) : null}
          </WorkspaceCard>
        </section>

        <WorkspaceCard title="Opportunities / Leads" empty="No opportunities linked to this organization yet.">
          {opportunities.length > 0 ? (
            <Table
              headers={["Opportunity", "Type", "Indication", "Stage", "Expected", "Probability", "Owner", "Next step", "Next date", "Last contact"]}
              rows={opportunities.map((o) => [
                <span key="o" className="font-semibold text-clinical-ink">{text(o.notes, `${text(org.name)} opportunity`)}</span>,
                text(o.opportunity_type),
                text(o.therapeutic_area),
                <Badge key="s" tone={String(o.status) === "Closed Lost" ? "alert" : "vilo"}>{text(o.status)}</Badge>,
                money(o.potential_value),
                `${probabilityForStage(String(o.status ?? ""))}%`,
                text(o.decision_maker_role),
                text(o.next_follow_up ?? o.notes, "Create next step"),
                text(o.next_followup_date, "Schedule"),
                text(o.last_contact_date, "No contact logged"),
              ])}
            />
          ) : null}
        </WorkspaceCard>

        <section className="grid gap-5 xl:grid-cols-2">
          <WorkspaceCard title="Studies" empty="No studies linked to this organization yet.">
            {studies.length > 0 ? (
              <Table
                headers={["Protocol", "Indication", "Status", "Startup", "Activation", "Expected", "Actual", "Margin"]}
                rows={studies.map((s) => [
                  text(s.protocol_number ?? s.protocol_identifier ?? s.name),
                  text(s.indication),
                  <Badge key="st" tone={String(s.status) === "active" ? "success" : "neutral"}>{text(s.status)}</Badge>,
                  text(s.startup_date, "Not set"),
                  text(s.activation_date, "Not active"),
                  money(s.expected_revenue),
                  money(s.actual_revenue),
                  money(s.margin),
                ])}
              />
            ) : null}
          </WorkspaceCard>

          <WorkspaceCard title="Financials" empty="No financial records linked yet.">
            {invoices.length > 0 ? (
              <Table
                headers={["Invoice", "Due", "Amount", "Costs", "Status"]}
                rows={invoices.map((i) => [
                  text(i.invoice_number ?? i.id),
                  text(i.due_date, "No due date"),
                  money(i.amount_usd),
                  money(i.pass_through_costs_usd),
                  <Badge key="i" tone={String(i.status) === "paid" ? "success" : "vilo"}>{text(i.status)}</Badge>,
                ])}
              />
            ) : null}
          </WorkspaceCard>
        </section>

        <section id="timeline" className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <WorkspaceCard title="Activity Timeline" empty="No activity logged for this organization yet.">
            {activities.length > 0 ? (
              <div className="divide-y divide-clinical-line">
                {activities.map((a) => (
                  <div key={String(a.id)} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{text(a.action ?? a.activity_type, "activity")}</Badge>
                      <span className="text-xs text-clinical-muted">{date(a.created_at)}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-clinical-ink">{text(a.entity_label ?? a.title, "Activity")}</div>
                    <div className="mt-0.5 text-xs text-clinical-muted">{text((a.metadata as Row | null)?.description ?? a.description, "No description")}</div>
                    <div className="mt-1 text-[11px] text-clinical-muted">Created by {text(a.user_name ?? a.created_by, "CRM")}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </WorkspaceCard>

          <Card id="note">
            <CardHeader>
              <h2 className="text-sm font-semibold text-clinical-ink">Add note</h2>
              <p className="text-xs text-clinical-muted">Organization-level internal note saved to activity log.</p>
            </CardHeader>
            <CardBody>
              <form action={addOrganizationNote} className="grid gap-3">
                <input type="hidden" name="organization_id" value={organizationId} />
                <Input name="title" required placeholder="Note title" />
                <Textarea name="body" placeholder="Note body" />
                <Button type="submit">Add note</Button>
              </form>
            </CardBody>
          </Card>
        </section>
      </div>
    </div>
  );
}

function HeaderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-clinical-muted">{label}</div>
      <div className="mt-1 truncate text-sm text-clinical-ink">{value}</div>
    </div>
  );
}

function Quick({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2 text-sm font-medium text-clinical-ink hover:bg-vilo-50">
      {label}
    </Link>
  );
}

function Metric({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <Card className={alert ? "border-clinical-alert/50" : ""}>
      <CardBody className="p-3">
        <div className="text-xs text-clinical-muted">{label}</div>
        <div className={alert ? "mt-1 text-xl font-semibold text-clinical-alert" : "mt-1 text-xl font-semibold text-clinical-ink"}>{value}</div>
      </CardBody>
    </Card>
  );
}

function WorkspaceCard({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-clinical-ink">{title}</h2>
      </CardHeader>
      <CardBody className="p-0">
        {children || <div className="p-6 text-sm text-clinical-muted">{empty}</div>}
      </CardBody>
    </Card>
  );
}

function Table({ headers, rows: tableRows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-clinical-line bg-clinical-paper text-xs uppercase text-clinical-muted">
          <tr>{headers.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-clinical-line">
          {tableRows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 text-clinical-muted">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskGroups({ tasks }: { tasks: Row[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const groups = [
    { label: "Overdue", rows: tasks.filter((t) => String(t.due_date ?? "") < today && !t.done) },
    { label: "Due today", rows: tasks.filter((t) => String(t.due_date ?? "") === today && !t.done) },
    { label: "Upcoming", rows: tasks.filter((t) => String(t.due_date ?? "") > today && !t.done) },
    { label: "Completed", rows: tasks.filter((t) => Boolean(t.done)) },
  ];
  return (
    <div className="space-y-3 p-4">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-clinical-muted">{g.label}</div>
          {g.rows.length ? (
            <div className="space-y-2">
              {g.rows.map((t) => (
                <div key={String(t.id)} className="rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2">
                  <div className="text-sm font-semibold text-clinical-ink">{text(t.title)}</div>
                  <div className="mt-0.5 text-xs text-clinical-muted">{text(t.priority)} · due {text(t.due_date)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-clinical-line bg-clinical-paper px-3 py-2 text-xs text-clinical-muted">No tasks in this group.</div>
          )}
        </div>
      ))}
    </div>
  );
}
