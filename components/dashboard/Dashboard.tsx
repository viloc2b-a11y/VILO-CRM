"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  endOfWeekSunday,
  isDateBeforeToday,
  isTaskOverdue,
  isTimestampInCurrentMonth,
  isTimestampInWeek,
  startOfWeekMonday,
  todayISODate,
} from "@/lib/dates";
import { useCrmStore } from "@/lib/store";
import type { ViloOpportunity } from "@/lib/types";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, ClipboardList, DollarSign, FileUp, Plus } from "lucide-react";
import { useMemo, type ReactNode } from "react";

const ACTIVE_STAGES = new Set([
  "Lead Identified",
  "Outreach Sent",
  "Response Received",
  "Intro Call Pending",
  "Feasibility Sent",
  "Budget / CTA",
  "Startup",
  "Active Study",
]);

function amount(o: ViloOpportunity): number {
  const parsed = Number.parseFloat(String(o.potentialValue || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function isActive(o: ViloOpportunity): boolean {
  return Boolean(o.organizationId) && ACTIVE_STAGES.has(o.status);
}

export function Dashboard() {
  const opps = useCrmStore((s) => s.viloOpportunities);
  const tasks = useCrmStore((s) => s.tasks);

  const weekStart = startOfWeekMonday();
  const weekEnd = endOfWeekSunday(weekStart);
  const today = todayISODate();

  const activeOpps = useMemo(() => opps.filter(isActive), [opps]);
  const overdueFollowups = useMemo(
    () => activeOpps.filter((o) => o.nextFollowupDate && isDateBeforeToday(o.nextFollowupDate)),
    [activeOpps]
  );
  const feasibilityThisWeek = useMemo(
    () =>
      opps.filter(
        (o) =>
          Boolean(o.organizationId) &&
          (o.status === "Feasibility Sent" ||
            Boolean(o.feasibilitySentAt && isTimestampInWeek(o.feasibilitySentAt, weekStart, weekEnd)))
      ),
    [opps, weekStart, weekEnd]
  );
  const budgetPending = useMemo(() => opps.filter((o) => o.organizationId && o.status === "Budget / CTA"), [opps]);
  const closedWonThisMonth = useMemo(
    () =>
      opps.filter(
        (o) => o.organizationId && (o.status === "Closed Won" || (o.closedWonAt && isTimestampInCurrentMonth(o.closedWonAt)))
      ),
    [opps]
  );
  const revenueAtRisk = useMemo(
    () => overdueFollowups.reduce((sum, o) => sum + amount(o), 0) + budgetPending.reduce((sum, o) => sum + amount(o), 0),
    [budgetPending, overdueFollowups]
  );
  const urgentActions = useMemo(() => {
    const opportunityActions = [...overdueFollowups, ...budgetPending].map((o) => ({
      id: `opp-${o.id}`,
      title: o.nextFollowUp || o.notes || `Follow up with ${o.companyName}`,
      owner: o.companyName,
      due: o.nextFollowupDate || "No due date",
      priority: o.priority,
      href: "/vilo",
      type: "Opportunity",
    }));
    const taskActions = tasks
      .filter((t) => !t.completed && (isTaskOverdue(t.dueAt, false) || t.dueAt.slice(0, 10) === today))
      .map((t) => ({
        id: `task-${t.id}`,
        title: t.title,
        owner: t.channel,
        due: new Date(t.dueAt).toLocaleString(),
        priority: t.priority,
        href: "/tasks",
        type: "Task",
      }));
    return [...opportunityActions, ...taskActions]
      .sort((a, b) => {
        const rank = { High: 0, Medium: 1, Low: 2 } as Record<string, number>;
        return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
      })
      .slice(0, 5);
  }, [budgetPending, overdueFollowups, tasks, today]);

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Vilo Research Group Ops CRM</div>
          <h1 className="text-2xl font-semibold text-clinical-ink">Execution Overview</h1>
          <p className="mt-1 max-w-2xl text-sm text-clinical-muted">
            Today-first view for sponsor/CRO pipeline, feasibility work, Budget/CTA follow-up, and revenue at risk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrimaryCta href="/action-center" label="Open Action Center" />
          <SecondaryCta href="/dashboard/ingestion" label="Import CSV" />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Active opportunities" value={String(activeOpps.length)} href="/vilo" icon={<BriefcaseBusiness />} />
        <MetricCard label="Overdue follow-ups" value={String(overdueFollowups.length)} href="/action-center" alert icon={<AlertTriangle />} />
        <MetricCard label="Feasibilities sent this week" value={String(feasibilityThisWeek.length)} href="/vilo" icon={<ClipboardList />} />
        <MetricCard label="Budget / CTA pending" value={String(budgetPending.length)} href="/vilo" icon={<ClipboardList />} />
        <MetricCard label="Closed won this month" value={String(closedWonThisMonth.length)} href="/vilo" icon={<BriefcaseBusiness />} />
        <MetricCard label="Revenue at risk" value={money(revenueAtRisk)} href="/financials" alert={revenueAtRisk > 0} icon={<DollarSign />} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-clinical-ink">Next 5 urgent actions</div>
              <div className="text-xs text-clinical-muted">Overdue follow-ups, due-today tasks, and Budget/CTA items.</div>
            </div>
            <Link href="/action-center" className="text-xs font-medium text-vilo-600 hover:underline">
              Action Center
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            {urgentActions.length > 0 ? (
              <div className="divide-y divide-clinical-line">
                {urgentActions.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-vilo-50/40"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={item.priority === "High" ? "alert" : "vilo"}>{item.priority}</Badge>
                        <span className="text-xs text-clinical-muted">{item.type}</span>
                      </div>
                      <div className="mt-1 truncate font-medium text-clinical-ink">{item.title}</div>
                      <div className="mt-0.5 text-xs text-clinical-muted">
                        {item.owner} · due {item.due}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-vilo-600">
                      Open record <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No urgent actions queued."
                body="Create a task or add the next step to an opportunity so the system can prioritize today’s work."
                primary={{ href: "/tasks", label: "Create task" }}
                secondary={{ href: "/vilo", label: "Create opportunity" }}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-sm font-semibold text-clinical-ink">Start here</div>
            <div className="text-xs text-clinical-muted">Default operating priority for the CRM.</div>
          </CardHeader>
          <CardBody className="space-y-2">
            <PriorityLink href="/action-center" title="1. Action Center" text="Work the queues that require attention today." />
            <PriorityLink href="/vilo" title="2. Vilo Pipeline" text="Move sponsor/CRO deals through feasibility, Budget/CTA, and startup." />
            <PriorityLink href="/dashboard/sponsor" title="3. Sponsor Intelligence" text="Review sponsor behavior, revenue, response patterns, and next action." />
            <PriorityLink href="/financials" title="4. Financials" text="Track revenue risk, invoices, and budget leakage." />
          </CardBody>
        </Card>
      </div>

      {activeOpps.length === 0 ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <EmptyState
            title="No active opportunities yet."
            body="Start by adding a sponsor/CRO opportunity so follow-ups, revenue risk, and pipeline stages can be tracked."
            primary={{ href: "/vilo", label: "Create opportunity" }}
            secondary={{ href: "/contacts", label: "Add sponsor/CRO" }}
          />
          <EmptyState
            title="No imported CRM data found."
            body="Use import when you already have sponsor, contact, task, or pipeline data outside the CRM."
            primary={{ href: "/dashboard/ingestion", label: "Import CSV" }}
            secondary={{ href: "/tasks", label: "Create task" }}
            icon="import"
          />
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  href,
  alert,
  icon,
}: {
  label: string;
  value: string;
  href: string;
  alert?: boolean;
  icon: ReactNode;
}) {
  return (
    <Link href={href}>
      <Card className={alert ? "border-clinical-alert/50" : ""}>
        <CardBody className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-clinical-muted">{label}</div>
            <span className={alert ? "text-clinical-alert" : "text-vilo-600"}>{icon}</span>
          </div>
          <div className={alert ? "mt-2 text-2xl font-semibold text-clinical-alert" : "mt-2 text-2xl font-semibold text-clinical-ink"}>
            {value}
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

function EmptyState({
  title,
  body,
  primary,
  secondary,
  icon,
}: {
  title: string;
  body: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  icon?: "import";
}) {
  const Icon = icon === "import" ? FileUp : Plus;
  return (
    <Card>
      <CardBody className="p-6">
        <Icon className="h-5 w-5 text-vilo-600" />
        <h2 className="mt-3 text-base font-semibold text-clinical-ink">{title}</h2>
        <p className="mt-2 text-sm text-clinical-muted">{body}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryCta href={primary.href} label={primary.label} />
          {secondary ? <SecondaryCta href={secondary.href} label={secondary.label} /> : null}
        </div>
      </CardBody>
    </Card>
  );
}

function PrimaryCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-lg bg-vilo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-vilo-700"
    >
      {label}
    </Link>
  );
}

function SecondaryCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm font-medium text-clinical-ink transition-colors hover:bg-vilo-50"
    >
      {label}
    </Link>
  );
}

function PriorityLink({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="block rounded-lg border border-clinical-line bg-clinical-paper px-3 py-3 hover:border-vilo-400">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-clinical-ink">{title}</div>
          <div className="mt-0.5 text-xs text-clinical-muted">{text}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-vilo-600" />
      </div>
    </Link>
  );
}
