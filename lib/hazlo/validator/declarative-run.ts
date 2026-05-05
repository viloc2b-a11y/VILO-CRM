/**
 * Validación declarativa (FUNNEL_RULES + validateSubmission + OCR).
 * Alternativa experimental al pipeline en {@link ./run.ts} (extracciones + validateSnapMedicaid / validateDacaItin).
 * Usa **service role**; no uses `createClient` con cookies en cron.
 */
import { extractTextFromImage, extractTextFromPDF, type ExtractedText } from "@/lib/hazlo/validator/ocr";
import { validateSubmission, type ValidationResult } from "@/lib/hazlo/validator/rules";
import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";

const BUCKET = "hazlo-docs";

export type DeclarativeValidationJob = {
  submissionId: string;
  funnelType: string;
  userId: string | null;
  /** Pares doc_key + ruta en bucket (como en `document_paths`). */
  documentEntries: { key: string; path: string }[];
};

function asPathMap(raw: Json): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function flattenDocPaths(raw: Record<string, unknown>): { key: string; path: string }[] {
  const out: { key: string; path: string }[] = [];
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === "string" && val.trim()) {
      out.push({ key, path: val.trim() });
      continue;
    }
    if (Array.isArray(val)) {
      const strs = val.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      if (key === "photos" && strs[0]) {
        out.push({ key: "photo", path: strs[0].trim() });
      } else {
        strs.forEach((p, i) => {
          out.push({ key: strs.length > 1 ? `${key}_${i}` : key, path: p.trim() });
        });
      }
    }
  }
  return out;
}

function extKind(path: string): "pdf" | "image" | "other" {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) {
    return "image";
  }
  return "other";
}

function mergeDeclarativeReport(existing: Json | null, patch: Record<string, unknown>): Json {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  base.declarative = {
    ...patch,
    at: new Date().toISOString(),
  };
  return base as unknown as Json;
}

/**
 * Descarga rutas del bucket, concatena OCR y ejecuta {@link validateSubmission}.
 */
export async function validateSubmissionDocumentsDeclarative(
  job: DeclarativeValidationJob,
): Promise<ValidationResult> {
  const { funnelType, documentEntries } = job;
  if (documentEntries.length === 0) {
    return validateSubmission(
      funnelType,
      {
        raw: "",
        lines: [],
        metadata: { pageCount: 0, fileSize: 0, extractedAt: new Date().toISOString() },
      },
      [],
    );
  }

  const buffers: Buffer[] = [];
  const uploadedHints: string[] = [];

  for (const { key, path } of documentEntries) {
    uploadedHints.push(key, path, path.split("/").pop() ?? path);
    const { data, error } = await serviceClient.storage.from(BUCKET).download(path);
    if (error || !data) {
      throw new Error(`No se pudo descargar ${path}: ${error?.message ?? "unknown"}`);
    }
    const ab = await data.arrayBuffer();
    buffers.push(Buffer.from(ab));
  }

  let fullText = "";
  let totalPages = 0;
  let totalSize = 0;

  for (let i = 0; i < documentEntries.length; i++) {
    const { path } = documentEntries[i]!;
    const buffer = buffers[i]!;
    totalSize += buffer.length;
    const baseName = path.split("/").pop() ?? path;
    const kind = extKind(baseName);

    let extracted: ExtractedText;
    if (kind === "pdf") {
      extracted = await extractTextFromPDF(buffer);
    } else if (kind === "image") {
      extracted = await extractTextFromImage(buffer, "spa");
    } else {
      extracted = {
        raw: "",
        lines: [],
        metadata: { pageCount: 0, fileSize: buffer.length, extractedAt: new Date().toISOString() },
      };
    }
    totalPages += extracted.metadata.pageCount;
    fullText += `\n--- ${baseName} ---\n${extracted.raw}`;
  }

  const raw = fullText.trim();
  const extractedText: ExtractedText = {
    raw,
    lines: raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    metadata: {
      pageCount: Math.max(totalPages, documentEntries.length),
      fileSize: totalSize,
      extractedAt: new Date().toISOString(),
    },
  };

  return validateSubmission(funnelType, extractedText, uploadedHints);
}

