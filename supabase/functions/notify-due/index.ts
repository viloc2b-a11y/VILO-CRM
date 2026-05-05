/**
 * Edge Function: recordatorios de action_items con due_date vencida.
 *
 * - No marca `status = overdue` en BD: en VILO CRM "vencida" se deriva en UI
 *   (pending/in_progress + due_date &lt; ahora).
 * - Solo lista ítems abiertos con fecha límite ya pasada y envía un resumen por Resend.
 *
 * Invocación: cron (Supabase Scheduler u otro) con header `x-cron-secret` = CRON_SECRET.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, OPS_EMAIL,
 *          RESEND_FROM (ej. "ViloOS <notify@tudominio.com>"), APP_URL (base del CRM),
 *          CRON_SECRET (opcional; si falta, no se valida — solo para dev local).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";

type ActionItemRow = {
  id: string;
  title: string;
  business_unit: string;
  next_action: string | null;
  value_usd: string | number | null;
  due_date: string | null;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const opsEmail = Deno.env.get("OPS_EMAIL");
    const from = Deno.env.get("RESEND_FROM") ?? "Vilo CRM <onboarding@resend.dev>";
    const appUrl = (Deno.env.get("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");

    if (!resendKey || !supabaseUrl || !serviceKey || !opsEmail) {
      return new Response(
        JSON.stringify({
          error: "Missing env: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPS_EMAIL",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const nowIso = new Date().toISOString();
    const select = "id,title,business_unit,next_action,value_usd,due_date";
    const query = [
      `select=${encodeURIComponent(select)}`,
      `status=in.(pending,in_progress)`,
      `due_date=not.is.null`,
      `due_date=lte.${encodeURIComponent(nowIso)}`,
      "order=due_date.asc",
    ].join("&");

    const listRes = await fetch(`${supabaseUrl}/rest/v1/action_items?${query}`, {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      return new Response(
        JSON.stringify({ error: "Supabase list failed", detail: errText }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const tasks = (await listRes.json()) as ActionItemRow[];
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return new Response(JSON.stringify({ status: "no_tasks" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(resendKey);
    const rowsHtml = tasks
      .map((t) => {
        const bu = esc(String(t.business_unit).replace(/_/g, " "));
        const title = esc(t.title);
        const next = esc(t.next_action ?? "Sin acción");
        const val =
          t.value_usd != null && t.value_usd !== ""
            ? esc(`$${Number(t.value_usd).toLocaleString("es-US")}`)
            : "—";
        return `<tr><td>${bu}</td><td>${title}</td><td>${next}</td><td>${val}</td></tr>`;
      })
      .join("");

    const { error: sendErr } = await resend.emails.send({
      from,
      to: [opsEmail],
      subject: `🔴 ${tasks.length} acción(es) vencida(s) — Action Center`,
      html: `
        <h2>Resumen de acciones vencidas</h2>
        <p>Fecha de corte (UTC): ${esc(nowIso)}</p>
        <table border="1" cellpadding="8" style="border-collapse:collapse;">
          <tr><th>UE</th><th>Tarea</th><th>Siguiente acción</th><th>Valor</th></tr>
          ${rowsHtml}
        </table>
        <p><a href="${appUrl}/action-center">Abrir Action Center</a></p>
      `,
    });

    if (sendErr) {
      return new Response(JSON.stringify({ error: String(sendErr) }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: "sent", count: tasks.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
