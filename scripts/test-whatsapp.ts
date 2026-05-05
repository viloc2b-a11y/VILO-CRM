/**
 * Prueba manual de plantilla Meta (WhatsApp Cloud API).
 *
 * Requiere en el entorno: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN
 * (cargá `.env.local` en tu shell o exportá las variables antes de ejecutar).
 *
 * Ejecutar: npx tsx scripts/test-whatsapp.ts
 *        o: npm run test:whatsapp
 */
import { sendWhatsAppTemplate } from "../lib/whatsapp/client";

async function test() {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneId || !token) {
    console.error(
      "Faltan WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN en process.env.",
    );
    process.exitCode = 1;
    return;
  }

  const languageCode =
    process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim().replace(/^["']|["']$/g, "") ||
    "es";

  const result = await sendWhatsAppTemplate({
    phoneId,
    token,
    to: process.env.WHATSAPP_TEST_TO?.trim() || "+5215512345678",
    templateName: process.env.WHATSAPP_TEST_TEMPLATE?.trim() || "hazlo_recovery_1",
    languageCode,
    variables: (
      process.env.WHATSAPP_TEST_VARS?.trim() || "María,SNAP,https://example.com/pagar"
    ).split(","),
  });

  console.log("Resultado:", result);
  console.log("Éxito:", result.success ? "PASS" : "FAIL");
  if (result.error) console.log("Error:", result.error);
}

test().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
