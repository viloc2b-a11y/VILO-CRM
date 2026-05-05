import type { Json } from "@/lib/supabase/types";
import type { GrowthSegment } from "@/lib/hazlo/growth/types";

function docPathsKeys(raw: Json): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.keys(raw as Record<string, unknown>);
}

/**
 * Inferencia: `snap_medicaid` → SNAP; `daca_itin` + docs I-94/pasaporte → DACA; si no → ITIN.
 */
export function inferGrowthSegment(funnelType: string, documentPaths: Json): GrowthSegment {
  if (funnelType === "snap_medicaid") return "snap";
  const keys = docPathsKeys(documentPaths).map((k) => k.toLowerCase());
  const dacaHints = ["i94", "i-94", "passport", "pasaporte", "daca"];
  if (dacaHints.some((h) => keys.some((k) => k.includes(h)))) return "daca";
  return "itin";
}
