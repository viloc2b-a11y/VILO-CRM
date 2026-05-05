import { handlePaymentIntentFailed, handlePaymentIntentSucceeded } from "@/lib/hazlo/recovery/stripe-events";
import { serviceClient } from "@/lib/supabase/service-role";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * Stripe webhooks — Recovery Agent (opcional / legado).
 * Producción HazloAsíYa: usar Square → `POST /api/hazlo/square/webhook`.
 *
 * Eventos: `payment_intent.payment_failed`, `payment_intent.succeeded`.
 * El PaymentIntent debe incluir `metadata.submission_id` (UUID de `public.submissions`).
 *
 * Firma: `stripe.webhooks.constructEvent` (SDK Node; equivale a validar HMAC del payload crudo).
 * Idempotencia: `public.webhook_events` por `event.id` (ejecutar `supabase/26_webhook_events.sql`).
 */
export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!key || !whSecret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const stripe = new Stripe(key);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, whSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { data: existing, error: dupErr } = await serviceClient
    .from("webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();

  if (dupErr) {
    console.error("[stripe webhook] webhook_events lookup:", dupErr.message);
    return NextResponse.json({ error: "idempotency_check_failed" }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ status: "skipped", id: event.id }, { status: 200 });
  }

  if (event.type === "payment_intent.payment_failed") {
    const result = await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    const { error: insErr } = await serviceClient.from("webhook_events").insert({
      id: event.id,
      source: "stripe",
      status: "success",
    });
    if (insErr) {
      console.error("[stripe webhook] webhook_events insert:", insErr.message);
      return NextResponse.json({ error: "idempotency_record_failed" }, { status: 500 });
    }
    return NextResponse.json(result, { status: 200 });
  }

  if (event.type === "payment_intent.succeeded") {
    const result = await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    const { error: insErr } = await serviceClient.from("webhook_events").insert({
      id: event.id,
      source: "stripe",
      status: "success",
    });
    if (insErr) {
      console.error("[stripe webhook] webhook_events insert:", insErr.message);
      return NextResponse.json({ error: "idempotency_record_failed" }, { status: 500 });
    }
    return NextResponse.json(result, { status: 200 });
  }

  const { error: ignErr } = await serviceClient.from("webhook_events").insert({
    id: event.id,
    source: "stripe",
    status: "ignored",
  });
  if (ignErr) {
    console.error("[stripe webhook] webhook_events ignored insert:", ignErr.message);
    return NextResponse.json({ error: "idempotency_record_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ignored: event.type }, { status: 200 });
}
