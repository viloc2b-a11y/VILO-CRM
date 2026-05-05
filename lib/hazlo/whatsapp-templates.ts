/** Recovery/Growth usan plantillas aprobadas en Meta (fuera de ventana 24h). */
export function hazloWhatsAppTemplatesEnabled(): boolean {
  const v = process.env.HAZLO_WHATSAPP_USE_TEMPLATES?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function whatsappTemplateLanguageCode(): string {
  return process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "es";
}

export function hazloTemplateRecovery1Name(): string {
  return process.env.HAZLO_WA_TMPL_RECOVERY_1?.trim() || "hazlo_recovery_1";
}

export function hazloTemplateRecovery2Name(): string {
  return process.env.HAZLO_WA_TMPL_RECOVERY_2?.trim() || "hazlo_recovery_2";
}

export function hazloTemplateGrowthUpsellName(): string {
  return process.env.HAZLO_WA_TMPL_GROWTH_UPSELL?.trim() || "hazlo_growth_upsell";
}
