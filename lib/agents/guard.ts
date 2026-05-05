import { serviceClient } from "@/lib/supabase/service-role";

/** Si la fila no existe, el agente se considera habilitado (compatibilidad tras migración). */
export async function isAgentEnabled(agentKey: string): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("agent_automation_settings")
    .select("enabled")
    .eq("agent_key", agentKey)
    .maybeSingle();

  if (error) {
    console.warn("[isAgentEnabled]", agentKey, error.message);
    return true;
  }
  if (!data) return true;
  return data.enabled !== false;
}

/** Pausa manual por registro (futuro: llamar desde orchestrator / triggers). */
export async function isRecordAutomationPaused(tableName: string, recordId: string): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("record_automation_overrides")
    .select("paused")
    .eq("table_name", tableName)
    .eq("record_id", recordId)
    .maybeSingle();

  if (error || !data) return false;
  return data.paused === true;
}
