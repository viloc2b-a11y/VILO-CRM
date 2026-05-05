import { verifyMetaSignature } from "@/lib/crypto/hmac";
import { serviceClient } from "@/lib/supabase/service-role";
import { processInboundMessage } from "@/lib/whatsapp/inbound-router";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * WhatsApp Cloud API — webhook inbound (mensajes usuario → negocio).
 *
 * - GET: verificación Meta (`hub.verify_token` / `hub.challenge`).
 *   Token: `WHATSAPP_VERIFY_TOKEN` o, si vacío, `META_INTAKE_VERIFY_TOKEN`.
 * - POST: cuerpo crudo + `x-hub-signature-256` y `META_APP_SECRET` (mismo patrón que Vitalis intake).
 *
 * Configurá en Meta Developers la URL pública: `https://tu-dominio/api/whatsapp/inbound`.
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const verify =
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() || process.env.META_INTAKE_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && verify && token === verify && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hubSig = req.headers.get("x-hub-signature-256");
  const metaAppSecret = process.env.META_APP_SECRET?.trim();

  if (!hubSig || !metaAppSecret) {
    return NextResponse.json(
      { error: "META_APP_SECRET and x-hub-signature-256 required" },
      { status: 401 },
    );
  }

  const sigOk = await verifyMetaSignature(rawBody, hubSig, metaAppSecret);
  if (!sigOk) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const extracted = extractWhatsAppInbound(body);
  if (!extracted) {
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  try {
    const result = await processInboundMessage({
      phone: extracted.from,
      message: extracted.bodyText,
      messageId: extracted.waMessageId,
      waMetaType: extracted.waType,
      supabase: serviceClient,
    });

    const skipped = result.actionTaken === "duplicate_wa_message_id";
    return NextResponse.json(
      {
        status: skipped ? "skipped" : "processed",
        intent: result.intent,
        action: result.actionTaken,
        inbound_id: result.inboundRowId,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error("[WA Inbound]", e);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

type ExtractedInbound = {
  from: string;
  bodyText: string;
  waMessageId: string;
  waType: string;
};

function extractWhatsAppInbound(body: Record<string, unknown>): ExtractedInbound | null {
  if (body.object !== "whatsapp_business_account") {
    return null;
  }

  const entry = (body.entry as Record<string, unknown>[] | undefined)?.[0];
  const change = (entry?.changes as Record<string, unknown>[] | undefined)?.[0];
  const value = change?.value as Record<string, unknown> | undefined;
  const messages = value?.messages as Record<string, unknown>[] | undefined;
  const msg = messages?.[0];

  if (!msg || typeof msg.from !== "string" || typeof msg.id !== "string") {
    return null;
  }

  const waType = typeof msg.type === "string" ? msg.type : "text";

  return {
    from: msg.from,
    bodyText: messageBodyFromMeta(msg),
    waMessageId: msg.id,
    waType,
  };
}

function messageBodyFromMeta(msg: Record<string, unknown>): string {
  const type = String(msg.type || "text");
  if (type === "text") {
    const text = msg.text as { body?: string } | undefined;
    return text?.body ?? "";
  }
  if (type === "interactive") {
    const inter = msg.interactive as {
      button_reply?: { id?: string; title?: string };
      list_reply?: { id?: string; title?: string };
    } | undefined;
    return (
      inter?.button_reply?.title ||
      inter?.list_reply?.title ||
      inter?.button_reply?.id ||
      inter?.list_reply?.id ||
      ""
    );
  }
  return `[${type}]`;
}
