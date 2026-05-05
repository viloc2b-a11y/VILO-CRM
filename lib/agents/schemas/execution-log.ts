import { z } from "zod";

export const agentExecutionStatusSchema = z.enum(["success", "retry", "failed"]);

export const agentExecutionLogInsertSchema = z.object({
  agent_name: z.string().min(1).max(128),
  trigger_event: z.string().min(1).max(256),
  input_data: z.unknown().nullable().optional(),
  output_data: z.unknown().nullable().optional(),
  status: agentExecutionStatusSchema,
  execution_time_ms: z.number().int().nonnegative(),
  error_message: z.string().max(8000).nullable().optional(),
});

export type AgentExecutionLogInsert = z.infer<typeof agentExecutionLogInsertSchema>;
