import { serviceClient } from "@/lib/supabase/service-role";

const WORKLOAD_SOURCE = "orchestrator:workload:suggest";

type OverLimitRow = { owner_id: string; open_count: number };

/**
 * Usuarios con más de `taskLimit` action_items abiertas: crea una sugerencia de reasignación.
 * Idempotente 24h por owner (mismo source).
 */
export async function runOrchestratorWorkloadTick(taskLimit = 10): Promise<{
  ok: boolean;
  suggestions: string[];
  errors: string[];
}> {
  const suggestions: string[] = [];
  const errors: string[] = [];

  const { data: rows, error: rpcErr } = await serviceClient.rpc("orchestrator_owners_over_task_limit", {
    p_limit: taskLimit,
  });

  if (rpcErr) {
    return { ok: false, suggestions, errors: [rpcErr.message] };
  }

  const since = new Date(Date.now() - 24 * 3600000).toISOString();

  for (const raw of (rows ?? []) as OverLimitRow[]) {
    const ownerId = raw.owner_id;
    const openCount = Number(raw.open_count);
    try {
      const { data: recent } = await serviceClient
        .from("action_items")
        .select("id")
        .eq("record_id", ownerId)
        .eq("record_type", "user")
        .eq("source", WORKLOAD_SOURCE)
        .gte("created_at", since)
        .limit(1);

      if (recent && recent.length > 0) continue;

      const { data: mates } = await serviceClient
        .from("user_profiles")
        .select("id, full_name")
        .neq("id", ownerId)
        .eq("active", true)
        .limit(12);

      const teammate = mates?.find((m) => m.id !== ownerId);

      const { error: insErr } = await serviceClient.from("action_items").insert({
        business_unit: "vilo_research",
        record_type: "user",
        record_id: ownerId,
        title: `Balanceo de carga — ${openCount} tareas abiertas`,
        status: "pending",
        next_action: teammate
          ? `Sugerencia Orchestrator: ¿asignar parte de las tareas a ${teammate.full_name}?`
          : "Redistribuir carga: revisar pool del Action Center",
        due_date: new Date(Date.now() + 48 * 3600000).toISOString(),
        priority: "medium",
        source: WORKLOAD_SOURCE,
        notes:
          "Orchestrator Agent — workload balancing. Ajustar BU en UI si el owner es solo Vitalis/Hazlo.",
      });

      if (insErr) errors.push(`${ownerId}: ${insErr.message}`);
      else suggestions.push(ownerId);
    } catch (e) {
      errors.push(`${ownerId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: errors.length === 0 || suggestions.length > 0, suggestions, errors };
}
