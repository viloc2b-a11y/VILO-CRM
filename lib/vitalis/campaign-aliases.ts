/**
 * PASO 5 (ROI): los valores finales deben coincidir **exactamente** con `marketing_campaigns.name`
 * (misma mayúsculas/espacios, salvo que uses solo aliases aquí y un único nombre canónico en BD).
 *
 * Clave: normalizada en minúsculas (`utm_campaign` del formulario / ads).
 * Valor: string **exacto** como en la tabla `marketing_campaigns`.
 */
const UTM_CAMPAIGN_TO_NAME: Record<string, string> = {
  // Ejemplo:
  // "fb_leads_q1": "Facebook Leads Q1 2026",
};

/**
 * Resuelve `utm_campaign` (slug o etiqueta externa) al nombre de campaña en CRM.
 * Si no hay entrada en el mapa, devuelve el string recibido recortado.
 */
export function resolveCampaignNameFromUtm(utmCampaign: string): string {
  const t = utmCampaign.trim();
  if (!t) return t;
  const mapped = UTM_CAMPAIGN_TO_NAME[t.toLowerCase()];
  return mapped ?? t;
}
