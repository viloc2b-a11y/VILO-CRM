import type { ActionItem, ActionItemPriority } from "@/lib/supabase/types";
import type { VitalisStage, ViloStage } from "@/lib/supabase/types";

/** Puntos 0–10 según value_usd (o valor efectivo en USD). */
export function valorPoints(valueUsd: number | null): number {
  if (valueUsd == null || Number.isNaN(valueUsd)) return 2;
  if (valueUsd > 50_000) return 10;
  if (valueUsd > 10_000) return 7;
  if (valueUsd > 1_000) return 4;
  return 2;
}

/** Puntos 0–10 según proximidad de due_date (UTC). Sin fecha → baja urgencia. */
export function urgenciaPoints(dueDateIso: string | null, nowMs: number): number {
  if (!dueDateIso) return 2;
  const due = new Date(dueDateIso).getTime();
  if (Number.isNaN(due)) return 2;
  const hoursLeft = (due - nowMs) / 3_600_000;
  if (hoursLeft < 0) return 10;
  if (hoursLeft < 24) return 10;
  if (hoursLeft < 72) return 7;
  if (hoursLeft < 168) return 4;
  return 2;
}

/**
 * Probabilidad 0–10 desde etapa Vilo.
 * CRM: "Contracting" / "Budget negotiation" → `Negotiation` (9).
 */
export function probabilidadFromViloStage(stage: ViloStage | null | undefined): number {
  if (!stage) return 5;
  switch (stage) {
    case "Lead Identified":
      return 3;
    case "Outreach Sent":
    case "Response Received":
    case "Intro Call Pending":
      return 4;
    case "Feasibility Sent":
      return 5;
    case "Negotiation":
      return 9;
    case "Activated":
      return 8;
    case "Closed Lost":
    case "Nurture":
      return 2;
    default:
      return 5;
  }
}

/** Probabilidad para tareas ligadas a paciente (Vitalis). */
export function probabilidadFromVitalisStage(stage: VitalisStage | null | undefined): number {
  if (!stage) return 5;
  switch (stage) {
    case "New Lead":
    case "Contact Attempted":
      return 3;
    case "Responded":
    case "Prescreen Started":
      return 5;
    case "Prequalified":
      return 6;
    case "Scheduled":
    case "Visit Confirmed":
      return 8;
    case "Enrolled":
      return 10;
    case "No-show":
    case "Screen Fail":
    case "Patient Lost":
    case "Nurture / Future Study":
      return 4;
    default:
      return 5;
  }
}

/**
 * Score 0–100: (V*0.4 + U*0.3 + P*0.3) * 10
 */
export function triageScore100(valor: number, urgencia: number, probabilidad: number): number {
  const raw = valor * 0.4 + urgencia * 0.3 + probabilidad * 0.3;
  return Math.round(raw * 10 * 100) / 100;
}

export function priorityFromScore100(score100: number): ActionItemPriority {
  if (score100 > 80) return "critical";
  if (score100 > 60) return "high";
  if (score100 > 40) return "medium";
  return "low";
}

/** Puntos 0–10 desde probabilidad 0–100 (oportunidad), alineado a umbrales típicos de forecast. */
export function probabilidadFromPercent(prob: number | null | undefined): number {
  if (prob == null || Number.isNaN(Number(prob))) return 5;
  const p = Number(prob);
  if (p > 80) return 10;
  if (p > 50) return 7;
  if (p > 30) return 5;
  return 3;
}

/**
 * Prioridad sugerida para una fila tipo `action_items` (no existe tabla `tasks` polimórfica en VILO).
 * Usa la misma lógica que tu snippet (`value` / `due` / `prob`), pero:
 * - `value_usd` viene de la columna o de `metadata.value_usd` opcional.
 * - Escala 0–100 interna: el snippet comparaba `score >= 80` sobre una suma máx. ~10; aquí se usa `triageScore100`.
 * - Sin `due_date`: urgencia baja (2 pts), no “ahora” como en el snippet con `new Date()`.
 */
export type CalculatePriorityScoreInput = Partial<Pick<ActionItem, "value_usd" | "due_date">> & {
  probability?: number | null;
  metadata?: { value_usd?: number; probability?: number } | null;
};

export function calculatePriorityScore(task: CalculatePriorityScoreInput, nowMs = Date.now()): ActionItemPriority {
  const meta = task.metadata;
  let valueUsd: number | null =
    task.value_usd != null && !Number.isNaN(Number(task.value_usd)) ? Number(task.value_usd) : null;
  if (valueUsd == null && meta?.value_usd != null && !Number.isNaN(Number(meta.value_usd))) {
    valueUsd = Number(meta.value_usd);
  }

  const probRaw =
    task.probability != null && !Number.isNaN(Number(task.probability))
      ? Number(task.probability)
      : meta?.probability != null && !Number.isNaN(Number(meta.probability))
        ? Number(meta.probability)
        : 50;

  const v = valorPoints(valueUsd);
  const u = urgenciaPoints(task.due_date ?? null, nowMs);
  const p = probabilidadFromPercent(probRaw);
  const s100 = triageScore100(v, u, p);
  return priorityFromScore100(s100);
}
