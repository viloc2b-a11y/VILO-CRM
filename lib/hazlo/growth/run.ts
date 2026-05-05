import {
  pickGrowthChannel,
  growthUrgencyHigh,
  preferredLanguageFromGrowthStats,
} from "@/lib/hazlo/growth/channel";
import { pickOfferForSegment } from "@/lib/hazlo/growth/offers";
import { sendGrowthCampaign } from "@/lib/hazlo/growth/notify";
import { computePropensityScore } from "@/lib/hazlo/growth/score";
import { inferGrowthSegment } from "@/lib/hazlo/growth/segment";
import type { GrowthStateShape } from "@/lib/hazlo/growth/types";
import { parseGrowthState } from "@/lib/hazlo/growth/types";
import { buildGrowthTrackingUrl } from "@/lib/hazlo/growth/utm";
import { serviceClient } from "@/lib/supabase/service-role";
import type { Json, Submission } from "@/lib/supabase/types";

const FOLLOWUP_SOURCE = "hazlo:growth:followup";
const SCORE_MIN = 70;
const DAYS_AFTER_PDF = 7;

async function patchGrowthState(submissionId: string, fn: (g: GrowthStateShape) => GrowthStateShape) {
  const { data: row } = await serviceClient
    .from("submissions")
    .select("growth_state")
    .eq("id", submissionId)
    .maybeSingle();
  const cur = parseGrowthState(row?.growth_state);
  const next = fn(cur);
  await serviceClient
    .from("submissions")
    .update({ growth_state: next as unknown as Json })
    .eq("id", submissionId);
}

async function ensureFollowupTask(submissionId: string, titleSuffix: string): Promise<void> {
  const { data: existing } = await serviceClient
    .from("action_items")
    .select("id")
    .eq("record_id", submissionId)
    .eq("record_type", "submission")
    .eq("source", FOLLOWUP_SOURCE)
    .maybeSingle();
  if (existing) return;

  const due = new Date(Date.now() + 5 * 86400000).toISOString();
  await serviceClient.from("action_items").insert({
    business_unit: "hazloasiya",
    record_type: "submission",
    record_id: submissionId,
    title: `Growth — seguimiento upsell: ${titleSuffix}`,
    status: "pending",
    next_action: "Revisar si el cliente convirtió (UTM); oferta alternativa si no",
    due_date: due,
    priority: "medium",
    source: FOLLOWUP_SOURCE,
    notes: "Growth Agent — sin conversión en 5 días (revisión manual)",
  });
}

export async function runGrowthAgentForSubmission(submissionId: string): Promise<{
  ok: boolean;
  action?: "sent" | "skipped_threshold" | "skipped_already" | "skipped_timing" | "skipped_config";
  error?: string;
}> {
  const { data: row, error } = await serviceClient
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("archived", false)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "not_found" };

  const sub = row as Submission;
  const growth = parseGrowthState(sub.growth_state);
  if (growth.last_campaign_at) return { ok: true, action: "skipped_already" };
  if (growth.evaluated_below_threshold) return { ok: true, action: "skipped_already" };

  if (sub.completion_status !== "PDF delivered" || !sub.pdf_delivered_at) {
    return { ok: true, action: "skipped_timing" };
  }

  const now = new Date();
  const pdfAt = new Date(sub.pdf_delivered_at);
  const msEligible = DAYS_AFTER_PDF * 86400000;
  if (now.getTime() - pdfAt.getTime() < msEligible) {
    return { ok: true, action: "skipped_timing" };
  }

  const segment = inferGrowthSegment(sub.funnel_type, sub.document_paths);
  const score = computePropensityScore({
    userBirthYear: sub.user_birth_year,
    mailingState: sub.mailing_state,
    documentPaths: sub.document_paths,
    pdfDeliveredAt: pdfAt,
    now,
  });

  if (score <= SCORE_MIN) {
    await patchGrowthState(submissionId, (g) => ({
      ...g,
      evaluated_below_threshold: true,
      last_score: score,
    }));
    return { ok: true, action: "skipped_threshold" };
  }

  const urgency = growthUrgencyHigh(score);
  const channel = pickGrowthChannel(sub, score, urgency);
  const offer = pickOfferForSegment(segment, sub.id);
  const trackingUrl = buildGrowthTrackingUrl({
    offerSlug: offer.slug,
    submissionId: sub.id,
    segment,
    channel,
  });

  if (!trackingUrl) {
    return { ok: false, error: "missing_HAZLO_GROWTH_BASE_URL" };
  }

  const segmentLabel =
    segment === "snap"
      ? "Basado en tu trámite SNAP completado."
      : segment === "daca"
        ? "Basado en tu expediente DACA."
        : "Basado en tu ITIN.";

  const campaignMeta = await sendGrowthCampaign({
    name: sub.name,
    email: sub.email,
    phone: sub.phone,
    channel,
    offer,
    trackingUrl,
    segmentLabel,
    priorFunnelType: sub.funnel_type,
    whatsappLanguage: preferredLanguageFromGrowthStats(sub),
  });

  const iso = now.toISOString();

  if (channel === "whatsapp") {
    const raw = sub.growth_channel_stats;
    const base =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? { ...(raw as Record<string, unknown>) }
        : {};
    await serviceClient
      .from("submissions")
      .update({
        growth_channel_stats: {
          ...base,
          last_whatsapp_campaign_at: iso,
          last_whatsapp_template_sent: campaignMeta.whatsappTemplateSent,
        } as unknown as Json,
      })
      .eq("id", sub.id);
  }

  await patchGrowthState(submissionId, (g) => ({
    ...g,
    last_campaign_at: iso,
    last_score: score,
    last_channel: channel,
    last_offer_slug: offer.slug,
    last_utm_campaign: `${segment}_${offer.slug}`,
    followup_task_at: iso,
    evaluated_below_threshold: false,
  }));

  await ensureFollowupTask(sub.id, `${sub.name.slice(0, 24)} — ${offer.slug}`);

  return { ok: true, action: "sent" };
}

export async function runGrowthAgentTick(limit = 25): Promise<{
  ok: boolean;
  results: string[];
  errors: string[];
}> {
  const results: string[] = [];
  const errors: string[] = [];
  const now = new Date();
  const cutoff = new Date(now.getTime() - DAYS_AFTER_PDF * 86400000).toISOString();

  const { data: rows, error } = await serviceClient
    .from("submissions")
    .select("id")
    .eq("archived", false)
    .eq("completion_status", "PDF delivered")
    .not("pdf_delivered_at", "is", null)
    .lte("pdf_delivered_at", cutoff)
    .limit(limit);

  if (error) {
    return { ok: false, results, errors: [error.message] };
  }

  for (const r of rows ?? []) {
    const id = r.id as string;
    const res = await runGrowthAgentForSubmission(id);
    if (!res.ok) errors.push(`${id}: ${res.error ?? "fail"}`);
    else if (res.action) results.push(`${id}:${res.action}`);
  }

  return { ok: errors.length === 0 || results.length > 0, results, errors };
}
