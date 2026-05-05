import type { SupabaseClient } from "@supabase/supabase-js";

import { parseGrowthState } from "@/lib/hazlo/growth/types";
import type {
  ActionItemInsert,
  Json,
  VitalisStage,
  WhatsAppInboundMessageType,
} from "@/lib/supabase/types";
import { normalizeWhatsAppRecipient } from "@/lib/whatsapp/client";

export type InboundIntent = "confirm_visit" | "pause_recovery" | "request_help" | "other";

/** Cliente con service role (`createClient` sin genérico, alineado a `service-role.ts`). */
export type InboundContext = {
  phone: string;
  message: string;
  messageId: string;
  supabase: SupabaseClient;
  /** Tipo crudo del webhook Meta (`text`, `image`, `interactive`, …). */
  waMetaType?: string;
};

/** Mapea tipo Meta al check constraint de `whatsapp_inbound_messages`. */
export function mapMetaWebhookTypeToDb(meta?: string): WhatsAppInboundMessageType {
  const t = (meta || "text").toLowerCase();
  if (t === "image") return "image";
  if (t === "audio") return "audio";
  if (t === "document" || t === "video" || t === "sticker") return "document";
  if (t === "button") return "button";
  if (t === "interactive") return "quick_reply";
  return "text";
}

export type InboundRouterResult = {
  relatedPatientLeadId: string | null;
  relatedSubmissionId: string | null;
  intent: InboundIntent;
  actionTaken: string;
  inboundRowId: string | null;
};

function detectIntent(message: string): InboundIntent {
  const lower = message.toLowerCase().trim();
  if (/confirm|sí|\bsi\b|claro|ok|acepto|agenda/.test(lower)) return "confirm_visit";
  if (/no|cancel|parar|detener|baja|stop|no quiero/.test(lower)) return "pause_recovery";
  if (/ayuda|soporte|problema|error|humano|agente/.test(lower)) return "request_help";
  return "other";
}

async function findSubmissionIdByPhone(
  supabase: SupabaseClient,
  cleanPhone: string,
): Promise<string | null> {
  const { data: rows } = await supabase
    .from("submissions")
    .select("id, phone")
    .eq("archived", false)
    .not("phone", "is", null)
    .order("created_at", { ascending: false })
    .limit(80);

  const match = rows?.find((r) => r.phone && normalizeWhatsAppRecipient(r.phone) === cleanPhone);
  return match?.id ?? null;
}

/**
 * Tras verificar firma del webhook Meta: resuelve paciente Hazlo/Vitalis, intención heurística,
 * side-effects mínimos y fila en `whatsapp_inbound_messages`.
 * Requiere cliente **service role** (bypass RLS en inserts).
 */
