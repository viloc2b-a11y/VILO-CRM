"use client";

import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import type { AgentAutomationSetting, AgentExecutionLog } from "@/lib/supabase/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Subconjunto mostrado en el panel (claves en `agent_automation_settings`, migración 25). */
const AGENT_SHORTLIST = [
  { key: "orchestrator", label: "Orchestrator" },
  { key: "triage", label: "Triage" },
  { key: "intake", label: "Intake" },
  { key: "hazlo_validator", label: "Validator" },
  { key: "hazlo_recovery", label: "Recovery" },
] as const;

export type AgentControlPanelProps = {
  recentLogs?: AgentExecutionLog[] | null;
};

function logBorderClass(status: AgentExecutionLog["status"]): string {
  if (status === "success") return "border-l-green-500";
  if (status === "retry") return "border-l-amber-500";
  return "border-l-red-500";
}

function logStatusClass(status: AgentExecutionLog["status"]): string {
  if (status === "success") return "text-green-600";
  if (status === "retry") return "text-amber-600";
  return "text-red-600";
}

/**
 * Estado de agentes + últimas ejecuciones. Toggles: solo admins (RLS).
 */
export function AgentControlPanel({ recentLogs = null }: AgentControlPanelProps) {
  const { isAdmin, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<AgentAutomationSetting[]>([]);
  const [logs, setLogs] = useState<AgentExecutionLog[]>(recentLogs ?? []);
  const [loading, setLoading] = useState(false);

  const settingByKey = useMemo(() => {
    const m = new Map<string, AgentAutomationSetting>();
    for (const s of settings) m.set(s.agent_key, s);
    return m;
  }, [settings]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const sb = createClient();
    const [{ data: s }, { data: l }] = await Promise.all([
      sb.from("agent_automation_settings").select("*").order("label"),
      sb.from("agent_execution_logs").select("*").order("created_at", { ascending: false }).limit(8),
    ]);
    setSettings((s as AgentAutomationSetting[]) ?? []);
    setLogs((l as AgentExecutionLog[]) ?? []);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    setLogs(recentLogs ?? []);
  }, [recentLogs]);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    void load();
  }, [authLoading, isAdmin, load]);

  async function toggle(agentKey: string, enabled: boolean) {
    const sb = createClient();
    const { error } = await sb.from("agent_automation_settings").update({ enabled }).eq("agent_key", agentKey);
    if (error) {
      window.alert(error.message);
      return;
    }
    setSettings((rows) => rows.map((r) => (r.agent_key === agentKey ? { ...r, enabled } : r)));
  }

  if (authLoading) {
    return (
      <div className="rounded-xl border border-clinical-line bg-white p-4 shadow-sm">
        <p className="text-xs text-clinical-muted">Cargando…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4 rounded-xl border border-clinical-line bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-clinical-ink">🤖 Estado de agentes</h3>
        <p className="text-xs text-clinical-muted">
          Solo administradores pueden ver toggles y el historial completo.{" "}
          <Link href="/admin" className="font-medium text-vilo-600 hover:underline">
            Panel admin
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-clinical-line bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-clinical-ink">🤖 Estado de agentes</h3>
        <Link href="/admin" className="text-xs font-medium text-vilo-600 hover:underline">
          Ver todo →
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-clinical-muted">Sincronizando…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {AGENT_SHORTLIST.map(({ key, label }) => {
            const row = settingByKey.get(key);
            const enabled = row?.enabled !== false;
            return (
              <button
                key={key}
                type="button"
                title={enabled ? "Activo — clic para pausar" : "Pausado — clic para activar"}
                onClick={() => void toggle(key, !enabled)}
                className="flex items-center justify-between rounded-lg bg-clinical-paper p-2 text-left transition-colors hover:bg-vilo-50"
              >
                <span className="text-sm capitalize text-clinical-ink">{label}</span>
                <span
                  className={cn(
                    "h-3 w-3 shrink-0 rounded-full",
                    enabled ? "animate-pulse bg-green-500" : "bg-slate-300",
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-medium text-clinical-ink">Últimas ejecuciones</h4>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-xs text-clinical-muted">Sin ejecuciones recientes.</p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "rounded border border-clinical-line bg-clinical-paper p-2 text-xs border-l-4",
                  logBorderClass(log.status),
                )}
              >
                <div className="font-medium text-clinical-ink">{log.agent_name}</div>
                <div className="truncate text-clinical-muted">{log.trigger_event}</div>
                <div className={cn("mt-1 font-semibold", logStatusClass(log.status))}>{log.status.toUpperCase()}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <Link
        href="/admin"
        className="flex w-full items-center justify-center rounded-lg bg-clinical-paper py-2 text-sm font-medium text-clinical-ink transition-colors hover:bg-vilo-50"
      >
        ⚙️ Override manual / pausar agente
      </Link>
    </div>
  );
}

export default AgentControlPanel;
