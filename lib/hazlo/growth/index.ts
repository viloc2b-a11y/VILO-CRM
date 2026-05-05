/**
 * Growth Agent (upsell post–PDF entregado, HazloAsíYa).
 *
 * Cron: {@link runGrowthAgentTick} (alias {@link runGrowthTick}) en `run.ts` →
 * `POST /api/hazlo/growth/tick`. Usa **service role**, no `createClient()` con cookies.
 *
 * Elegibilidad: `completion_status = PDF delivered`, `pdf_delivered_at` ≥ 7 días,
 * `growth_state` sin campaña previa (`last_campaign_at`), score &gt; umbral (ver `score.ts`).
 * Ofertas: `offers.ts` + segmento (`segment.ts`). Contacto en la fila `submissions`
 * (`name`, `email`, `phone`); no hay `hazlo_users` ni columnas `growth_score` / `business_unit`.
 */
export type { GrowthChannel, GrowthOffer, GrowthSegment, GrowthStateShape } from "@/lib/hazlo/growth/types";
export { inferGrowthSegment } from "@/lib/hazlo/growth/segment";
export { computePropensityScore } from "@/lib/hazlo/growth/score";
export { pickGrowthChannel, growthUrgencyHigh } from "@/lib/hazlo/growth/channel";
export { buildGrowthTrackingUrl } from "@/lib/hazlo/growth/utm";
export {
  runGrowthAgentTick,
  runGrowthAgentTick as runGrowthTick,
  runGrowthAgentForSubmission,
} from "@/lib/hazlo/growth/run";
export { sendGrowthWhatsApp } from "@/lib/hazlo/growth/notify";
