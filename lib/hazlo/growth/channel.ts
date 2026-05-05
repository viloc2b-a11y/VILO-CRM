import type { Submission } from "@/lib/supabase/types";
import type { GrowthChannel } from "@/lib/hazlo/growth/types";

/** `growth_channel_stats.preferred_language` o `.language` (p. ej. `es`, `en`) para plantillas Meta. */
export function preferredLanguageFromGrowthStats(sub: Submission): string | undefined {
  const raw = sub.growth_channel_stats;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const lang = o.preferred_language ?? o.language;
  return typeof lang === "string" && lang.trim() ? lang.trim() : undefined;
}

function statsFromSubmission(sub: Submission): {
  email_open_rate: number;
  whatsapp_response_rate: number;
} {
  const raw = sub.growth_channel_stats;
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const email = typeof o.email_open_rate === "number" ? o.email_open_rate : 0.32;
  const wa =
    typeof o.whatsapp_response_rate === "number" ? o.whatsapp_response_rate : 0.48;
  return {
    email_open_rate: email,
    whatsapp_response_rate: wa,
  };
}

/**
 * Email si open_rate > 30%; WhatsApp si response_rate > 50%;
 * SMS si urgencia alta (score muy alto y teléfono).
 */
export function pickGrowthChannel(
  sub: Submission,
  score: number,
  urgencyHigh: boolean
): GrowthChannel {
  const { email_open_rate, whatsapp_response_rate } = statsFromSubmission(sub);

  if (urgencyHigh && sub.phone?.trim()) {
    return "sms";
  }
  if (whatsapp_response_rate > 0.5 && sub.phone?.trim()) {
    return "whatsapp";
  }
  if (email_open_rate > 0.3 && sub.email?.trim()) {
    return "email";
  }
  if (sub.phone?.trim()) {
    return "whatsapp";
  }
  return "email";
}

export function growthUrgencyHigh(score: number): boolean {
  if (process.env.HAZLO_GROWTH_SMS_URGENT === "true") return score >= 70;
  return score >= 88;
}
