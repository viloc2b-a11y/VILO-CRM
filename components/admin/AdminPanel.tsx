"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface UserProfile {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
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

  const [tab, setTab] = useState<"users" | "activity">("users");
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
        {(["users", "activity"] as const).map((t) => (
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
            {t === "users" ? "Team Members" : "Activity Log"}
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
                    {["Name", "Role", "Status", "Actions"].map((h) => (
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
