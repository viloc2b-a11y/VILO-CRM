import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";
import { buildExtraction, downloadDocument } from "@/lib/hazlo/validator/extract";
import { notifyHazloValidationFeedback } from "@/lib/hazlo/validator/notify";
import {
  summarizeOverall,
  validateDacaItin,
  validateSnapMedicaid,
} from "@/lib/hazlo/validator/rules";
import type {
  HazloFunnelType,
  ValidationReportV1,
} from "@/lib/hazlo/validator/types";

const BORDERLINE_SOURCE = "hazlo:validator:borderline";

/** Media de quality_scores (0–100) → 0–1; si no hay scores, heurística por `overall`. */
function validationConfidenceFromReport(report: ValidationReportV1): number {
  const scores = Object.values(report.quality_scores).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (scores.length === 0) {
    if (report.overall === "pass") return 1;
    if (report.overall === "needs_human_review") return 0.72;
    return 0.35;
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.min(1, Math.max(0, avg / 100));
}

function validationErrorsFromReport(report: ValidationReportV1): string[] | null {
  const msgs = report.issues.map((i) => `${i.code}: ${i.message}`.slice(0, 500));
  return msgs.length > 0 ? msgs : null;
}

function extractedDataFromReport(report: ValidationReportV1): Json {
  const o: Record<string, unknown> = {};
  for (const e of report.extractions) {
    o[e.doc_key] = { quality_score: e.quality_score, width: e.width, height: e.height };
  }
  return o as unknown as Json;
}

type SubmissionRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  funnel_type: string;
  completion_status: string;
  residence_address: string | null;
  document_paths: Json;
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

async function storageDownload(bucket: string, path: string): Promise<ArrayBuffer | null> {
  const { data, error } = await serviceClient.storage.from(bucket).download(path);
  if (error || !data) return null;
  return data.arrayBuffer();
}

async function ensureBorderlineTask(submissionId: string, title: string): Promise<void> {
  const { data: existing } = await serviceClient
    .from("action_items")
    .select("id")
    .eq("record_id", submissionId)
    .eq("record_type", "submission")
    .eq("source", BORDERLINE_SOURCE)
    .maybeSingle();
  if (existing) return;

  await serviceClient.from("action_items").insert({
    business_unit: "hazloasiya",
    record_type: "submission",
    record_id: submissionId,
    title,
    status: "pending",
    next_action: title,
    due_date: new Date(Date.now() + 24 * 3600000).toISOString(),
    priority: "high",
    source: BORDERLINE_SOURCE,
    notes: "Validator Agent — caso borderline (revisión humana)",
  });
}

export async function runHazloValidatorForSubmission(submissionId: string): Promise<{
  ok: boolean;
  report?: ValidationReportV1;
  error?: string;
}> {
  const { data: row, error: fetchErr } = await serviceClient
    .from("submissions")
    .select("id, name, email, phone, funnel_type, completion_status, residence_address, document_paths")
    .eq("id", submissionId)
    .eq("archived", false)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: "submission_not_found" };

  const sub = row as SubmissionRow;
  if (sub.completion_status !== "Funnel completed") {
    return { ok: false, error: "not_funnel_completed" };
  }

  const funnel = sub.funnel_type as HazloFunnelType;
  if (funnel !== "snap_medicaid" && funnel !== "daca_itin") {
    return { ok: false, error: "unknown_funnel" };
  }

  const paths = flattenDocPaths(asPathMap(sub.document_paths));
  if (paths.length === 0) {
    const report: ValidationReportV1 = {
      version: 1,
      ran_at: new Date().toISOString(),
      funnel_type: funnel,
      overall: "fail",
      quality_scores: {},
      issues: [
        {
          code: "no_documents",
          message: "No hay rutas de documentos en document_paths.",
          severity: "error",
        },
      ],
      extractions: [],
    };
    await serviceClient
      .from("submissions")
      .update({
        validation_report: report as unknown as Json,
        validation_ran_at: report.ran_at,
        validation_confidence: validationConfidenceFromReport(report),
        validation_errors: validationErrorsFromReport(report),
        extracted_data: extractedDataFromReport(report),
        completion_status: "Missing documents",
      })
      .eq("id", submissionId)
      .eq("completion_status", "Funnel completed");

    await notifyHazloValidationFeedback({
      name: sub.name,
      email: sub.email,
      phone: sub.phone,
      overall: report.overall,
      issues: report.issues,
    });
    return { ok: true, report };
  }

  const extractions = [];
  for (const { key, path: storagePath } of paths) {
    const dl = await downloadDocument(storageDownload, storagePath);
    if (!dl) {
      extractions.push({
        doc_key: key,
        path: storagePath,
        mime: "",
        text: "",
        quality_score: null,
      });
      continue;
    }
    const ex = await buildExtraction(key, storagePath, dl.buffer, dl.mime);
    extractions.push(ex);
  }

  const now = new Date();
  const issues =
    funnel === "snap_medicaid"
      ? validateSnapMedicaid({
          extractions,
          residenceAddress: sub.residence_address,
          now,
        })
      : validateDacaItin({ extractions, now });

  for (const { key, path: storagePath } of paths) {
    const ex = extractions.find((e) => e.doc_key === key && e.path === storagePath);
    if (!ex || !ex.mime) {
      issues.push({
        code: "file_not_found",
        message: `No se pudo descargar el documento (${key}) desde almacenamiento.`,
        severity: "error",
        doc_key: key,
      });
      continue;
    }
    if (ex.mime === "application/pdf" && !ex.text.trim()) {
      issues.push({
        code: "pdf_no_text_layer",
        message: `El PDF (${key}) no tiene texto seleccionable; si es escaneado, puede requerir revisión manual.`,
        severity: "warning",
        doc_key: key,
      });
    }
    if (ex.mime.startsWith("image/") && !ex.text.trim()) {
      issues.push({
        code: "ocr_empty",
        message: `No se extrajo texto de la imagen (${key}). Mejor luz, enfoque o sube un archivo más nítido.`,
        severity: "error",
        doc_key: key,
      });
    }
  }

  const overall = summarizeOverall(issues);
  const quality_scores: Record<string, number | null> = {};
  for (const e of extractions) {
    quality_scores[e.doc_key] = e.quality_score;
  }

  const report: ValidationReportV1 = {
    version: 1,
    ran_at: now.toISOString(),
    funnel_type: funnel,
    overall,
    quality_scores,
    issues,
    extractions: extractions.map((e) => ({
      doc_key: e.doc_key,
      quality_score: e.quality_score,
      width: e.width,
      height: e.height,
    })),
  };

  const nextStatus = overall === "fail" ? "Missing documents" : "Ready for review";

  const { error: upErr } = await serviceClient
    .from("submissions")
    .update({
      validation_report: report as unknown as Json,
      validation_ran_at: report.ran_at,
      validation_confidence: validationConfidenceFromReport(report),
      validation_errors: validationErrorsFromReport(report),
      extracted_data: extractedDataFromReport(report),
      completion_status: nextStatus,
    })
    .eq("id", submissionId)
    .eq("completion_status", "Funnel completed");

  if (upErr) return { ok: false, error: upErr.message };

  await notifyHazloValidationFeedback({
    name: sub.name,
    email: sub.email,
    phone: sub.phone,
    overall,
    issues,
  });

  if (overall === "needs_human_review") {
    await ensureBorderlineTask(
      submissionId,
      `Revisión humana borderline — ${sub.name} (${sub.id.slice(0, 8)})`
    );
  }

  return { ok: true, report };
}

export async function runHazloValidatorTick(limit = 5): Promise<{
  ok: boolean;
  processed: string[];
  errors: string[];
}> {
  const processed: string[] = [];
  const errors: string[] = [];

  const { data: rows, error } = await serviceClient
    .from("submissions")
    .select("id")
    .eq("archived", false)
    .eq("completion_status", "Funnel completed")
    .is("validation_ran_at", null)
    .limit(limit);

  if (error) {
    return { ok: false, processed, errors: [error.message] };
  }

  for (const r of rows ?? []) {
    const res = await runHazloValidatorForSubmission(r.id as string);
    if (res.ok) processed.push(r.id as string);
    else errors.push(`${r.id}: ${res.error ?? "unknown"}`);
  }

  return { ok: errors.length === 0 || processed.length > 0, processed, errors };
}
