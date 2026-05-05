/** Agente Triage — priorización y alertas en Action Center. */
export {
  calculatePriorityScore,
  type CalculatePriorityScoreInput,
  priorityFromScore100,
  probabilidadFromPercent,
  probabilidadFromViloStage,
  probabilidadFromVitalisStage,
  triageScore100,
  urgenciaPoints,
  valorPoints,
} from "@/lib/triage/score";
export { runTriageAgentTick, type TriageTickResult } from "@/lib/triage/run";