function jobFromRow(row: {
  id: string;
  funnel_type: string;
  user_id: string | null;
  document_paths: Json;
}): DeclarativeValidationJob {
  const entries = flattenDocPaths(asPathMap(row.document_paths));
  return {
    submissionId: row.id,
    funnelType: row.funnel_type,
    userId: row.user_id,
    documentEntries: entries,
  };
}

/**
 * Misma elegibilidad que {@link runHazloValidatorTick}: no mezclar ambos crons sin criterio distinto.
 */
export async function runDeclarativeValidatorTick(limit = 10): Promise<{
  ok: boolean;
  processed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processed = 0;

  const { data: rows, error } = await serviceClient
    .from("submissions")
    .select("id, funnel_type, user_id, document_paths, validation_report")
    .eq("archived", false)
    .eq("completion_status", "Funnel completed")
    .is("validation_ran_at", null)
    .limit(limit);

  if (error) {
    return { ok: false, processed: 0, errors: [error.message] };
  }

  for (const r of rows ?? []) {
    const id = r.id as string;
    try {
      const job = jobFromRow({
        id,
        funnel_type: r.funnel_type as string,
        user_id: (r.user_id as string | null) ?? null,
        document_paths: r.document_paths as Json,
      });
      const result = await validateSubmissionDocumentsDeclarative(job);

      const { error: upErr } = await serviceClient
        .from("submissions")
        .update({
          validation_confidence: result.confidence,
          validation_errors: result.errors.length > 0 ? result.errors : null,
          extracted_data: result.extractedFields as unknown as Json,
          validation_ran_at: new Date().toISOString(),
          needs_manual_review: !result.passed,
          validation_report: mergeDeclarativeReport(r.validation_report as Json | null, {
            passed: result.passed,
            confidence: result.confidence,
            errors: result.errors,
            warnings: result.warnings,
            extracted_fields: result.extractedFields,
          }),
        })
        .eq("id", id)
        .eq("completion_status", "Funnel completed");

      if (upErr) throw new Error(upErr.message);
      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${id}: ${msg}`);
      await serviceClient
        .from("submissions")
        .update({
          validation_report: mergeDeclarativeReport((r as { validation_report?: Json }).validation_report ?? null, {
            error: msg,
          }),
        })
        .eq("id", id);
    }
  }

  return { ok: errors.length === 0 || processed > 0, processed, errors };
}

export async function runDeclarativeValidatorForSubmission(submissionId: string): Promise<{
  ok: boolean;
  result?: ValidationResult;
  error?: string;
}> {
  const { data: row, error } = await serviceClient
    .from("submissions")
    .select("id, funnel_type, user_id, document_paths, validation_report, completion_status")
    .eq("id", submissionId)
    .eq("archived", false)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "not_found" };

  try {
    const job = jobFromRow({
      id: row.id as string,
      funnel_type: row.funnel_type as string,
      user_id: (row.user_id as string | null) ?? null,
      document_paths: row.document_paths as Json,
    });
    const result = await validateSubmissionDocumentsDeclarative(job);

    const { error: upErr } = await serviceClient
      .from("submissions")
      .update({
        validation_confidence: result.confidence,
        validation_errors: result.errors.length > 0 ? result.errors : null,
        extracted_data: result.extractedFields as unknown as Json,
        validation_ran_at: new Date().toISOString(),
        needs_manual_review: !result.passed,
        validation_report: mergeDeclarativeReport(row.validation_report as Json | null, {
          passed: result.passed,
          confidence: result.confidence,
          errors: result.errors,
          warnings: result.warnings,
          extracted_fields: result.extractedFields,
        }),
      })
      .eq("id", submissionId);

    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await serviceClient
      .from("submissions")
      .update({
        validation_report: mergeDeclarativeReport(row.validation_report as Json | null, { error: msg }),
      })
      .eq("id", submissionId);
    return { ok: false, error: msg };
  }
}
