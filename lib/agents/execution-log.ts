import { agentExecutionLogInsertSchema, type AgentExecutionLogInsert } from "@/lib/agents/schemas/execution-log";
import { serviceClient } from "@/lib/supabase/service-role";
import type { InsertAgentExecutionLog } from "@/lib/supabase/types";

export async function logAgentExecution(row: AgentExecutionLogInsert): Promise<void> {
  const parsed = agentExecutionLogInsertSchema.safeParse(row);
  if (!parsed.success) {
    console.error("[logAgentExecution] validation", parsed.error.flatten());
    return;
  }
  const payload: InsertAgentExecutionLog = {
    agent_name: parsed.data.agent_name,
    trigger_event: parsed.data.trigger_event,
    input_data: (parsed.data.input_data ?? null) as InsertAgentExecutionLog["input_data"],
    output_data: (parsed.data.output_data ?? null) as InsertAgentExecutionLog["output_data"],
    status: parsed.data.status,
    execution_time_ms: parsed.data.execution_time_ms,
    error_message: parsed.data.error_message ?? null,
  };
  const { error } = await serviceClient.from("agent_execution_logs").insert(payload);
  if (error) console.error("[logAgentExecution] insert", error.message);
}
