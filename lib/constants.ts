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

export const VITALIS_STAGES = [
  "New Lead",
  "Contact Attempted",
  "Responded",
  "Prescreen Started",
  "Prequalified",
  "Scheduled",
  "No-show",
  "Enrolled",
  "Screen Fail",
  "Nurture / Future Study",
] as const;

export type ViloStage = (typeof VILO_STAGES)[number];
export type VitalisStage = (typeof VITALIS_STAGES)[number];

export const PRIORITIES = ["Low", "Medium", "High"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_CHANNELS = ["vilo", "vitalis", "other"] as const;
export type TaskChannel = (typeof TASK_CHANNELS)[number];
