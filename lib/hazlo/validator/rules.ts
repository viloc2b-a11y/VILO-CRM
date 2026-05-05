import { findPatterns, HAZLO_PATTERNS, type ExtractedText } from "@/lib/hazlo/validator/ocr";
import type { DocumentExtraction } from "@/lib/hazlo/validator/types";
import type { ValidationIssue } from "@/lib/hazlo/validator/types";

const QUALITY_MIN = 70;

function example(kind: string): string | undefined {
  const base = process.env.HAZLO_VALIDATOR_EXAMPLE_BASE_URL?.replace(/\/$/, "");
  if (!base) return undefined;
  return `${base}/${kind}`;
}

function normalizeAddr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fechas tipo MM/DD/YYYY, DD-MM-YYYY, YYYY-MM-DD */
function extractDates(text: string): Date[] {
  const out: Date[] = [];
  const re =
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b|\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g;
  let m: RegExpExecArray | null;
  const t = text.toLowerCase();
  while ((m = re.exec(t)) !== null) {
    try {
      if (m[4]) {
        const y = Number(m[4]);
        const mo = Number(m[5]) - 1;
        const d = Number(m[6]);
        out.push(new Date(Date.UTC(y, mo, d)));
      } else {
        const a = Number(m[1]);
        const b = Number(m[2]);
        let y = Number(m[3]);
        if (y < 100) y += 2000;
        if (a > 12) out.push(new Date(Date.UTC(y, b - 1, a)));
        else out.push(new Date(Date.UTC(y, a - 1, b)));
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function latestFutureExpiration(text: string, now: Date): Date | null {
  const dates = extractDates(text);
  let best: Date | null = null;
  for (const d of dates) {
    if (d > now && (!best || d > best)) best = d;
  }
  const keywords = /exp|expires|venc|expiration|valid through|válido hasta/i;
  if (!keywords.test(text)) return best;
  return best;
}

export function validateSnapMedicaid(params: {
  extractions: DocumentExtraction[];
  residenceAddress: string | null;
  now: Date;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byKey = Object.fromEntries(params.extractions.map((e) => [e.doc_key, e]));

  const idDoc = byKey.id_document;
  if (!idDoc) {
    issues.push({
      code: "missing_id",
      message: "Falta documento de identificación oficial.",
      severity: "error",
      doc_key: "id_document",
      example_url: example("snap_id_sample"),
    });
  } else {
    if (idDoc.quality_score != null && idDoc.quality_score < QUALITY_MIN) {
      issues.push({
        code: "blurry_id",
        message: `ID ilegible o muy borroso (calidad ${idDoc.quality_score}%, mínimo ${QUALITY_MIN}%). Vuelve a fotografiarlo con buena luz.`,
        severity: "error",
        doc_key: "id_document",
        example_url: example("snap_id_sample"),
      });
    }
    const exp = latestFutureExpiration(idDoc.text, params.now);
    if (!exp) {
      issues.push({
        code: "id_expiry_unknown",
        message:
          "No se detectó fecha de vencimiento clara en el ID. Confirma que esté vigente y legible.",
        severity: "warning",
        doc_key: "id_document",
      });
    } else if (exp <= params.now) {
      issues.push({
        code: "id_expired",
        message: "El ID parece vencido según las fechas detectadas.",
        severity: "error",
        doc_key: "id_document",
      });
    }
  }

  const income = byKey.proof_income;
  if (!income) {
    issues.push({
      code: "missing_income",
      message: "Falta comprobante de ingresos.",
      severity: "error",
      doc_key: "proof_income",
      example_url: example("snap_income_sample"),
    });
  } else {
    if (income.quality_score != null && income.quality_score < QUALITY_MIN) {
      issues.push({
        code: "blurry_income",
        message: `Comprobante de ingresos de baja calidad (${income.quality_score}%).`,
        severity: "error",
        doc_key: "proof_income",
      });
    }
    const dates = extractDates(income.text);
    const cutoff = new Date(params.now);
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const recent = dates.some((d) => d >= cutoff && d <= params.now);
    if (!recent && dates.length === 0) {
      issues.push({
        code: "income_date_unknown",
        message:
          "No se encontró fecha reciente en el comprobante de ingresos. Se requiere típicamente de los últimos 30 días.",
        severity: "warning",
        doc_key: "proof_income",
      });
    } else if (!recent) {
      issues.push({
        code: "income_stale",
        message: "Las fechas del comprobante de ingresos podrían ser mayores a 30 días.",
        severity: "error",
        doc_key: "proof_income",
      });
    }
  }

  const residence = byKey.proof_residence;
  if (!residence) {
    issues.push({
      code: "missing_residence",
      message: "Falta comprobante de domicilio.",
      severity: "error",
      doc_key: "proof_residence",
      example_url: example("snap_residence_sample"),
    });
  } else {
    if (residence.quality_score != null && residence.quality_score < QUALITY_MIN) {
      issues.push({
        code: "blurry_residence",
        message: `Comprobante de domicilio de baja calidad (${residence.quality_score}%).`,
        severity: "error",
        doc_key: "proof_residence",
      });
    }
    const expect = params.residenceAddress?.trim();
    if (expect) {
      const nExpect = normalizeAddr(expect);
      const nText = normalizeAddr(residence.text);
      const tokens = nExpect.split(" ").filter((x) => x.length > 2);
      const matchRatio = tokens.filter((t) => nText.includes(t)).length / Math.max(tokens.length, 1);
      if (matchRatio < 0.4) {
        issues.push({
          code: "address_mismatch",
          message:
            "La dirección del comprobante no coincide claramente con la dirección declarada en el formulario.",
          severity: "error",
          doc_key: "proof_residence",
        });
      }
    }
  }

  const anyText = params.extractions.map((e) => e.text).join("\n");
  const ssn = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/.test(anyText) || /\bitin\b/i.test(anyText);
  if (!ssn) {
    issues.push({
      code: "ssn_itin_not_visible",
      message:
        "No se detectó SSN ni ITIN legible en los documentos. Verifica que aparezca donde corresponda.",
      severity: "warning",
      example_url: example("snap_ssn_redaction_sample"),
    });
  }

  return issues;
}

export function validateDacaItin(params: {
  extractions: DocumentExtraction[];
  now: Date;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byKey = Object.fromEntries(params.extractions.map((e) => [e.doc_key, e]));

  const passport = byKey.passport;
  if (!passport) {
    issues.push({
      code: "missing_passport",
      message: "Falta pasaporte o documento equivalente.",
      severity: "error",
      doc_key: "passport",
      example_url: example("daca_passport_sample"),
    });
  } else {
    if (passport.quality_score != null && passport.quality_score < QUALITY_MIN) {
      issues.push({
        code: "blurry_passport",
        message: `Pasaporte borroso (calidad ${passport.quality_score}%).`,
        severity: "error",
        doc_key: "passport",
      });
    }
    const exp = latestFutureExpiration(passport.text, params.now);
    if (!exp) {
      issues.push({
        code: "passport_expiry_unknown",
        message: "No se confirmó vigencia del pasaporte por OCR.",
        severity: "warning",
        doc_key: "passport",
      });
    } else if (exp <= params.now) {
      issues.push({
        code: "passport_expired",
        message: "El pasaporte podría estar vencido según fechas detectadas.",
        severity: "error",
        doc_key: "passport",
      });
    }
  }

  const i94 = byKey.i94;
  if (!i94) {
    issues.push({
      code: "missing_i94",
      message: "No se encontró I-94 o archivo vacío.",
      severity: "error",
      doc_key: "i94",
      example_url: example("daca_i94_sample"),
    });
  } else {
    const t = i94.text;
    if (!/i[-\s]?94|cbp|arrival|admission/i.test(t)) {
      issues.push({
        code: "i94_keywords_missing",
        message:
          "El documento no parece un I-94 (no se detectaron marcas típicas). Sube la captura oficial.",
        severity: "warning",
        doc_key: "i94",
      });
    }
    if (i94.quality_score != null && i94.quality_score < QUALITY_MIN) {
      issues.push({
        code: "blurry_i94",
        message: `I-94 ilegible (calidad ${i94.quality_score}%).`,
        severity: "error",
        doc_key: "i94",
      });
    }
  }

  const photo = byKey.photo;
  if (!photo) {
    issues.push({
      code: "missing_photo",
      message: "Falta foto tipo pasaporte.",
      severity: "error",
      doc_key: "photo",
      example_url: example("daca_photo_sample"),
    });
  } else {
    if (photo.width && photo.height) {
      const minSide = Math.min(photo.width, photo.height);
      if (minSide < 300) {
        issues.push({
          code: "photo_too_small",
          message: `La foto es muy pequeña (${photo.width}×${photo.height}px). Sube al menos ~600×600 recomendado.`,
          severity: "error",
          doc_key: "photo",
        });
      }
    }
    if (photo.quality_score != null && photo.quality_score < QUALITY_MIN) {
      issues.push({
        code: "blurry_photo",
        message: `Foto borrosa (calidad ${photo.quality_score}%).`,
        severity: "error",
        doc_key: "photo",
      });
    }
  }

  issues.push({
    code: "signatures_manual_review",
    message:
      "Verificación de firmas en todas las páginas: requiere revisión humana (no automatizable con precisión).",
    severity: "warning",
    example_url: example("daca_signature_sample"),
  });

  return issues;
}

export function summarizeOverall(issues: ValidationIssue[]): "pass" | "fail" | "needs_human_review" {
  const hasError = issues.some((i) => i.severity === "error");
  if (hasError) return "fail";
  const hasWarning = issues.some((i) => i.severity === "warning");
  if (hasWarning) return "needs_human_review";
  return "pass";
}

// ── Motor declarativo (patrones OCR + reglas por trámite) ─────────────────
// Complementa validateSnapMedicaid / validateDacaItin; útil para UI o pipelines alternativos.

export type ValidationResult = {
  passed: boolean;
  /** 0–1 */
  confidence: number;
  errors: string[];
  warnings: string[];
  extractedFields: Record<string, string | null>;
};

export type FunnelRules = {
  requiredDocuments: string[];
  requiredFields: Record<string, { pattern: RegExp; label: string }>;
  optionalFields: Record<string, { pattern: RegExp; label: string }>;
  businessRules: (
    text: string,
    fields: Record<string, string | null>,
  ) => { errors: string[]; warnings: string[] };
};

const CURRENT_YEAR = new Date().getUTCFullYear();

export const FUNNEL_RULES: Record<string, FunnelRules> = {
  snap_medicaid: {
    requiredDocuments: ["id_document", "proof_income", "proof_residence"],
    requiredFields: {
      ssn: { pattern: HAZLO_PATTERNS.ssn, label: "SSN válido" },
      date_of_birth: { pattern: HAZLO_PATTERNS.date_of_birth, label: "Fecha de nacimiento" },
      full_name: { pattern: HAZLO_PATTERNS.full_name, label: "Nombre completo" },
    },
    optionalFields: {
      phone: { pattern: HAZLO_PATTERNS.phone, label: "Teléfono" },
      address: { pattern: HAZLO_PATTERNS.address, label: "Dirección" },
    },
    businessRules: (_text, fields) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      if (fields.date_of_birth) {
        const parts = fields.date_of_birth.split(/[\/\-]/);
        const yRaw = parts[parts.length - 1] ?? "0";
        let year = parseInt(yRaw, 10);
        if (!Number.isFinite(year)) year = 0;
        if (year < 100) year += 2000;
        if (year < 1900 || year > CURRENT_YEAR) {
          warnings.push("Fecha de nacimiento parece inválida");
        }
      }
      return { errors, warnings };
    },
  },

  daca_itin: {
    requiredDocuments: ["passport", "i94", "photo"],
    requiredFields: {
      alien_number: { pattern: HAZLO_PATTERNS.alien_number, label: "Número de extranjero (A-Number)" },
      passport_number: { pattern: HAZLO_PATTERNS.passport_number, label: "Número de pasaporte" },
      full_name: { pattern: HAZLO_PATTERNS.full_name, label: "Nombre completo" },
    },
    optionalFields: {
      i94_number: { pattern: HAZLO_PATTERNS.i94_number, label: "Número I-94" },
      date_of_birth: { pattern: HAZLO_PATTERNS.date_of_birth, label: "Fecha de nacimiento" },
    },
    businessRules: (_text, fields) => {
      const errors: string[] = [];
      if (fields.alien_number && !/^A\d{8,9}$/i.test(fields.alien_number)) {
        errors.push("Formato de A-Number inválido (debe ser A########)");
      }
      if (fields.passport_number && !/^[A-Z0-9]{6,9}$/i.test(fields.passport_number)) {
        errors.push("Formato de pasaporte parece inválido");
      }
      return { errors, warnings: [] };
    },
  },

  taxes: {
    requiredDocuments: ["w2", "id_document", "ssn"],
    requiredFields: {
      ssn: { pattern: HAZLO_PATTERNS.ssn, label: "SSN o ITIN" },
      full_name: { pattern: HAZLO_PATTERNS.full_name, label: "Nombre del contribuyente" },
      employer_ein: { pattern: /\b\d{2}-\d{7}\b/, label: "EIN del empleador (W-2)" },
    },
    optionalFields: {
      address: { pattern: HAZLO_PATTERNS.address, label: "Dirección" },
      wages: { pattern: /\$?[\d,]+\.?\d*/, label: "Salarios reportados" },
    },
    businessRules: (_text, fields) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!fields.wages) warnings.push("No se detectaron montos de salario en W-2");
      return { errors, warnings };
    },
  },

  default: {
    requiredDocuments: ["id_document", "proof_residence"],
    requiredFields: {
      full_name: { pattern: HAZLO_PATTERNS.full_name, label: "Nombre completo" },
      address: { pattern: HAZLO_PATTERNS.address, label: "Dirección" },
    },
    optionalFields: {
      phone: { pattern: HAZLO_PATTERNS.phone, label: "Teléfono" },
      date_of_birth: { pattern: HAZLO_PATTERNS.date_of_birth, label: "Fecha de nacimiento" },
    },
    businessRules: () => ({ errors: [], warnings: [] }),
  },
};

/**
 * `uploadedDocuments`: rutas parciales o claves (p. ej. valores de `document_paths` o nombres que contengan el id del doc).
 * No sustituye la validación por extracciones del pipeline principal (`validateSnapMedicaid` / `validateDacaItin`).
 */
export function validateSubmission(
  funnelType: string,
  extractedText: ExtractedText,
  uploadedDocuments: string[],
): ValidationResult {
  const rules = FUNNEL_RULES[funnelType] ?? FUNNEL_RULES.default;
  const errors: string[] = [];
  const warnings: string[] = [];
  const extractedFields: Record<string, string | null> = {};

  for (const doc of rules.requiredDocuments) {
    if (!uploadedDocuments.some((name) => name.toLowerCase().includes(doc.toLowerCase()))) {
      errors.push(`Documento requerido faltante: ${doc}`);
    }
  }

  for (const [field, { pattern, label }] of Object.entries(rules.requiredFields)) {
    const result = findPatterns(extractedText.raw, { [field]: pattern });
    extractedFields[field] = result[field] ?? null;
    if (!result[field]) errors.push(`Campo requerido no detectado: ${label}`);
  }

  for (const [field, { pattern, label }] of Object.entries(rules.optionalFields)) {
    const result = findPatterns(extractedText.raw, { [field]: pattern });
    extractedFields[field] = result[field] ?? null;
    if (!result[field]) warnings.push(`Campo opcional no detectado: ${label}`);
  }

  const businessResult = rules.businessRules(extractedText.raw, extractedFields);
  errors.push(...businessResult.errors);
  warnings.push(...businessResult.warnings);

  const nDoc = rules.requiredDocuments.length;
  const nField = Object.keys(rules.requiredFields).length;
  const totalSlots = nDoc + nField;
  const docFails = rules.requiredDocuments.filter(
    (doc) => !uploadedDocuments.some((name) => name.toLowerCase().includes(doc.toLowerCase())),
  ).length;
  const fieldFails = Object.keys(rules.requiredFields).filter((k) => !extractedFields[k]).length;
  const baseRatio = totalSlots > 0 ? (totalSlots - docFails - fieldFails) / totalSlots : 1;
  let confidence = Math.max(0, Math.min(1, baseRatio));
  confidence -= businessResult.errors.length * 0.12;
  confidence -= businessResult.warnings.length * 0.04;
  confidence -= warnings.filter((w) => w.startsWith("Campo opcional")).length * 0.02;
  confidence = Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;

  return {
    passed: errors.length === 0 && confidence >= 0.85,
    confidence,
    errors,
    warnings,
    extractedFields,
  };
}
