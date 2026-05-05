export type HazloFunnelType = "snap_medicaid" | "daca_itin";

export type ValidationSeverity = "error" | "warning";

export type ValidationOverall = "pass" | "fail" | "needs_human_review";

export type ValidationIssue = {
  code: string;
  message: string;
  severity: ValidationSeverity;
  doc_key?: string;
  /** URL pública de ejemplo “así debe verse” (config HAZLO_VALIDATOR_EXAMPLE_BASE_URL). */
  example_url?: string;
};

export type DocumentExtraction = {
  doc_key: string;
  path: string;
  mime: string;
  text: string;
  quality_score: number | null;
  width?: number;
  height?: number;
};

export type ValidationReportV1 = {
  version: 1;
  ran_at: string;
  funnel_type: HazloFunnelType;
  overall: ValidationOverall;
  quality_scores: Record<string, number | null>;
  issues: ValidationIssue[];
  extractions: Pick<DocumentExtraction, "doc_key" | "quality_score" | "width" | "height">[];
};
