import {
  WHATSAPP_GRAPH_API_VERSION,
  normalizeWhatsAppRecipient,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp/client";

/**
 * WhatsApp Cloud API — texto simple (Vitalis intake / qualifier / scheduler;
 * ventana de 24h o números de prueba).
 */
export async function sendVitalisWhatsApp(toDigits: string, message: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const to = normalizeWhatsAppRecipient(toDigits);
  if (!token || !phoneId || to.length < 10) return;

  try {
    await fetch(
      `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: true, body: message },
        }),
      },
    );
  } catch {
    /* noop */
  }
}

/**
 * Plantilla aprobada en WhatsApp Manager (mensajes business-initiated fuera de 24h).
 * `bodyParameterTexts` mapea a {{1}}, {{2}}, … del cuerpo de la plantilla.
 * @returns true si Graph API respondió OK
 */
export async function sendWhatsAppTemplateMessage(
  toDigits: string,
  templateName: string,
  languageCode: string,
  bodyParameterTexts: string[],
): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const to = normalizeWhatsAppRecipient(toDigits);
  if (!token || !phoneId || to.length < 10 || !templateName.trim()) return false;

  const r = await sendWhatsAppTemplate({
    phoneId,
    token,
    to,
    templateName,
    languageCode,
    variables: bodyParameterTexts,
  });
  return r.success;
}
