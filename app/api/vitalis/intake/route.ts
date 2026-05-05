import { verifyMetaSignature } from "@/lib/crypto/hmac";
import {
  applyVitalisIntake,
  enrichVitalisIntakeFromRawBody,
  type VitalisIntakePayload,
} from "@/lib/vitalis/intake";
import { serviceClient } from "@/lib/supabase/service-role";
import { NextRequest, NextResponse } from "next/server";

/**
 * Intake unificado Vitalis (webhooks Meta / WhatsApp / formularios / referidos).
 *
 * POST:
 * - Webhook Meta firmado: header `x-hub-signature-256` + `META_APP_SECRET` (Web Crypto HMAC).
 *   Idempotencia con `webhook_events` (mismo patrón que pagos).
 * - Otros: header `x-intake-secret: INTAKE_WEBHOOK_SECRET` si definís el secret en .env.
 * GET: verificación Meta (`hub.verify_token` / `hub.challenge`) con `META_INTAKE_VERIFY_TOKEN`.
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const verify = process.env.META_INTAKE_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && verify && token === verify && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hubSig = req.headers.get("x-hub-signature-256");
  const metaAppSecret = process.env.META_APP_SECRET?.trim();

  let metaSigned = false;
  if (hubSig) {
    if (!metaAppSecret) {
      return NextResponse.json({ error: "META_APP_SECRET not configured" }, { status: 500 });
    }
    const ok = await verifyMetaSignature(rawBody, hubSig, metaAppSecret);
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    metaSigned = true;
  } else {
    const secret = process.env.INTAKE_WEBHOOK_SECRET?.trim();
    if (secret) {
      const sent = req.headers.get("x-intake-secret");
      if (sent !== secret) {
        return unauthorized();
      }
    }
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let metaEventId: string | null = null;
  if (metaSigned) {
    metaEventId = await metaWebhookDedupId(body, rawBody);
    const { data: existing, error: dupErr } = await serviceClient
      .from("webhook_events")
      .select("id")
      .eq("id", metaEventId)
      .maybeSingle();

    if (dupErr) {
      console.error("[vitalis intake] webhook_events lookup:", dupErr.message);
      return NextResponse.json({ error: "idempotency_check_failed" }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ status: "skipped", id: metaEventId }, { status: 200 });
    }
  }

  try {
    const mapped = mapExternalPayload(body);
    const payload = enrichVitalisIntakeFromRawBody(mapped, body);
    const result = await applyVitalisIntake(payload);

    if (metaSigned && metaEventId) {
      const { error: insErr } = await serviceClient.from("webhook_events").insert({
        id: metaEventId,
        source: "meta",
        status: "success",
      });
      if (insErr) {
        console.error("[vitalis intake] webhook_events insert:", insErr.message);
        return NextResponse.json({ error: "idempotency_record_failed" }, { status: 500 });
      }
    }

    return NextResponse.json(
      { success: true, lead_id: result.lead_id, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = msg.includes("required") ? 422 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/** Id estable para Lead Ads (`leadgen_id`); si no, hash del body. */
function metaWebhookStableId(body: Record<string, unknown>): string | null {
  if (body.object === "page" && Array.isArray(body.entry)) {
    const entry = body.entry[0] as Record<string, unknown> | undefined;
    const changes = entry?.changes as Record<string, unknown>[] | undefined;
    const value = changes?.[0]?.value as Record<string, unknown> | undefined;
    const leadgenId = value?.leadgen_id;
    if (typeof leadgenId === "string" && leadgenId.length > 0) {
      return `meta_leadgen_${leadgenId}`;
    }
    const pageId = entry?.id;
    const time = entry?.time;
    const field = changes?.[0]?.field;
    if (pageId != null && time != null) {
      return `meta_page_${pageId}_${time}_${String(field ?? "change")}`;
    }
  }

  if (Array.isArray(body.entry)) {
    const ent = body.entry[0] as Record<string, unknown> | undefined;
    const changes = ent?.changes as Record<string, unknown>[] | undefined;
    const value = changes?.[0]?.value as Record<string, unknown> | undefined;
    const messages = value?.messages as { mid?: string }[] | undefined;
    const mid = messages?.[0]?.mid;
    if (typeof mid === "string" && mid.length > 0) {
      return `meta_wa_${mid}`;
    }
    const time = ent?.time;
    const id = ent?.id;
    if (id != null && time != null) {
      return `meta_entry_${id}_${time}`;
    }
  }

  return null;
}

async function metaWebhookDedupId(body: Record<string, unknown>, rawBody: string): Promise<string> {
  const stable = metaWebhookStableId(body);
  if (stable) return stable;
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `meta_sha_${hex}`;
}

function metaFieldMap(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const fieldData = value.field_data as { name?: string; values?: string[] }[] | undefined;
  if (!fieldData) return out;
  for (const f of fieldData) {
    const k = f.name?.toLowerCase().replace(/\s+/g, "_") ?? "";
    const v = f.values?.[0] ?? "";
    if (k) out[k] = v;
  }
  return out;
}

/** Normaliza cuerpos heterogéneos hacia VitalisIntakePayload. */
function mapExternalPayload(body: Record<string, unknown>): VitalisIntakePayload {
  if (typeof body.full_name === "string" && typeof body.phone === "string") {
    return body as unknown as VitalisIntakePayload;
  }

  if (body.object === "page" && Array.isArray(body.entry)) {
    const entry = body.entry[0] as Record<string, unknown> | undefined;
    const changes = entry?.changes as Record<string, unknown>[] | undefined;
    const value = changes?.[0]?.value as Record<string, unknown> | undefined;
    if (value && (value.leadgen_id || value.field_data)) {
      const m = metaFieldMap(value);
      const name =
        m.full_name ||
        [m.first_name, m.last_name].filter(Boolean).join(" ").trim() ||
        "Lead Meta";
      const phone = m.phone_number || m.phone || "";
      if (!phone) {
        throw new Error("Meta lead sin teléfono; completá el form o enriquecé vía Graph API");
      }
      return {
        full_name: name,
        phone,
        email: m.email || null,
        source_channel: "meta_lead_ads",
        source_campaign: String(value.adgroup_id ?? value.ad_id ?? value.form_id ?? "meta_lead"),
        consent_to_contact: true,
        raw: body,
      };
    }
  }

  if (Array.isArray(body.entry)) {
    const ent = body.entry[0] as Record<string, unknown> | undefined;
    const changes = ent?.changes as { value?: Record<string, unknown> }[] | undefined;
    const value = changes?.[0]?.value;
    const messages = value?.messages as { from?: string; type?: string; text?: { body?: string } }[] | undefined;
    const m0 = messages?.[0];
    if (m0?.type === "text" && m0.from) {
      return {
        full_name: "WhatsApp lead",
        phone: m0.from,
        email: null,
        source_channel: "whatsapp",
        source_campaign: "ctwa",
        condition_or_study_interest: (m0.text?.body ?? "").slice(0, 500),
        raw: body,
      };
    }
  }

  throw new Error(
    "Payload no reconocido: usá JSON con full_name + phone, o webhook Meta Lead Ads (field_data) / WhatsApp messages",
  );
}
