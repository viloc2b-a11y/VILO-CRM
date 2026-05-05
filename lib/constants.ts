export const VILO_STAGES = [
  "Lead Identified",
  "Outreach Sent",
  "Response Received",
  "Intro Call Pending",
  "Feasibility Sent",
  "Negotiation",
  "Activated / Closed Won",
  "Closed Lost",
  "Nurture",
] as const;

import type { VitalisStage as VitalisStageDb } from "@/lib/supabase/types";

/** Orden UI/filtros; debe coincidir con `vitalis_stage` en BD y `VitalisStage` en `lib/supabase/types.ts`. */
export const VITALIS_STAGES = [
  "New Lead",
  "Contact Attempted",
  "Responded",
  "Prescreen Started",
  "Prequalified",
  "Scheduled",
  "Visit Confirmed",
  "No-show",
  "Enrolled",
  "Screen Fail",
  "Patient Lost",
  "Nurture / Future Study",
] as const satisfies readonly VitalisStageDb[];

export type ViloStage = (typeof VILO_STAGES)[number];
export type VitalisStage = (typeof VITALIS_STAGES)[number];

export const PRIORITIES = ["Low", "Medium", "High"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_CHANNELS = ["vilo", "vitalis", "other"] as const;
export type TaskChannel = (typeof TASK_CHANNELS)[number];
