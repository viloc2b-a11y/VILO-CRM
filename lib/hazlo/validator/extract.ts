import sharp from "sharp";
import type { DocumentExtraction } from "@/lib/hazlo/validator/types";

const BUCKET = "hazlo-docs";

function extMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function loadPdfParse(): Promise<(b: Buffer) => Promise<{ text?: string }>> {
  const mod = await import("pdf-parse");
  const fn = (mod as { default?: (b: Buffer) => Promise<{ text?: string }> }).default;
  if (typeof fn === "function") return fn;
  return mod as unknown as (b: Buffer) => Promise<{ text?: string }>;
}

export async function downloadDocument(
  download: (bucket: string, path: string) => Promise<ArrayBuffer | null>,
  storagePath: string
): Promise<{ buffer: Buffer; mime: string } | null> {
  const buf = await download(BUCKET, storagePath);
  if (!buf || buf.byteLength === 0) return null;
  return { buffer: Buffer.from(buf), mime: extMime(storagePath) };
}

/** Contraste aproximado (0–100): valores bajos sugieren desenfoque o baja resolución. */
export async function imageQualityScore(buffer: Buffer): Promise<number> {
  try {
    const imageStats = await sharp(buffer).rotate().grayscale().stats();
    const stdev = imageStats.channels[0]?.stdev ?? 0;
    return Math.min(100, Math.max(0, Math.round((stdev / 38) * 100)));
  } catch {
    return 50;
  }
}

export async function imageDimensions(
  buffer: Buffer
): Promise<{ width: number; height: number } | null> {
  try {
    const m = await sharp(buffer).metadata();
    if (m.width && m.height) return { width: m.width, height: m.height };
    return null;
  } catch {
    return null;
  }
}

export async function extractPdfWithMeta(
  buffer: Buffer,
): Promise<{ text: string; numpages: number }> {
  try {
    const pdfParse = await loadPdfParse();
    const data = await pdfParse(buffer);
    const numpages =
      typeof (data as { numpages?: number }).numpages === "number"
        ? (data as { numpages: number }).numpages
        : 1;
    return { text: (data.text ?? "").trim(), numpages };
  } catch {
    return { text: "", numpages: 0 };
  }
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { text } = await extractPdfWithMeta(buffer);
  return text;
}

/** @param langs Códigos Tesseract (p. ej. `spa`, `eng`). */
export async function extractTextFromImage(
  buffer: Buffer,
  langs: string[] = ["spa", "eng"],
): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(langs);
    const {
      data: { text },
    } = await worker.recognize(buffer);
    await worker.terminate();
    return (text ?? "").trim();
  } catch {
    return "";
  }
}

export async function buildExtraction(
  docKey: string,
  storagePath: string,
  buffer: Buffer,
  mime: string
): Promise<DocumentExtraction> {
  let text = "";
  let quality: number | null = null;
  let width: number | undefined;
  let height: number | undefined;

  if (mime === "application/pdf") {
    text = await extractTextFromPdf(buffer);
  } else if (mime.startsWith("image/")) {
    quality = await imageQualityScore(buffer);
    const dim = await imageDimensions(buffer);
    if (dim) {
      width = dim.width;
      height = dim.height;
    }
    text = await extractTextFromImage(buffer, ["spa", "eng"]);
  }

  return {
    doc_key: docKey,
    path: storagePath,
    mime,
    text: text.toLowerCase(),
    quality_score: quality,
    width,
    height,
  };
}
