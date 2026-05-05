import type { Json } from "@/lib/supabase/types";

export type GrowthSegment = "snap" | "itin" | "daca";

export type GrowthChannel = "email" | "whatsapp" | "sms";

export type GrowthOffer = {
  slug: string;
  headline: string;
  body: string;
  /** minutos estimados */
  etaMinutes: number;
};

export type GrowthStateShape = {
  last_campaign_at?: string;
  last_score?: number;
  last_channel?: GrowthChannel;
  last_offer_slug?: string;
  last_utm_campaign?: string;
  followup_task_at?: string;
  /** Score ≤ umbral; no reenviar campaña salvo reset manual. */
  evaluated_below_threshold?: boolean;
  /** Opt-out vía respuesta WhatsApp (inbound router). */
  whatsapp_opt_out?: boolean;
  whatsapp_opt_out_at?: string;
};

export type GrowthChannelStats = {
  email_open_rate?: number;
  whatsapp_response_rate?: number;
};

export function parseGrowthState(raw: Json | null | undefined): GrowthStateShape {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as GrowthStateShape;
  }
  return {};
}
