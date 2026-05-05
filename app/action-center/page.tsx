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

  const rows = (tasksRes.data ?? []) as ActionItem[];
  const filtered = rows.filter((row) => isActionInFocusWindow(row, start, windowEnd));
  const initialData = sortActionItemsForDisplay(filtered);
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
