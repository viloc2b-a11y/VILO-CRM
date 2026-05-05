import type { Json } from "@/lib/supabase/types";

const HIGH_PROGRAM_STATES = new Set(["CA", "TX", "NY", "FL", "IL"]);

function docKeyCount(raw: Json): number {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
  return Object.keys(raw as Record<string, unknown>).filter((k) => {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string") return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return v != null;
  }).length;
}

/**
 * Score 0–100 heurístico (edad, estado, docs reutilizables, tiempo desde PDF).
 */
export function computePropensityScore(params: {
  userBirthYear: number | null;
  mailingState: string | null;
  documentPaths: Json;
  pdfDeliveredAt: Date;
  now: Date;
}): number {
  let s = 38;

  const nDocs = docKeyCount(params.documentPaths);
  s += Math.min(22, nDocs * 4);

  const st = params.mailingState?.trim().toUpperCase();
  if (st && HIGH_PROGRAM_STATES.has(st)) s += 18;
  else if (st && st.length === 2) s += 8;

  if (params.userBirthYear) {
    const age = params.now.getUTCFullYear() - params.userBirthYear;
    if (age >= 22 && age <= 55) s += 12;
    else if (age >= 18 && age <= 65) s += 6;
  } else {
    s += 4;
  }

  const daysSincePdf = (params.now.getTime() - params.pdfDeliveredAt.getTime()) / 86400000;
  if (daysSincePdf >= 7 && daysSincePdf <= 21) s += 10;
  else if (daysSincePdf > 21) s += 4;

  return Math.min(100, Math.round(s));
}
