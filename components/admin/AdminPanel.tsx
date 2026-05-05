"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { AgentAutomationSetting, AgentExecutionLog } from "@/lib/supabase/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface UserProfile {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  allowed_business_units?: string[];
  created_at: string;
  email?: string;
}

interface ActivityEntry {
  id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_label: string | null;
  created_at: string;
}

const ROLE_OPTIONS = ["admin", "bd", "coordinator", "viewer"];

const ACTION_LABELS: Record<string, string> = {
  lead_created: "Created lead",
  lead_updated: "Updated lead",
  lead_stage_changed: "Moved lead stage",
  lead_deleted: "Deleted lead",
  opportunity_created: "Created opportunity",
  opportunity_updated: "Updated opportunity",
  opportunity_stage_changed: "Moved opportunity stage",
  task_created: "Created task",
  task_completed: "Completed task",
  task_deleted: "Deleted task",
  contact_created: "Created contact",
  contact_updated: "Updated contact",
  organization_created: "Created organization",
};

const ROLE_MATRIX: {
  role: string;
  dash: string;
  vilo: string;
  vit: string;
  con: string;
  tasks: string;
  admin: string;
}[] = [
  { role: "admin", dash: "Y", vilo: "Y", vit: "Y", con: "Y", tasks: "Y", admin: "Y" },
  { role: "bd", dash: "Y", vilo: "Y", vit: "-", con: "Y", tasks: "Y", admin: "-" },
  { role: "coordinator", dash: "Y", vilo: "-", vit: "Y", con: "-", tasks: "Y", admin: "-" },
  { role: "viewer", dash: "Y", vilo: "-", vit: "-", con: "-", tasks: "-", admin: "-" },
];

