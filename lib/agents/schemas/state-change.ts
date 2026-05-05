import { z } from "zod";

export const orchestratorCrmTableSchema = z.enum(["patient_leads", "vilo_opportunities", "submissions"]);

export const orchestratorStateChangeSchema = z.object({
  table: orchestratorCrmTableSchema,
  recordId: z.string().uuid(),
  changes: z.record(z.string(), z.unknown()),
  oldValues: z.record(z.string(), z.unknown()).optional(),
});

export type OrchestratorStateChangeInput = z.infer<typeof orchestratorStateChangeSchema>;
