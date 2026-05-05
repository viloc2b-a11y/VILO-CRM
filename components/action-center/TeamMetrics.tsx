import { isActionItemOverdue } from "@/lib/action-center";
import { cn } from "@/lib/cn";
import { createServerSideClient } from "@/lib/supabase/server";
import type { ActionItem, BuEnum, TeamMemberRpcRow } from "@/lib/supabase/types";

const BU_LABEL: Record<BuEnum, string> = {
  vilo_research: "Vilo Research",
  vitalis: "Vitalis",
  hazloasiya: "HazloAsíYa",
};

function buHeadingLabel(units: BuEnum[]): string {
  if (units.length === 0) return "sin UE";
  if (units.length === 1) return BU_LABEL[units[0]];
  return units.map((u) => BU_LABEL[u]).join(" · ");
}

/**
 * Carga por persona: pendientes (solo status pending) y vencidas (derivado por fecha).
 * Tareas en pool (`assigned_to` null) se cuentan para cada compañero, como en el snippet original.
 * Requiere `13_team_members_rpc.sql` para listar compañeros.
 */
export default async function TeamMetrics() {
  const supabase = await createServerSideClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("allowed_business_units")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.allowed_business_units?.length) return null;

  const units = profile.allowed_business_units as BuEnum[];

  const { data: teammates, error: teamErr } = await supabase.rpc("team_members_for_my_business_units");
  if (teamErr || !teammates?.length) return null;

  const { data: taskRows, error: tasksErr } = await supabase
    .from("action_items")
    .select("assigned_to, status, due_date, business_unit")
    .in("business_unit", units)
    .in("status", ["pending", "in_progress"]);

  if (tasksErr) return null;

  const tasks = (taskRows ?? []) as Pick<ActionItem, "assigned_to" | "status" | "due_date" | "business_unit">[];

  const stats = (teammates as TeamMemberRpcRow[]).map((tm) => {
    const mineOrPool = (t: (typeof tasks)[number]) => t.assigned_to === tm.id || t.assigned_to == null;
    const pending = tasks.filter((t) => mineOrPool(t) && t.status === "pending").length;
    const overdue = tasks.filter((t) => mineOrPool(t) && isActionItemOverdue(t)).length;
    return {
      id: tm.id,
      name: tm.full_name,
      email: tm.email,
      pending,
      overdue,
    };
  });

  stats.sort((a, b) => a.name.localeCompare(b.name, "es"));

  return (
    <section
      className={cn(
        "rounded-lg border border-clinical-line bg-white p-4 shadow-card md:p-5",
      )}
    >
      <h2 className="mb-3 text-base font-semibold text-clinical-ink">
        👥 Carga por equipo{" "}
        <span className="font-normal text-clinical-muted">({buHeadingLabel(units)})</span>
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {stats.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between rounded-lg border border-clinical-line bg-clinical-paper/60 p-3"
          >
            <div className="min-w-0 pr-2">
              <div className="truncate font-medium text-clinical-ink">{u.name}</div>
              <div className="truncate text-xs text-clinical-muted">{u.email || "—"}</div>
            </div>
            <div className="shrink-0 space-y-1 text-right text-sm">
              <div>
                <span className="font-bold text-emerald-700">{u.pending}</span>{" "}
                <span className="text-clinical-muted">pend.</span>
              </div>
              <div>
                <span className="font-bold text-red-700">{u.overdue}</span>{" "}
                <span className="text-clinical-muted">venc.</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
