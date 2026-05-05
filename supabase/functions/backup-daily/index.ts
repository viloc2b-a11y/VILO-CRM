/**
 * Edge Function: backup diario a Storage (CSV).
 *
 * - Usa solo SERVICE_ROLE en servidor (nunca en el frontend).
 * - Tablas alineadas al esquema VILO CRM (`vilo_opportunities`, `patient_leads`, no `opportunities`/`patients`).
 * - `submissions` (Hazlo) se omite silenciosamente si la tabla no existe.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (inyectados por Supabase).
 * Opcional: CRON_SECRET — si está definido, exige header `x-cron-secret` en GET/POST.
 *
 * Bucket: crear `backups` (privado) en Dashboard → Storage. El service role puede
 * subir/listar/borrar sin políticas públicas.
 *
 * Programar: Supabase → Edge Functions → Schedules (ej. 2:00 UTC) o cron externo.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type JsonRow = Record<string, unknown>;

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function cellString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function toCSV(data: JsonRow[]): string {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(",");
  const rows = data.map((row) =>
    headers.map((h) => escapeCsvCell(cellString(row[h]))).join(","),
  );
  return [headerLine, ...rows].join("\n");
}

/** Tablas core del CRM (01_schema + 06). */
const CORE_TABLES = [
  "action_items",
  "vilo_opportunities",
  "patient_leads",
  "tasks",
] as const;

/** Opcional: Hazlo — puede no existir en todos los entornos. */
const OPTIONAL_TABLES = ["submissions"] as const;

const RETENTION_DAYS = 30;
const LIST_PAGE = 1000;

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const sent = req.headers.get("x-cron-secret");
    if (sent !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const csvParts: string[] = [];
  const skipped: string[] = [];
  const errors: { table: string; message: string }[] = [];

  for (const table of CORE_TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      errors.push({ table, message: error.message });
      continue;
    }
    const rows = (data ?? []) as JsonRow[];
    csvParts.push(`--- ${table} (${rows.length} registros) ---\n${toCSV(rows)}`);
  }

  for (const table of OPTIONAL_TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      skipped.push(`${table}: ${error.message}`);
      continue;
    }
    const rows = (data ?? []) as JsonRow[];
    csvParts.push(`--- ${table} (${rows.length} registros) ---\n${toCSV(rows)}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `viloos_backup_${stamp}.csv`;
  const payload = "\ufeff" + csvParts.join("\n\n");

  if (csvParts.length === 0) {
    return new Response(
      JSON.stringify({
        error: "No se exportó ninguna tabla (revisá errores y nombres de tablas).",
        errors,
        skipped,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const { error: uploadErr } = await supabase.storage.from("backups").upload(fileName, payload, {
    contentType: "text/csv; charset=utf-8",
    upsert: false,
  });

  if (uploadErr) {
    return new Response(JSON.stringify({ error: uploadErr.message, errors, skipped }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);

  const toRemove: string[] = [];
  let offset = 0;
  for (;;) {
    const { data: files, error: listErr } = await supabase.storage.from("backups").list("", {
      limit: LIST_PAGE,
      offset,
    });
    if (listErr) {
      break;
    }
    if (!files?.length) break;
    for (const f of files) {
      if (!f.name) continue;
      const created = f.created_at ? new Date(f.created_at) : null;
      if (created && created < cutoff) {
        toRemove.push(f.name);
      }
    }
    if (files.length < LIST_PAGE) break;
    offset += LIST_PAGE;
  }

  if (toRemove.length) {
    await supabase.storage.from("backups").remove(toRemove);
  }

  return new Response(
    JSON.stringify({
      status: "success",
      file: fileName,
      removed_old_files: toRemove.length,
      errors,
      skipped,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
