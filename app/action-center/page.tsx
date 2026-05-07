import ActionCenterClient from "@/app/action-center/action-center-client";
import { MetricsDashboard } from "@/app/action-center/components/MetricsDashboard";
import { AgentControlPanel } from "@/app/action-center/components/AgentControlPanel";
import TeamMetrics from "@/components/action-center/TeamMetrics";
import {
  endOfUtcDayAfter,
  isActionInFocusWindow,
  sortActionItemsForDisplay,
  startOfUtcDay,
} from "@/lib/action-center";
import { createServerSideClient } from "@/lib/supabase/server";
import type { ActionItem, AgentExecutionLog, TeamMemberRpcRow } from "@/lib/supabase/types";

type LooseRow = Record<string, unknown>;
type LooseResult<T = LooseRow> = { data: T[] | T | null; error: { message: string } | null };
type LooseQuery<T = LooseRow> = PromiseLike<LooseResult<T>> & {
  select: (columns?: string) => LooseQuery<T>;
  eq: (column: string, value: unknown) => LooseQuery<T>;
  order: (column: string, options?: LooseRow) => LooseQuery<T>;
};
type LooseClient = { from: (table: string) => LooseQuery };

export default async function ActionCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string; search?: string; record?: string }>;
}) {
  const sp = await searchParams;
  const buParam = sp.bu;
  let initialSearch = typeof sp.search === "string" ? sp.search.trim() : "";
  if (!initialSearch && typeof sp.record === "string") {
    const raw = decodeURIComponent(sp.record.trim());
    const m = raw.match(/^submission:([a-f0-9-]+)$/i);
    if (m?.[1]) initialSearch = m[1];
  }
  const supabase = await createServerSideClient();

  const start = startOfUtcDay();
  const windowEnd = endOfUtcDayAfter(start, 7);

  const [tasksRes, teammatesRes, logsRes] = await Promise.all([
    supabase
      .from("action_items")
      .select("*")
      .in("status", ["pending", "in_progress"])
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.rpc("team_members_for_my_business_units"),
    supabase.from("agent_execution_logs").select("*").order("created_at", { ascending: false }).limit(5),
  ]);

  const [crmTasksRes, oppsRes] = await Promise.all([
    (supabase as unknown as LooseClient).from("tasks").select("*").eq("done", false).order("due_date", { ascending: true }),
    (supabase as unknown as LooseClient).from("vilo_opportunities").select("*").eq("archived", false).order("next_followup_date", {
      ascending: true,
      nullsFirst: false,
    }),
  ]);

  const rows = (tasksRes.data ?? []) as ActionItem[];
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const crmTaskRows = Array.isArray(crmTasksRes.data) ? (crmTasksRes.data as LooseRow[]) : [];
  const oppRows = Array.isArray(oppsRes.data) ? (oppsRes.data as LooseRow[]) : [];
  const crmTaskItems: ActionItem[] = crmTaskRows
    .filter((t) => {
      const d = t.due_date ? new Date(`${t.due_date}T12:00:00`) : null;
      return d && d.getTime() <= today.getTime();
    })
    .map((t) => ({
      id: `crm-task-${String(t.id)}`,
      business_unit: t.channel === "vitalis" ? "vitalis" : "vilo_research",
      record_type:
        t.related_type === "organization"
          ? "company"
          : ["contact", "opportunity", "study"].includes(String(t.related_type ?? ""))
            ? (String(t.related_type) as ActionItem["record_type"])
            : "study",
      record_id: String(t.linked_vilo_id ?? t.linked_vitalis_id ?? t.id),
      title: String(t.title ?? "Task needs action"),
      status: "pending",
      next_action: String(t.next_action ?? "Open task and complete the follow-up."),
      due_date: t.due_date ? `${String(t.due_date)}T12:00:00.000Z` : null,
      owner_id: null,
      assigned_to: null,
      priority: String(t.priority ?? "Medium").toLowerCase() as ActionItem["priority"],
      value_usd: null,
      notes: "Generated from CRM tasks",
      source: "crm_task",
      created_at: String(t.created_at ?? new Date().toISOString()),
      updated_at: String(t.updated_at ?? new Date().toISOString()),
    }));
  const oppItems: ActionItem[] = oppRows
    .filter((o) => {
      const status = String(o.status ?? "");
      const active = !["Closed Lost", "Activated", "Closed Won"].includes(status);
      const linkedToOrganization = Boolean(o.org_id);
      const missingNext = !o.next_followup_date && !o.next_follow_up;
      const due = o.next_followup_date ? new Date(`${String(o.next_followup_date)}T12:00:00`) : null;
      const overdue = due ? due.getTime() < today.getTime() : false;
      const stale = o.updated_at ? now.getTime() - new Date(String(o.updated_at)).getTime() > 7 * 86_400_000 : false;
      return linkedToOrganization && active && (missingNext || overdue || stale);
    })
    .map((o) => ({
      id: `crm-opp-${String(o.id)}`,
      business_unit: "vilo_research",
      record_type: "opportunity",
      record_id: String(o.id),
      title: String(o.company_name ?? "Opportunity needs action"),
      status: "pending",
      next_action: String(o.next_follow_up ?? (o.next_followup_date ? "Follow up overdue" : "Create next step")),
      due_date: o.next_followup_date ? `${String(o.next_followup_date)}T12:00:00.000Z` : null,
      owner_id: null,
      assigned_to: null,
      priority: o.priority === "High" ? "high" : "medium",
      value_usd: typeof o.potential_value === "number" ? o.potential_value : null,
      notes: "Generated from CRM opportunities",
      source: "crm_opportunity",
      created_at: String(o.created_at ?? new Date().toISOString()),
      updated_at: String(o.updated_at ?? new Date().toISOString()),
    }));
  const filtered = rows.filter((row) => isActionInFocusWindow(row, start, windowEnd));
  const initialData = sortActionItemsForDisplay([...filtered, ...crmTaskItems, ...oppItems]);
  const teammates = (teammatesRes.data ?? []) as TeamMemberRpcRow[];
  const recentLogs = (logsRes.data ?? []) as AgentExecutionLog[];

  return (
    <div className="min-h-screen bg-clinical-paper/80">
      <div className="mx-auto max-w-[1440px] space-y-5 p-4 md:p-6">
        <header className="flex flex-col gap-2 border-b border-clinical-line pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-clinical-ink">ViloOS Action Center</h1>
            <p className="mt-1 text-sm text-clinical-muted">
            Prioriza lo que mueve revenue, pacientes y partnerships hoy.
            </p>
          </div>
          <div className="text-xs font-medium uppercase tracking-wide text-clinical-muted">
            Cola global de ejecución
          </div>
        </header>

        {tasksRes.error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Action Center está en modo estructura: no se pudo leer <code>action_items</code>. Aplica las
            migraciones de Supabase para poblar la cola operativa.
          </div>
        ) : null}

        <MetricsDashboard />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <section className="min-w-0 space-y-4">
            <ActionCenterClient
              initialData={initialData}
              teammates={teammates}
              initialBu={buParam}
              initialSearch={initialSearch || undefined}
            />
          </section>
          <aside className="space-y-4 xl:sticky xl:top-6">
            <AgentControlPanel recentLogs={recentLogs} />
            <TeamMetrics />
          </aside>
        </div>
      </div>
    </div>
  );
}
