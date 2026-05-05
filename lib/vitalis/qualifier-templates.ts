/**
 * Plantillas de prescreening — URLs reales en env (Typeform/Tally por vertical).
 * Preguntas viven en el proveedor; aquí solo routing + metadatos.
 */
export type QualifierTemplateId = "diabetes" | "oncology" | "cardiovascular" | "default";

export type QualifierTemplate = {
  id: QualifierTemplateId;
  label: string;
  /** Palabras clave en condition_or_study_interest (lowercase) */
  keywords: string[];
  questionCount: number;
  /** Nombre variable de entorno con URL base del formulario */
  formUrlEnv: string;
};

export const QUALIFIER_TEMPLATES: QualifierTemplate[] = [
  {
    id: "diabetes",
    label: "Diabetes",
    keywords: ["diabetes", "dm2", "dm1", "glucosa", "insulin"],
    questionCount: 15,
    formUrlEnv: "QUALIFIER_FORM_URL_DIABETES",
  },
  {
    id: "oncology",
    label: "Oncología",
    keywords: ["onco", "cáncer", "cancer", "tumor", "neoplasia", "chemo"],
    questionCount: 20,
    formUrlEnv: "QUALIFIER_FORM_URL_ONCOLOGY",
  },
  {
    id: "cardiovascular",
    label: "Cardiovascular",
    keywords: ["cardio", "corazón", "corazon", "hipertensión", "hipertension", "chf", "ic"],
    questionCount: 12,
    formUrlEnv: "QUALIFIER_FORM_URL_CARDIO",
  },
  {
    id: "default",
    label: "General",
    keywords: [],
    questionCount: 10,
    formUrlEnv: "QUALIFIER_FORM_URL_DEFAULT",
  },
];

const ENV_FALLBACK = "QUALIFIER_FORM_URL_DEFAULT";

export function pickQualifierTemplate(conditionInterest: string | null): QualifierTemplate {
  const hay = (conditionInterest ?? "").toLowerCase();
  for (const t of QUALIFIER_TEMPLATES) {
    if (t.id === "default") continue;
    if (t.keywords.some((k) => hay.includes(k))) return t;
  }
  return QUALIFIER_TEMPLATES.find((t) => t.id === "default")!;
}

export function resolveFormUrl(template: QualifierTemplate): string | null {
  const primary = process.env[template.formUrlEnv]?.trim();
  if (primary) return primary;
  const fb = process.env[ENV_FALLBACK]?.trim();
  return fb || null;
}