export async function processInboundMessage(ctx: InboundContext): Promise<InboundRouterResult> {
  const { phone, message, messageId, supabase } = ctx;

  const { data: already } = await supabase
    .from("whatsapp_inbound_messages")
    .select("id")
    .eq("wa_message_id", messageId)
    .maybeSingle();
  if (already) {
    return {
      relatedPatientLeadId: null,
      relatedSubmissionId: null,
      intent: "other",
      actionTaken: "duplicate_wa_message_id",
      inboundRowId: already.id,
    };
  }

  const cleanPhone = normalizeWhatsAppRecipient(phone);
  const intent = detectIntent(message);

  let relatedPatientLeadId: string | null = null;
  let relatedSubmissionId: string | null = null;
  let actionTaken = "";

  if (cleanPhone.length >= 10) {
    const { data: lead } = await supabase
      .from("patient_leads")
      .select("id")
      .eq("phone_normalized", cleanPhone)
      .eq("archived", false)
      .maybeSingle();
    relatedPatientLeadId = lead?.id ?? null;

    relatedSubmissionId = await findSubmissionIdByPhone(supabase, cleanPhone);
  }

  if (relatedPatientLeadId && intent === "confirm_visit") {
    const { error } = await supabase
      .from("patient_leads")
      .update({
        current_stage: "Visit Confirmed" as VitalisStage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", relatedPatientLeadId);
    if (!error) actionTaken = "Visita confirmada (etapa Visit Confirmed)";
  } else if (relatedPatientLeadId && intent === "request_help") {
    const due = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const row: ActionItemInsert = {
      business_unit: "vitalis",
      record_type: "patient",
      record_id: relatedPatientLeadId,
      title: "Soporte solicitado por WhatsApp",
      priority: "high",
      status: "pending",
      next_action: "Contactar paciente por llamada",
      due_date: due,
      owner_id: null,
      assigned_to: null,
      value_usd: null,
      notes: null,
      source: "whatsapp:inbound:help",
    };
    const { error } = await supabase.from("action_items").insert(row);
    if (!error) actionTaken = "Tarea de soporte creada (Vitalis)";
  } else if (relatedSubmissionId && intent === "pause_recovery") {
    const { data: sub } = await supabase
      .from("submissions")
      .select("growth_state")
      .eq("id", relatedSubmissionId)
      .maybeSingle();
    const growth = parseGrowthState(sub?.growth_state ?? null);
    const now = new Date().toISOString();
    const nextGrowth = {
      ...growth,
      whatsapp_opt_out: true,
      whatsapp_opt_out_at: now,
    };

    await supabase
      .from("submissions")
      .update({ growth_state: nextGrowth as unknown as Json, updated_at: now })
      .eq("id", relatedSubmissionId);

    const optRow: ActionItemInsert = {
      business_unit: "hazloasiya",
      record_type: "submission",
      record_id: relatedSubmissionId,
      title: "Usuario pidió parar contacto (WhatsApp)",
      priority: "low",
      status: "completed",
      next_action: "Respetar opt-out",
      due_date: now,
      owner_id: null,
      assigned_to: null,
      value_usd: null,
      notes: null,
      source: "whatsapp:inbound:opt_out",
    };
    const { error } = await supabase.from("action_items").insert(optRow);
    if (!error) actionTaken = "Opt-out growth registrado en growth_state";
  } else if (intent === "request_help" && relatedSubmissionId) {
    const due = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const helpRow: ActionItemInsert = {
      business_unit: "hazloasiya",
      record_type: "submission",
      record_id: relatedSubmissionId,
      title: "Soporte solicitado por WhatsApp",
      priority: "medium",
      status: "pending",
      next_action: "Revisar historial y responder",
      due_date: due,
      owner_id: null,
      assigned_to: null,
      value_usd: null,
      notes: null,
      source: "whatsapp:inbound:help",
    };
    const { error } = await supabase.from("action_items").insert(helpRow);
    if (!error) actionTaken = "Tarea de soporte creada (Hazlo)";
  } else if (intent === "request_help") {
    actionTaken = "Sin patient_lead ni submission vinculados; no se creó tarea";
  }

  const processed = Boolean(actionTaken) && !actionTaken.startsWith("Sin ");
  const processedStatus = processed
    ? "processed"
    : actionTaken.startsWith("Sin ")
      ? "ignored"
      : "pending";

  const messageTypeDb = mapMetaWebhookTypeToDb(ctx.waMetaType);

  const { data: inserted, error: insErr } = await supabase
    .from("whatsapp_inbound_messages")
    .insert({
      wa_message_id: messageId,
      wa_phone_number: cleanPhone,
      message_body: message,
      message_type: messageTypeDb,
      related_submission_id: relatedSubmissionId,
      related_patient_lead_id: relatedPatientLeadId,
      intent_detected: intent,
      processed_status: processedStatus,
      processed_at: processed ? new Date().toISOString() : null,
    })
    .select("id")
    .maybeSingle();

  if (insErr && insErr.code !== "23505") {
    console.error("[inbound-router] whatsapp_inbound_messages insert:", insErr.message);
  }

  return {
    relatedPatientLeadId,
    relatedSubmissionId,
    intent,
    actionTaken,
    inboundRowId: inserted?.id ?? null,
  };
}
