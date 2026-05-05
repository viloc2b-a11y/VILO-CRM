/**
 * Cliente WhatsApp Cloud API (Meta).
 * Compatible con Next.js Server / Cloudflare Workers; solo fetch nativo.
 */

export const WHATSAPP_GRAPH_API_VERSION = "v21.0";

export type WhatsAppConfig = {
  phoneId: string;
  token: string;
  /** Cualquier formato habitual; el payload usa solo dígitos (Meta no quiere "+" en `to`). */
  to: string;
  templateName: string;
  languageCode?: string;
  variables?: string[];
};

export type WhatsAppResponse = {
  success: boolean;
  messageId?: string;
  error?: string;
  raw?: unknown;
};

/** Normaliza el destinatario: solo dígitos, sin prefijo + (requisito del campo `to` en Graph). */
export function normalizeWhatsAppRecipient(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function sendWhatsAppTemplate(
  config: WhatsAppConfig,
): Promise<WhatsAppResponse> {
  const {
    phoneId,
    token,
    to,
    templateName,
    languageCode = "es",
    variables = [],
  } = config;

  const toDigits = normalizeWhatsAppRecipient(to);
  if (!phoneId?.trim() || !token?.trim() || toDigits.length < 10 || !templateName?.trim()) {
    return {
      success: false,
      error: "Missing phoneId, token, recipient, or template name",
    };
  }

  const parameters = variables.map((val) => ({
    type: "text" as const,
    text: String(val).slice(0, 1024),
  }));

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name: templateName.trim(),
      language: { code: (languageCode || "es").trim() },
      ...(parameters.length > 0
        ? { components: [{ type: "body", parameters }] }
        : {}),
    },
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${phoneId.trim()}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const data = (await res.json()) as {
      error?: { message?: string };
      messages?: { id?: string }[];
    };

    if (!res.ok || data.error) {
      return {
        success: false,
        error: data.error?.message || `HTTP ${res.status}`,
        raw: data,
      };
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      raw: data,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    return { success: false, error: message, raw: err };
  }
}
