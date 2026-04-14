"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StageBars } from "@/components/charts/StageBars";
import { VILO_STAGES, VITALIS_STAGES } from "@/lib/constants";
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
import Link from "next/link";
import { FileText, BookOpen, ClipboardList, ExternalLink } from "lucide-react";
import { useMemo } from "react";

const DOCUMENTS = [
  {
    category: "Training",
    items: [
      {
        title: "Staff Training Manual",
        description:
          "Complete guide for coordinators and BD team — stages, workflows, daily routine",
        type: "docx",
        icon: "book",
        url: "/docs/VILO_CRM_Staff_Training_Manual.docx",
      },
      {
        title: "WhatsApp Intake Flow",
        description: "Message scripts A and B, form link format, campaign naming guide",
        type: "pdf",
        icon: "file",
        url: "/docs/WhatsApp_Intake_Flow.pdf",
      },
    ],
  },
  {
    category: "SOPs",
    items: [
      {
        title: "Patient Lead SOP",
        description:
          "Standard operating procedure — lead intake, contact timeline, stage transitions",
        type: "docx",
        icon: "clipboard",
        url: "/docs/SOP_Patient_Lead.docx",
      },
      {
        title: "Screen Fail Protocol",
        description: "How to record screen fails, required fields, recycling to Nurture",
        type: "docx",
        icon: "clipboard",
        url: "/docs/SOP_Screen_Fail.docx",
      },
      {
        title: "Feasibility Response SOP",
        description: "How to complete and return feasibility questionnaires for CROs",
        type: "docx",
        icon: "clipboard",
        url: "/docs/SOP_Feasibility.docx",
      },
    ],
  },
  {
    category: "Templates",
    items: [
      {
        title: "Sponsor Outreach Email",
        description: "Email template for cold and warm outreach to CROs and sponsors",
        type: "docx",
        icon: "file",
        url: "/docs/Template_Sponsor_Outreach.docx",
      },
      {
        title: "Site Capabilities One-Pager",
        description:
          "One-page site profile for sponsors — patient population, bilingual access, metrics",
        type: "pdf",
        icon: "file",
        url: "/docs/Site_Capabilities.pdf",
      },
    ],
  },
];

