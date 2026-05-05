import type { ValidationIssue } from "@/lib/hazlo/validator/types";
import { sendVitalisWhatsApp } from "@/lib/vitalis/whatsapp";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyHazloValidationFeedback(params: {
  name: string;
  email: string | null;
  phone: string | null;
  overall: string;
  issues: ValidationIssue[];
}): Promise<void> {
  const lines = params.issues
    .map(
      (i) =>
        `• [${i.severity.toUpperCase()}] ${i.message}${i.example_url ? ` Ver ejemplo: ${i.example_url}` : ""}`
    )
    .join("\n");

  const text = `Hola ${params.name.split(/\s+/)[0] || ""},\n\nEstado de tu documentación: ${params.overall}.\n\n${lines || "Sin observaciones automáticas."}\n\nSi tenés dudas, respondé a este canal.`;

  const html = `<p>Hola ${esc(params.name.split(/\s+/)[0] || "")},</p>
<p><strong>Estado:</strong> ${esc(params.overall)}</p>
<ul>${params.issues.map((i) => `<li><strong>${esc(i.severity)}</strong> — ${esc(i.message)}${i.example_url ? ` <a href="${esc(i.example_url)}">Ejemplo</a>` : ""}</li>`).join("")}</ul>`;

  if (params.phone?.trim()) {
    await sendVitalisWhatsApp(params.phone, text);
  }

  const to = params.email?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() ?? "Vilo CRM <onboarding@resend.dev>";
  if (to && resendKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: `HazloAsíYa — revisión de documentos (${params.overall})`,
          html: html || `<p>${esc(text)}</p>`,
        }),
      });
    } catch {
      /* noop */
    }
  }
}
