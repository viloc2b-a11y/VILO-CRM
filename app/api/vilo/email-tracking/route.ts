import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";
import { NextRequest, NextResponse } from "next/server";

/**
 * Webhook Resend → actualiza `communications_log.metadata` y, si hay apertura/clic,
 * refresca `vilo_opportunities` y crea un `action_item` (sin duplicar pendientes).
 *
 * Configuración Resend: URL `POST /api/vilo/email-tracking`.
 * Secreto: **`RESEND_WEBHOOK_SECRET`** en env; cabeceras aceptadas: `x-resend-secret` o `x-webhook-secret`.
 * En el envío (cadencia), guardamos **`metadata.resend_email_id`** al insertar en `communications_log`.
 */
export const dynamic = "force-dynamic";

type ResendEventAction = "delivered" | "opened" | "clicked" | "complained" | "bounced";

const EVENT_MAP: Record<string, { action: ResendEventAction; engage: boolean }> = {
  "email.delivered": { action: "delivered", engage: false },
  "email.opened": { action: "opened", engage: true },
  "email.clicked": { action: "clicked", engage: true },
  "email.complained": { action: "complained", engage: false },
  "email.bounced": { action: "bounced", engage: false },
};

function extractPayload(body: unknown): {
  type?: string;
  created_at?: string;
  email_id?: string;
} {
  if (!body || typeof body !== "object") return {};
  const p = body as Record<string, unknown>;
  const data = p.data;
  const emailIdFromData =
    data && typeof data === "object" && typeof (data as Record<string, unknown>).email_id === "string"
      ? ((data as Record<string, unknown>).email_id as string)
      : undefined;
  const emailId = emailIdFromData ?? (typeof p.email_id === "string" ? p.email_id : undefined);
  return {
    type: typeof p.type === "string" ? p.type : undefined,
    created_at: typeof p.created_at === "string" ? p.created_at : undefined,
    email_id: emailId,
  };
}

function mergeMetadata(
  prev: Record<string, unknown>,
  action: ResendEventAction,
  createdAt: string | undefined,
): Json {
  const opens = Number(prev.opens ?? 0) + (action === "opened" ? 1 : 0);
  const clicks = Number(prev.clicks ?? 0) + (action === "clicked" ? 1 : 0);
  const next: Json = {
    ...prev,
    resend_last_event: action,
    resend_last_event_at: createdAt ?? new Date().toISOString(),
    opens,
    clicks,
    delivery_status: action,
  };
  return next;
}

async function loadCommRowsByResendId(emailId: string) {
  const [a, b] = await Promise.all([
    serviceClient
      .from("communications_log")
      .select("id, metadata, opportunity_id, contact_id")
      .filter("metadata->>resend_email_id", "eq", emailId),
    serviceClient
      .from("communications_log")
      .select("id, metadata, opportunity_id, contact_id")
      .filter("metadata->>email_id", "eq", emailId),
  ]);
  const map = new Map<string, NonNullable<typeof a.data>[number]>();
  for (const r of [...(a.data ?? []), ...(b.data ?? [])]) {
    map.set(r.id, r);
  }
  return [...map.values()];
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET not configured" }, { status: 503 });
  }
  const h1 = req.headers.get("x-resend-secret");
  const h2 = req.headers.get("x-webhook-secret");
  if (h1 !== webhookSecret && h2 !== webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, created_at, email_id: emailId } = extractPayload(body);
  if (!type) {
    return NextResponse.json({ status: "ignored", reason: "no type" });
  }

  const event = EVENT_MAP[type];
  if (!event) {
    return NextResponse.json({ status: "ignored", event: type });
  }

  if (!emailId) {
    return NextResponse.json({ status: "ignored", reason: "no email_id" });
  }

  const rows = await loadCommRowsByResendId(emailId);
  if (!rows.length) {
    return NextResponse.json({ status: "no_comm_row", email_id: emailId });
  }

  for (const row of rows) {
    const prev =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {};
    const metadata = mergeMetadata(prev, event.action, created_at);
    const { error: upErr } = await serviceClient.from("communications_log").update({ metadata }).eq("id", row.id);
    if (upErr) {
      console.error("[email-tracking] communications_log update", upErr.message);
    }
  }

  if (event.engage) {
    const opportunityId = rows.map((r) => r.opportunity_id).find((id): id is string => typeof id === "string");
    if (opportunityId) {
      const nextFollow = new Date(Date.now() + 3 * 86_400_000).toISOString();
      const { error: oppErr } = await serviceClient
        .from("vilo_opportunities")
        .update({
          last_interaction_type: "email",
          next_follow_up: nextFollow,
        })
        .eq("id", opportunityId);
      if (oppErr) {
        console.error("[email-tracking] vilo_opportunities update", oppErr.message);
      }

      const { data: existing } = await serviceClient
        .from("action_items")
        .select("id")
        .eq("record_type", "opportunity")
        .eq("record_id", opportunityId)
        .eq("source", "email_engagement_tracking")
        .in("status", ["pending", "in_progress"])
        .limit(1)
        .maybeSingle();

      if (!existing) {
        const due = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
        const { error: taskErr } = await serviceClient.from("action_items").insert({
          business_unit: "vilo_research",
          record_type: "opportunity",
          record_id: opportunityId,
          title: "Seguimiento tras engagement (email)",
          status: "pending",
          priority: "medium",
          next_action: "Revisar interés y proponer llamada intro",
          due_date: due,
          value_usd: null,
          source: "email_engagement_tracking",
        });
        if (taskErr) {
          console.error("[email-tracking] action_items insert", taskErr.message);
        }
      }
    }
  }

  return NextResponse.json({ status: "tracked", event: type });
}
