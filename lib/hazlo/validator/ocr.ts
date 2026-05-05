/**
 * Utilidades de extracción con metadatos y patrones (HazloAsíYa).
 * La extracción real vive en {@link ./extract.ts} (pdf-parse + tesseract.js).
 */

import { extractPdfWithMeta, extractTextFromImage as extractImageText } from "@/lib/hazlo/validator/extract";

export type ExtractedText = {
  raw: string;
  lines: string[];
  metadata: {
    pageCount: number;
    fileSize: number;
    extractedAt: string;
  };
};

function toExtractedText(
  raw: string,
  pageCount: number,
  fileSize: number,
): ExtractedText {
  const trimmed = raw.trim();
  return {
    raw: trimmed,
    lines: trimmed
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
    metadata: {
      pageCount,
      fileSize,
      extractedAt: new Date().toISOString(),
    },
  };
}

/** Extrae texto de un PDF con conteo de páginas (usa pdf-parse vía `extract.ts`). */
export async function extractTextFromPDF(buffer: Buffer): Promise<ExtractedText> {
  const { text, numpages } = await extractPdfWithMeta(buffer);
  return toExtractedText(text, numpages, buffer.length);
}

/**
 * OCR de imagen con Tesseract (`extract.ts`).
 * `spa` prioriza español + inglés como respaldo; `eng` solo inglés.
 */
export async function extractTextFromImage(
  buffer: Buffer,
  language: "eng" | "spa" = "spa",
): Promise<ExtractedText> {
  const langs = language === "eng" ? (["eng"] as const) : (["spa", "eng"] as const);
  const raw = await extractImageText(buffer, [...langs]);
  return toExtractedText(raw, 1, buffer.length);
}

/** Aplica varias regex; devuelve el primer grupo capturado o el match completo. */
export function findPatterns(text: string, patterns: Record<string, RegExp>): Record<string, string | null> {
  const results: Record<string, string | null> = {};
  for (const [key, regex] of Object.entries(patterns)) {
    const match = text.match(regex);
    results[key] = (match?.[1] ?? match?.[0] ?? null) || null;
  }
  return results;
}

/**
 * Patrones heurísticos para pruebas / exploración; reglas de negocio estrictas siguen en `rules.ts`.
 * Varios son amplios a propósito — validá en contexto (ITIN, direcciones, etc.).
 */
export const HAZLO_PATTERNS = {
  ssn: /\b(\d{3}-\d{2}-\d{4})\b/,
  date_of_birth: /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
  address:
    /(\d+\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct))/i,
  phone: /(\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4})/,
  alien_number: /\b([A-Z]\d{8,9})\b/,
  i94_number: /\b(\d{11})\b/,
  /** Muy permisivo; usar solo como pista. */
  passport_number: /\b([A-Z0-9]{6,9})\b/,
  full_name: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/,
  signature: /(signed|firma|firmado)[\s:]*([A-Z][a-z\s]+)/i,
  date_signed: /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
} as const;
