export type {
  HazloFunnelType,
  ValidationIssue,
  ValidationOverall,
  ValidationReportV1,
} from "@/lib/hazlo/validator/types";
export {
  runHazloValidatorForSubmission,
  runHazloValidatorTick,
  /** Alias del tick principal (extracciones + reglas por documento). */
  runHazloValidatorTick as runValidatorTick,
} from "@/lib/hazlo/validator/run";
export {
  runDeclarativeValidatorForSubmission,
  runDeclarativeValidatorTick,
  validateSubmissionDocumentsDeclarative,
  type DeclarativeValidationJob,
} from "@/lib/hazlo/validator/declarative-run";
export {
  FUNNEL_RULES,
  validateSubmission,
  type FunnelRules,
  type ValidationResult,
} from "@/lib/hazlo/validator/rules";
export {
  extractTextFromPDF,
  extractTextFromImage,
  findPatterns,
  HAZLO_PATTERNS,
  type ExtractedText,
} from "@/lib/hazlo/validator/ocr";