export function Dashboard() {
  const opps = useCrmStore((s) => s.viloOpportunities);
  const leads = useCrmStore((s) => s.patientLeads);
  const tasks = useCrmStore((s) => s.tasks);

  const today = todayISODate();
  const weekStart = startOfWeekMonday();
  const weekEnd = endOfWeekSunday(weekStart);

  const viloActive = useMemo(
    () => opps.filter((o) => o.status !== "Closed Lost" && o.status !== "Activated / Closed Won"),
    [opps]
  );

  const viloStageBars = useMemo(
    () => VILO_STAGES.map((s) => ({ label: s, value: opps.filter((o) => o.status === s).length })),
    [opps]
  );

  const vitalisStageBars = useMemo(
    () => VITALIS_STAGES.map((s) => ({ label: s, value: leads.filter((l) => l.currentStage === s).length })),
    [leads]
  );

  const overdueViloFollowups = useMemo(
    () =>
      opps.filter(
        (o) =>
          o.nextFollowupDate &&
          isDateBeforeToday(o.nextFollowupDate) &&
          o.status !== "Closed Lost"
      ),
    [opps]
  );

  const overdueVitalis = useMemo(
    () => leads.filter((l) => l.nextAction && l.nextAction.includes("-") && isDateBeforeToday(l.nextAction)),
    [leads]
  );

  const feasibilityThisWeek = useMemo(
    () =>
      opps.filter(
        (o) => o.feasibilitySentAt && isTimestampInWeek(o.feasibilitySentAt, weekStart, weekEnd)
      ),
    [opps, weekStart, weekEnd]
  );

  const closedWonThisMonth = useMemo(
    () => opps.filter((o) => o.closedWonAt && isTimestampInCurrentMonth(o.closedWonAt)),
    [opps]
  );

  const newLeadsToday = useMemo(
    () => leads.filter((l) => l.createdAt.slice(0, 10) === today),
    [leads, today]
  );

  const leadsBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const k = l.sourceCampaign?.trim() || "(no campaign)";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [leads]);

  const prescreensStarted = useMemo(
    () => leads.filter((l) => l.prescreenStartedAt).length,
    [leads]
  );

  const scheduledThisWeek = useMemo(
    () =>
      leads.filter(
        (l) => l.appointmentAt && isTimestampInWeek(l.appointmentAt, weekStart, weekEnd)
      ),
    [leads, weekStart, weekEnd]
  );

  const enrolledThisMonth = useMemo(
    () => leads.filter((l) => l.enrolledAt && isTimestampInCurrentMonth(l.enrolledAt)),
    [leads]
  );

  const screenFailReasons = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      if (l.currentStage !== "Screen Fail") continue;
      const k = l.screenFailReason?.trim() || "(unspecified)";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [leads]);

  const pendingTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.completed)
        .sort((a, b) => {
          const ao = isTaskOverdue(a.dueAt, false) ? 0 : 1;
          const bo = isTaskOverdue(b.dueAt, false) ? 0 : 1;
          if (ao !== bo) return ao - bo;
          return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        })
        .slice(0, 12),
    [tasks]
  );

  const topAlerts = useMemo(() => {
    const rows: { label: string; href: string; tone: "vilo" | "vitalis" | "alert" }[] = [];
    for (const o of overdueViloFollowups.slice(0, 4)) {
      rows.push({
        label: `Vilo follow-up overdue — ${o.companyName}`,
        href: "/vilo",
        tone: "vilo",
      });
    }
    for (const l of overdueVitalis.slice(0, 4)) {
      rows.push({
        label: `Vitalis action overdue — ${l.fullName}`,
        href: "/vitalis",
        tone: "vitalis",
      });
    }
    for (const t of tasks.filter((x) => isTaskOverdue(x.dueAt, x.completed)).slice(0, 4)) {
      rows.push({
        label: `Task overdue — ${t.title}`,
        href: "/tasks",
        tone: "alert",
      });
    }
    return rows.slice(0, 8);
  }, [overdueViloFollowups, overdueVitalis, tasks]);

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-clinical-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-clinical-muted">
          Operational view — Vilo (B2B) and Vitalis (B2C) metrics stay separate.
        </p>
      </header>

      {topAlerts.length > 0 && (
        <Card className="mb-6 border-clinical-alert/30 bg-red-50/40">
          <CardHeader className="py-2">
            <div className="text-sm font-semibold text-clinical-alert">Overdue & alerts</div>
          </CardHeader>
          <CardBody className="space-y-2 pt-0">
            {topAlerts.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className="flex items-center justify-between rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm hover:bg-vilo-50"
              >
                <span className="text-clinical-ink">{a.label}</span>
                <Badge tone={a.tone === "alert" ? "alert" : a.tone === "vitalis" ? "vitalis" : "vilo"}>
                  Open
                </Badge>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="text-xs font-semibold uppercase tracking-wide text-vilo-600">Vilo</div>
            <div className="text-sm text-clinical-muted">B2B opportunities</div>
          </CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Metric label="Active opportunities" value={String(viloActive.length)} />
            <Metric label="Overdue follow-ups" value={String(overdueViloFollowups.length)} highlight />
            <Metric label="Feasibility sent (week)" value={String(feasibilityThisWeek.length)} />
            <Metric label="Closed won (month)" value={String(closedWonThisMonth.length)} />
          </CardBody>
          <CardBody className="border-t border-clinical-line pt-0">
            <div className="mb-2 text-xs font-semibold text-clinical-ink">By stage</div>
            <StageBars items={viloStageBars} accent="vilo" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-xs font-semibold uppercase tracking-wide text-vitalis-700">Vitalis</div>
            <div className="text-sm text-clinical-muted">Patient leads</div>
          </CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Metric label="New leads today" value={String(newLeadsToday.length)} />
            <Metric label="Prescreens started (all time)" value={String(prescreensStarted)} />
            <Metric label="Scheduled (week)" value={String(scheduledThisWeek.length)} />
            <Metric label="Enrolled (month)" value={String(enrolledThisMonth.length)} />
            <Metric label="Overdue follow-ups" value={String(overdueVitalis.length)} highlight />
          </CardBody>
          <CardBody className="border-t border-clinical-line pt-0">
            <div className="mb-2 text-xs font-semibold text-clinical-ink">Pipeline by stage</div>
            <StageBars items={vitalisStageBars} accent="vitalis" />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold text-clinical-ink">Leads by source campaign</div>
          </CardHeader>
          <CardBody className="space-y-2">
            {leadsBySource.length === 0 ? (
              <div className="text-sm text-clinical-muted">No campaigns yet.</div>
            ) : (
              leadsBySource.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 text-clinical-muted" title={k}>
                    {k}
                  </span>
                  <span className="font-semibold text-clinical-ink">{v}</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="text-sm font-semibold text-clinical-ink">Screen fail reasons</div>
            <Link href="/vitalis" className="text-xs font-medium text-vitalis-700 hover:underline">
              Open Vitalis
            </Link>
          </CardHeader>
          <CardBody className="space-y-2">
            {screenFailReasons.length === 0 ? (
              <div className="text-sm text-clinical-muted">No screen fails recorded.</div>
            ) : (
              screenFailReasons.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 text-clinical-muted" title={k}>
                    {k}
                  </span>
                  <span className="font-semibold text-clinical-ink">{v}</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-clinical-ink">Pending tasks</div>
            <div className="text-xs text-clinical-muted">Sorted: overdue first, then due date</div>
          </div>
          <Link href="/tasks" className="text-xs font-medium text-vilo-700 hover:underline">
            All tasks
          </Link>
        </CardHeader>
        <CardBody className="divide-y divide-clinical-line p-0">
          {pendingTasks.length === 0 ? (
            <div className="p-4 text-sm text-clinical-muted">No open tasks.</div>
          ) : (
            pendingTasks.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-clinical-ink">{t.title}</div>
                  <div className="text-xs text-clinical-muted">
                    Due {new Date(t.dueAt).toLocaleString()}{" "}
                    {isTaskOverdue(t.dueAt, t.completed) ? (
                      <span className="font-semibold text-clinical-alert">· overdue</span>
                    ) : null}
                  </div>
                </div>
                <Badge tone={t.channel === "vitalis" ? "vitalis" : t.channel === "vilo" ? "vilo" : "neutral"}>
                  {t.channel}
                </Badge>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-clinical-ink">Documents</div>
            <div className="text-xs text-clinical-muted">SOPs, training materials, and templates</div>
          </div>
        </CardHeader>
        <CardBody className="space-y-6 pt-2">
          {DOCUMENTS.map((group) => (
            <div key={group.category}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                {group.category}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((doc) => (
                  <a
                    key={doc.title}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 rounded-lg border border-clinical-line bg-clinical-paper px-3 py-3 text-sm transition-colors hover:border-vilo-400 hover:bg-vilo-50"
                  >
                    <div className="mt-0.5 shrink-0 text-vilo-600">
                      {doc.icon === "book" ? (
                        <BookOpen className="h-4 w-4" />
                      ) : doc.icon === "clipboard" ? (
                        <ClipboardList className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-clinical-ink">{doc.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-clinical-muted" />
                      </div>
                      <div className="mt-0.5 text-xs text-clinical-muted line-clamp-2">{doc.description}</div>
                      <div className="mt-1.5">
                        <span className="inline-block rounded bg-clinical-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clinical-muted">
                          {doc.type}
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2">
      <div className="text-xs text-clinical-muted">{label}</div>
      <div className={highlight ? "text-2xl font-semibold text-clinical-alert" : "text-2xl font-semibold text-clinical-ink"}>
        {value}
      </div>
    </div>
  );
}
