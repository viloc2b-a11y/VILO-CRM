import { verifySquareOfficialWebhook } from "@/lib/crypto/square";
import {
  extractSquarePaymentFromWebhook,
  handleSquarePaymentWebhookEvent,
  squareWebhookEventMeta,
} from "@/lib/hazlo/recovery/square-events";
import { serviceClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Square webhooks — Recovery Agent (HazloAsíYa).
 * Firma oficial: `x-square-hmacsha256-signature` + `SQUARE_WEBHOOK_NOTIFICATION_URL` + `SQUARE_WEBHOOK_SIGNATURE_KEY`.
 * Idempotencia: `register_webhook_event` (migración 28) + `event_id` de Square.
 *
 * No uses `createClient()` (anon): los webhooks requieren **service role** para RLS.
 */
export async function POST(req: NextRequest) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim();
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL?.trim();
  if (!signatureKey || !notificationUrl) {
    return NextResponse.json({ error: "Square webhook not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-square-hmacsha256-signature");

  const valid = await verifySquareOfficialWebhook(rawBody, signature, signatureKey, notificationUrl);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { eventId, type } = squareWebhookEventMeta(body);
  if (!eventId) {
    return NextResponse.json({ error: "Missing event_id" }, { status: 400 });
  }

  const { data: existing, error: dupErr } = await serviceClient
    .from("webhook_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (dupErr) {
    console.error("[square webhook] webhook_events lookup:", dupErr.message);
    return NextResponse.json({ error: "idempotency_check_failed" }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ status: "skipped", event_id: eventId }, { status: 200 });
  }

  const previewPayload = (extra: Record<string, unknown>): Json =>
    ({ type, event_id: eventId, ...extra }) as unknown as Json;

  try {
    if (type !== "payment.updated" && type !== "payment.created") {
      const { error: rpcErr } = await serviceClient.rpc("register_webhook_event", {
        p_id: eventId,
        p_source: "square",
        p_status: "ignored",
        p_payload: previewPayload({ reason: "event_type" }),
      });
      if (rpcErr) {
        console.error("[square webhook] register_webhook_event:", rpcErr.message);
        return NextResponse.json({ error: "idempotency_record_failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, ignored: type }, { status: 200 });
    }

    const payment = extractSquarePaymentFromWebhook(body);
    if (!payment) {
      return NextResponse.json({ error: "missing_payment_object" }, { status: 400 });
    }

    const result = await handleSquarePaymentWebhookEvent(payment, type);

    if (!result.handled) {
      const { error: rpcErr } = await serviceClient.rpc("register_webhook_event", {
        p_id: eventId,
        p_source: "square",
        p_status: "ignored",
        p_payload: previewPayload({ detail: result.detail ?? "non_terminal" }),
      });
      if (rpcErr) {
        console.error("[square webhook] register_webhook_event:", rpcErr.message);
        return NextResponse.json({ error: "idempotency_record_failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, event_id: eventId, detail: result.detail }, { status: 200 });
    }

    if (!result.ok) {
      return NextResponse.json({ ok: false, detail: result.detail }, { status: 422 });
    }

    const { error: rpcErr } = await serviceClient.rpc("register_webhook_event", {
      p_id: eventId,
      p_source: "square",
      p_status: "success",
      p_payload: previewPayload({
        payment_id: payment.id,
        submission_id: payment.reference_id ?? null,
      }),
    });
    if (rpcErr) {
      console.error("[square webhook] register_webhook_event:", rpcErr.message);
      return NextResponse.json({ error: "idempotency_record_failed" }, { status: 500 });
    }

    return NextResponse.json(
      { status: "processed", event_id: eventId, detail: result.detail },
      { status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Processing failed";
    const { error: failRpc } = await serviceClient.rpc("register_webhook_event", {
      p_id: eventId,
      p_source: "square",
      p_status: "failed",
      p_payload: previewPayload({ error: msg }),
    });
    if (failRpc) console.error("[square webhook] register_webhook_event failed:", failRpc.message);
    console.error("[square webhook]", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

/**
 * Algunos flujos de verificación de URL envían `GET ?challenge=...` y esperan `{ "challenge": "<mismo valor>" }`.
 * Si no hay `challenge`, respondemos salud (monitoring).
 */
export function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge");
  if (challenge != null && challenge.length > 0) {
    return NextResponse.json({ challenge });
  }
  return NextResponse.json({ ok: true, service: "hazlo-square-webhook" });
}