export function AdminPanel() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<"users" | "activity" | "agents">("users");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [filterUser, setFilterUser] = useState("all");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("coordinator");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [agentSettings, setAgentSettings] = useState<AgentAutomationSetting[]>([]);
  const [execLogs, setExecLogs] = useState<AgentExecutionLog[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [otTable, setOtTable] = useState("");
  const [otRecord, setOtRecord] = useState("");
  const [otReason, setOtReason] = useState("");
  const [overrideFeedback, setOverrideFeedback] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoadingData(false);
      return;
    }
    const sb = createClient();
    let cancelled = false;
    void Promise.all([
      sb.from("user_profiles").select("*").order("created_at"),
      sb.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200),
    ]).then(([{ data: u }, { data: a }]) => {
      if (cancelled) return;
      setUsers((u as UserProfile[]) ?? []);
      setActivity((a as ActivityEntry[]) ?? []);
      setLoadingData(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAdmin]);

  useEffect(() => {
    if (authLoading || !isAdmin || tab !== "agents") return;
    setAgentsLoading(true);
    const sb = createClient();
    let cancelled = false;
    void Promise.all([
      sb.from("agent_automation_settings").select("*").order("label"),
      sb.from("agent_execution_logs").select("*").order("created_at", { ascending: false }).limit(80),
    ])
      .then(([{ data: s }, { data: l }]) => {
        if (cancelled) return;
        setAgentSettings((s as AgentAutomationSetting[]) ?? []);
        setExecLogs((l as AgentExecutionLog[]) ?? []);
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAdmin, tab]);

  async function toggleAgentEnabled(agentKey: string, enabled: boolean) {
    const sb = createClient();
    const { error } = await sb.from("agent_automation_settings").update({ enabled }).eq("agent_key", agentKey);
    if (error) {
      window.alert(error.message);
      return;
    }
    setAgentSettings((rows) => rows.map((r) => (r.agent_key === agentKey ? { ...r, enabled } : r)));
  }

  async function submitAutomationOverride(e: React.FormEvent) {
    e.preventDefault();
    setOverrideFeedback("");
    const table = otTable.trim();
    const rid = otRecord.trim();
    if (!table || !rid) {
      setOverrideFeedback("Indica table_name y record_id (UUID).");
      return;
    }
    const sb = createClient();
    const { error } = await sb.from("record_automation_overrides").upsert(
      {
        table_name: table,
        record_id: rid,
        paused: true,
        reason: otReason.trim() || null,
      },
      { onConflict: "table_name,record_id" },
    );
    if (error) {
      setOverrideFeedback(error.message);
      return;
    }
    setOverrideFeedback("Pausa registrada. Los agentes deben consultar esta tabla antes de actuar.");
    setOtTable("");
    setOtRecord("");
    setOtReason("");
  }

  async function updateRole(userId: string, role: string) {
    const sb = createClient();
    await sb.from("user_profiles").update({ role }).eq("id", userId);
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, role } : x)));
  }

  async function toggleActive(userId: string, active: boolean) {
    const sb = createClient();
    await sb.from("user_profiles").update({ active }).eq("id", userId);
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, active } : x)));
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    setCreateSuccess("");
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, password: newPassword, full_name: newName, role: newRole }),
    });
    const json = await res.json();
    if (!res.ok) {
      setCreateError(json.error ?? "Failed to create user");
    } else {
      setCreateSuccess(`User ${newEmail} created successfully`);
      setNewEmail("");
      setNewName("");
      setNewPassword("");
      setNewRole("coordinator");
      const sb = createClient();
      const { data: u } = await sb.from("user_profiles").select("*").order("created_at");
      setUsers((u as UserProfile[]) ?? []);
    }
    setCreating(false);
  }

  const filteredActivity = filterUser === "all" ? activity : activity.filter((a) => a.user_name === filterUser);

  const uniqueUsers = [...new Set(activity.map((a) => a.user_name))];

  if (authLoading || loadingData) {
    return <div className="p-8 text-sm text-clinical-muted">Loading…</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-clinical-ink">Admin Panel</h1>
        <p className="mt-1 text-sm text-clinical-muted">Manage team access and review activity</p>
      </header>

      <div className="mb-6 flex gap-2">
        {(["users", "activity", "agents"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t
                ? "bg-vilo-600 text-white"
                : "border border-clinical-line bg-clinical-paper text-clinical-muted hover:bg-vilo-50"
            }`}
          >
            {t === "users" ? "Team Members" : t === "activity" ? "Activity Log" : "Agents"}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-clinical-ink">Add Team Member</div>
              <div className="text-xs text-clinical-muted">Creates a Supabase Auth account and assigns role</div>
            </CardHeader>
            <CardBody>
              <form onSubmit={createUser} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                    Full Name
                  </label>
                  <input
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2 text-sm text-clinical-ink outline-none focus:border-vilo-400"
                    placeholder="Rosa Martinez"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                    Email
                  </label>
                  <input
                    required
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2 text-sm text-clinical-ink outline-none focus:border-vilo-400"
                    placeholder="rosa@vilohealth.com"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                    Temporary Password
                  </label>
                  <input
                    required
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2 text-sm text-clinical-ink outline-none focus:border-vilo-400"
                    placeholder="Min 8 characters"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                    Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2 text-sm text-clinical-ink outline-none focus:border-vilo-400"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-lg bg-vilo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-vilo-700 disabled:opacity-60"
                  >
                    {creating ? "Creating…" : "Create User"}
                  </button>
                  {createError && <span className="text-sm font-medium text-red-600">{createError}</span>}
                  {createSuccess && <span className="text-sm font-medium text-green-600">{createSuccess}</span>}
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-clinical-ink">Role Permissions</div>
            </CardHeader>
            <CardBody className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-clinical-paper">
                  <tr>
                    {["Role", "Dashboard", "Vilo", "Vitalis", "Contacts", "Tasks", "Admin"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-clinical-line">
                  {ROLE_MATRIX.map((r) => (
                    <tr key={r.role}>
                      <td className="px-4 py-2 font-semibold capitalize text-clinical-ink">{r.role}</td>
                      {[r.dash, r.vilo, r.vit, r.con, r.tasks, r.admin].map((v, i) => (
                        <td
                          key={i}
                          className={`px-4 py-2 font-medium ${v === "Y" ? "text-green-600" : "text-clinical-muted"}`}
                        >
                          {v === "Y" ? "Yes" : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-clinical-ink">Team Members ({users.length})</div>
            </CardHeader>
            <CardBody className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-clinical-paper">
                  <tr>
                    {["Name", "Role", "Business units", "Status", "Actions"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-clinical-line">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-medium text-clinical-ink">{u.full_name}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => void updateRole(u.id, e.target.value)}
                          className="rounded border border-clinical-line bg-clinical-paper px-2 py-1 text-xs text-clinical-ink"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="max-w-[200px] px-4 py-3 text-xs text-clinical-muted">
                        {(u.allowed_business_units ?? ["vilo_research", "vitalis"]).join(", ")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={u.active ? "vitalis" : "neutral"}>{u.active ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void toggleActive(u.id, !u.active)}
                          className="rounded-lg border border-clinical-line px-3 py-1 text-xs font-medium text-clinical-muted hover:bg-red-50 hover:text-red-600"
                        >
                          {u.active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "agents" && (
        <div className="space-y-6">
          {agentsLoading ? (
            <div className="text-sm text-clinical-muted">Loading agents…</div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="text-sm font-semibold text-clinical-ink">Agent automation</div>
                  <div className="text-xs text-clinical-muted">
                    Desactiva un agente para que los cron / Edge Functions no ejecuten lógica (p. ej. Triage consulta
                    esta tabla).
                  </div>
                </CardHeader>
                <CardBody className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-clinical-paper">
                      <tr>
                        {["Agent", "Key", "Enabled"].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-clinical-line">
                      {agentSettings.map((a) => (
                        <tr key={a.agent_key}>
                          <td className="px-4 py-3 font-medium text-clinical-ink">{a.label}</td>
                          <td className="px-4 py-3 font-mono text-xs text-clinical-muted">{a.agent_key}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => void toggleAgentEnabled(a.agent_key, !a.enabled)}
                              className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                                a.enabled
                                  ? "border-green-200 bg-green-50 text-green-800"
                                  : "border-clinical-line bg-clinical-paper text-clinical-muted"
                              }`}
                            >
                              {a.enabled ? "ON" : "OFF"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <div className="text-sm font-semibold text-clinical-ink">Manual override (pausar por registro)</div>
                  <div className="text-xs text-clinical-muted">
                    Tabla PostgreSQL + UUID de fila. Los agentes deben llamar a{" "}
                    <code className="rounded bg-clinical-paper px-1">isRecordAutomationPaused</code> antes de efectos
                    automáticos.
                  </div>
                </CardHeader>
                <CardBody>
                  <form onSubmit={submitAutomationOverride} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                        table_name
                      </label>
                      <input
                        value={otTable}
                        onChange={(e) => setOtTable(e.target.value)}
                        placeholder="vilo_opportunities"
                        className="w-full rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2 text-sm text-clinical-ink outline-none focus:border-vilo-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                        record_id
                      </label>
                      <input
                        value={otRecord}
                        onChange={(e) => setOtRecord(e.target.value)}
                        placeholder="uuid"
                        className="w-full rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2 text-sm text-clinical-ink outline-none focus:border-vilo-400"
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinical-muted">
                        Motivo (opcional)
                      </label>
                      <input
                        value={otReason}
                        onChange={(e) => setOtReason(e.target.value)}
                        className="w-full rounded-lg border border-clinical-line bg-clinical-paper px-3 py-2 text-sm text-clinical-ink outline-none focus:border-vilo-400"
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
                      <button
                        type="submit"
                        className="rounded-lg bg-vilo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-vilo-700"
                      >
                        Pausar automatización
                      </button>
                      {overrideFeedback && (
                        <span className="text-xs text-clinical-muted">{overrideFeedback}</span>
                      )}
                    </div>
                  </form>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <div className="text-sm font-semibold text-clinical-ink">Execution log (últimas 80)</div>
                  <div className="text-xs text-clinical-muted">✅ success · ⚠️ retry · ❌ failed</div>
                </CardHeader>
                <CardBody className="p-0 max-h-[480px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-clinical-paper">
                      <tr>
                        {["Time", "Agent", "Event", "Status", "ms", "Error"].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-clinical-line">
                      {execLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-clinical-muted">
                            Sin ejecuciones registradas aún (aplica migración 25 y ejecuta un tick de Triage).
                          </td>
                        </tr>
                      ) : (
                        execLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="whitespace-nowrap px-4 py-2 text-xs text-clinical-muted">
                              {new Date(log.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-clinical-ink">{log.agent_name}</td>
                            <td className="max-w-[140px] truncate px-4 py-2 text-xs text-clinical-muted" title={log.trigger_event}>
                              {log.trigger_event}
                            </td>
                            <td className="px-4 py-2 text-lg leading-none">
                              {log.status === "success" ? "✅" : log.status === "retry" ? "⚠️" : "❌"}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-clinical-muted">{log.execution_time_ms}</td>
                            <td className="max-w-xs truncate px-4 py-2 text-xs text-red-700" title={log.error_message ?? undefined}>
                              {log.error_message ?? "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">Filter by user</label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="rounded-lg border border-clinical-line bg-clinical-paper px-3 py-1.5 text-sm text-clinical-ink"
            >
              <option value="all">All team members</option>
              {uniqueUsers.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <span className="text-xs text-clinical-muted">{filteredActivity.length} entries</span>
          </div>
          <Card>
            <CardBody className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-clinical-paper">
                  <tr>
                    {["Time", "User", "Action", "Record"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-clinical-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-clinical-line">
                  {filteredActivity.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-clinical-muted">
                        No activity recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filteredActivity.map((a) => (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-clinical-muted">
                          {new Date(a.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-clinical-ink">{a.user_name}</td>
                        <td className="px-4 py-2.5 text-clinical-muted">
                          {ACTION_LABELS[a.action] ?? a.action}
                        </td>
                        <td className="max-w-xs truncate px-4 py-2.5 text-clinical-muted">
                          {a.entity_label ?? a.entity_type}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
