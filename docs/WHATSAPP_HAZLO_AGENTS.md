# PASO 9: WhatsApp Cloud API (Meta) — Recovery & Growth Hazlo

Los agentes **Recovery** (día 2) y **Growth** (upsell post-PDF) pueden enviar mensajes reales vía **WhatsApp Cloud API**, sin librerías extra: `fetch` a Graph API desde las API routes Next.js (compatible con Cloudflare Workers / Node).

## Flujo end-to-end (Recovery + Growth)

| # | Qué pasa | Detalle en código / producto |
|---|----------|-------------------------------|
| 1 | **Cron** llama al tick | `POST /api/hazlo/recovery/tick` ([`app/api/hazlo/recovery/tick/route.ts`](../app/api/hazlo/recovery/tick/route.ts)) → `runRecoveryTick` → `processRecoverySteps`. Header `x-cron-secret` si `CRON_SECRET` está definido. |
| 2 | **Agent** elige expedientes con pago fallido y teléfono | Filas en `submissions`: `payment_status = failed`, `payment_failed_at` definido, no archivado / no cancelado. WhatsApp de recovery corre cuando han pasado **≥ 2 días** desde el fallo y aún no está `sent.d2_whatsapp` ([`lib/hazlo/recovery/run.ts`](../lib/hazlo/recovery/run.ts)). |
| 3 | Envío por plantilla | Con `HAZLO_WHATSAPP_USE_TEMPLATES`, `sendRecoveryWhatsApp` → [`sendWhatsAppTemplate`](../lib/whatsapp/client.ts) con plantilla tipo **`hazlo_recovery_1`** (nombre real vía `HAZLO_WA_TMPL_RECOVERY_1`). Sin flag, mensaje **texto** (`sendVitalisWhatsApp`). |
| 4 | **Meta** entrega al usuario | Respuesta OK de Graph API; la entrega al dispositivo la hace la red de WhatsApp (suele ser muy rápida; Meta no fija SLA fijo “&lt;3s”). |
| 5 | **Estado en BD** | Se actualiza `payment_recovery_state`: `sent.d2_whatsapp`, y si aplica plantilla Meta, `channel`, `next_action`, `whatsapp_recovery_attempts`. Fallos de plantilla: `console.error` en servidor (revisá logs Cloudflare/Vercel). |
| 6 | Usuario **responde** | Meta **POST** al webhook [`/api/whatsapp/inbound`](../app/api/whatsapp/inbound/route.ts) (firma + router). Persistencia en [`whatsapp_inbound_messages`](../supabase/34_whatsapp_inbound_messages.sql); ver **PASO 4** abajo. |
| 7 | **Growth** (otro cron, otra regla de tiempo) | `POST /api/hazlo/growth/tick` → al menos **7 días después de `pdf_delivered_at`**, score &gt; umbral, sin campaña previa; si el canal es WhatsApp y las plantillas están activas, [`sendGrowthWhatsApp`](../lib/hazlo/growth/notify.ts) usa **`hazlo_growth_upsell`** (o env). No es “7 días después del recovery”; es **7 días post-PDF entregado** ([`lib/hazlo/growth/run.ts`](../lib/hazlo/growth/run.ts)). |

## PASO 4: Configuración en Meta Developers (webhook inbound)

1. Entrá a [developers.facebook.com](https://developers.facebook.com) → **tu app** → **WhatsApp** → **Configuration**.
2. En **Webhook**, **Edit**.
3. Configurá:
   - **Callback URL:** `https://tudominio.com/api/whatsapp/inbound` (reemplazá por tu dominio público; debe ser HTTPS).
   - **Verify token:** el mismo valor que guardarás en **`WHATSAPP_VERIFY_TOKEN`** en el servidor (ej. `viloos_wa_verify_2024` u otro que elijas). Si no definís `WHATSAPP_VERIFY_TOKEN`, la ruta acepta **`META_INTAKE_VERIFY_TOKEN`** como fallback.
4. **Verify and Save**. Meta envía un **GET** con `hub.mode`, `hub.verify_token` y `hub.challenge`; la ruta responde el `challenge` en **texto plano** cuando el token coincide.
5. En **Webhook fields**, suscribite al campo **`messages`** (y guardá). Los eventos entrantes llegan por **POST** con cabecera **`X-Hub-Signature-256`**; hace falta **`META_APP_SECRET`** en el entorno (mismo secret de app Meta que otras integraciones).

Ruta: [`app/api/whatsapp/inbound/route.ts`](../app/api/whatsapp/inbound/route.ts).

## PASO 6: Test local / sandbox

1. Usá el **número de prueba** que Meta muestra en **WhatsApp** → **API Setup** (o el número de prueba vinculado a tu app).
2. Registrá tu móvil como tester si Meta lo pide; enviá un mensaje de prueba **al número de prueba de la cuenta WhatsApp Business** (flujo sandbox).
3. **Logs**
   - **Producción (Cloudflare):** Workers & Pages → tu proyecto → **Logs** → filtrar `POST /api/whatsapp/inbound`.
   - **Local:** necesitás URL HTTPS pública para el webhook (Meta no llama a `http://localhost`). Opción típica: [ngrok](https://ngrok.com/) (`ngrok http 3000`) y configurá la Callback URL con el host que te da ngrok + `/api/whatsapp/inbound`. En `.env.local` cargá `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.
4. **Supabase:** **Table Editor** → `whatsapp_inbound_messages` → deberías ver filas con `processed_status` (`processed`, `pending`, `ignored` según intención) e `intent_detected` (`confirm_visit`, `pause_recovery`, `request_help`, `other`).
5. Si el mensaje coincide con un **`patient_leads`** o **`submissions`** por teléfono normalizado, revisá también `patient_leads.current_stage` o `action_items` según la intención ([`inbound-router`](../lib/whatsapp/inbound-router.ts)).

Variables Cloudflare (producción): [**PASO 5** en `CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md).

## 1. Configuración en Meta (obligatorio)

1. **App WhatsApp** — [developers.facebook.com](https://developers.facebook.com) → Create App → tipo **Business** → producto **WhatsApp**. El asistente ofrece número de prueba y token temporal.
2. **Plantillas (Message templates)** — En **WhatsApp Manager** → *Message templates* → Create. Meta exige plantillas **aprobadas** para mensajes *business-initiated* fuera de la ventana de 24h. Hasta que no estén `APPROVED`, la API devuelve **400**.

Plantillas recomendadas (español; ajustá nombres si Meta exige otro formato):

| Nombre plantilla | Idioma | Cuerpo (ejemplo) | Variables |
|------------------|--------|------------------|-----------|
| `hazlo_recovery_1` | Spanish | Hola {{1}}, tuvimos un problema con tu pago de {{2}}. Puedes completar el pago seguro aquí: {{3}} | {{1}} nombre, {{2}} trámite, {{3}} URL pago |
| `hazlo_recovery_2` | Spanish | Hola {{1}}, tu trámite de {{2}} sigue pendiente. ¿Necesitas ayuda? Responde o llama al {{3}} | {{1}} nombre, {{2}} trámite, {{3}} teléfono soporte |
| `hazlo_growth_upsell` | Spanish | ¡Hola {{1}}! Ya completaste {{2}}. ¿Sabías que calificas para {{3}}? Solicítalo aquí: {{4}} | {{1}} nombre, {{2}} trámite previo, {{3}} nueva oferta, {{4}} URL |

- **Recovery día 2** en código usa **`hazlo_recovery_1`** (o el nombre que definas en env).
- **Growth** WhatsApp usa **`hazlo_growth_upsell`**.
- **`hazlo_recovery_2`**: se usa cuando `payment_recovery_state.whatsapp_recovery_attempts` indica intento **> 2** en `sendRecoveryWhatsApp` (el día 2 automático usa intento 1–2 → plantilla 1).

**Aprobación:** suele tardar entre ~1 h y 24 h.

3. **Credenciales**
   - **`WHATSAPP_PHONE_NUMBER_ID`** — WhatsApp Manager → *API Setup* / *Phone numbers*.
   - **`WHATSAPP_ACCESS_TOKEN`** — App Dashboard → WhatsApp → *API Setup*; generá un token de larga duración o usá el flujo de sistema que aplique a tu app.

En **producción** con Cloudflare: **Workers & Pages** → tu proyecto → **Settings** → **Environment Variables** → **Encrypt** en `WHATSAPP_ACCESS_TOKEN` y demás secretos; no uses `.env.local` en prod (ver [**PASO 5** en `CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md)). En local podés usar `.env.local`. **No** expongas estos valores al cliente.

## 2. Variables de entorno en el CRM

| Variable | Uso |
|----------|-----|
| `WHATSAPP_ACCESS_TOKEN` | Bearer token Graph API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número de envío |
| `WHATSAPP_VERIFY_TOKEN` | GET webhook Meta (`hub.verify_token`); si omitís, se usa `META_INTAKE_VERIFY_TOKEN` |
| `META_APP_SECRET` | Firma POST `x-hub-signature-256` del webhook (mismo secret que otras integraciones Meta) |
| `HAZLO_WHATSAPP_USE_TEMPLATES` | `true` / `1` para Recovery/Growth Hazlo por **plantilla**; si no, se usa mensaje **texto** (útil en sandbox / 24h) |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Código idioma de la plantilla (default **`es`**; si Meta aprobó `es_MX`, configurá eso) |
| `HAZLO_WA_TMPL_RECOVERY_1` | Nombre plantilla recovery (default `hazlo_recovery_1`) |
| `HAZLO_WA_TMPL_GROWTH_UPSELL` | Nombre plantilla growth (default `hazlo_growth_upsell`) |
| `HAZLO_PAYMENT_UPDATE_URL` | Base del enlace {{3}} recovery (se añade `submission_id`) |

Implementación:

- Cliente Graph (plantillas): [`lib/whatsapp/client.ts`](../lib/whatsapp/client.ts) → `sendWhatsAppTemplate`
- Webhook inbound: [`app/api/whatsapp/inbound/route.ts`](../app/api/whatsapp/inbound/route.ts) (GET verify + POST firmado); lógica CRM [`lib/whatsapp/inbound-router.ts`](../lib/whatsapp/inbound-router.ts) → `processInboundMessage`
- Wrapper con env del CRM: [`lib/vitalis/whatsapp.ts`](../lib/vitalis/whatsapp.ts) → `sendWhatsAppTemplateMessage`
- Helpers Hazlo: [`lib/hazlo/whatsapp-templates.ts`](../lib/hazlo/whatsapp-templates.ts)
- Recovery día 2: [`lib/hazlo/recovery/notify.ts`](../lib/hazlo/recovery/notify.ts) → `sendRecoveryDay2WhatsApp`
- Growth: [`lib/hazlo/growth/notify.ts`](../lib/hazlo/growth/notify.ts) → `sendGrowthCampaign` (canal `whatsapp`)

**Vitalis** (intake, qualifier, scheduler) sigue usando **`sendVitalisWhatsApp`** (mensaje tipo `text`) donde aplique la ventana de conversación.

## 3. Producción vs desarrollo

- Con **`HAZLO_WHATSAPP_USE_TEMPLATES=true`**, si la plantilla falla (400, nombre distinto, idioma distinto), el código **hace fallback** al mensaje de texto libre (puede fallar igual fuera de 24h en números reales).
- Revisá logs de Graph API en caso de error (el código actual no persiste el cuerpo de error; podés ampliar con `console.error` temporal).

## 4. Referencias Meta

- [Cloud API — Send template messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#template-messages)
- Plantillas y categorías en WhatsApp Manager

## 5. Notas críticas para producción

| Aspecto | Regla / contexto Meta | Cómo lo cubrimos en este repo |
|--------|------------------------|-------------------------------|
| **Ventana 24h** | Mensajes de sesión “libres” solo si el usuario escribió primero dentro de la ventana. | Recovery y Growth usan **plantillas aprobadas** para *business-initiated* fuera de la ventana. Vitalis puede usar `sendVitalisWhatsApp` (texto) cuando la conversación lo permita. |
| **Formato teléfono** | El número debe ser válido (E.164 conceptualmente: país + nacional). En Graph, el campo `to` va **solo dígitos**, sin `+`. | [`normalizeWhatsAppRecipient`](../lib/whatsapp/client.ts) en `lib/whatsapp/client.ts` deja solo dígitos antes del `POST`. Podés pasar `+521…` o `521…` indistintamente. *(Twilio/voz en recovery usa otro helper E.164 en `notify.ts` — no confundir con Cloud API.)* |
| **Límites de envío** | Tier inicial (~1k conversaciones/día según cuenta); sube con uso y calidad. | Revisá **quality rating** y límites en **WhatsApp Manager**; no hay rate limit en código. |
| **Costos** | Precio por **conversación** (ventana de servicio de 24h), no siempre “por mensaje” suelto; varía por país y categoría. | Presupuestá por conversaciones abiertas; ver [precios Meta](https://developers.facebook.com/docs/whatsapp/pricing) actualizados. |
| **Verificación Business** | Necesaria para escalar tier, display name estable, etc. | Un MVP puede probarse con número de prueba / tier bajo; planificá verificación comercial según roadmap Meta. |

## 6. Checklist deploy — inbound + WhatsApp (~5 min)

| Paso | Acción | Estado |
|------|--------|--------|
| 1 | Ejecutar SQL [`supabase/34_whatsapp_inbound_messages.sql`](../supabase/34_whatsapp_inbound_messages.sql) en **Supabase → SQL Editor** | ⬜ |
| 2 | Confirmar en el repo [`lib/whatsapp/inbound-router.ts`](../lib/whatsapp/inbound-router.ts) (`processInboundMessage`) | ⬜ |
| 3 | Confirmar [`app/api/whatsapp/inbound/route.ts`](../app/api/whatsapp/inbound/route.ts) (GET verify + POST firmado) | ⬜ |
| 4 | **Meta:** [developers.facebook.com](https://developers.facebook.com) → tu app → **WhatsApp** → **Configuration** → Webhook: Callback URL + Verify Token + suscripción al campo **`messages`** (ver **PASO 4** arriba) | ⬜ |
| 5 | **Cloudflare:** `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_*` de envío — ver [**PASO 5**](./CLOUDFLARE_CRONS.md) (**Encrypt** en secretos) | ⬜ |
| 6 | Deploy: `npx wrangler pages deploy …` (carpeta según adaptador Next → Cloudflare; [`CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md)) | ⬜ |
| 7 | Enviar mensaje de prueba desde WhatsApp; verificar **Table Editor** `whatsapp_inbound_messages` y, si aplica, **`action_items`** / **Action Center** | ⬜ |

**Checklist ampliado (plantillas outbound, crons Hazlo):** plantillas **APPROVED**, [`lib/whatsapp/client.ts`](../lib/whatsapp/client.ts), variables + Cron Triggers en [`CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md), `npm run test:whatsapp` para Graph API.

## 7. Webhook inbound: notas de producción

| Aspecto | Implementación en este repo |
|--------|-----------------------------|
| **Idempotencia** | `wa_message_id` **UNIQUE** en BD + comprobación al inicio de `processInboundMessage` antes de side-effects → menos duplicados por reintentos de Meta. |
| **Velocidad** | Respondé **200** en cuanto el handler termine; el flujo es sincrónico y acotado (lookup + acciones + insert). Si la latencia crece o Meta aprieta timeouts, mové el trabajo pesado a una **cola** / job asíncrono y devolvé 200 tras encolar. |
| **Seguridad** | `SUPABASE_SERVICE_ROLE_KEY` solo en **servidor** (API routes / Edge); no en el bundle cliente. POST exige **`X-Hub-Signature-256`** + **`META_APP_SECRET`**. El GET de verificación usa **`hub.verify_token`** (no sustituye la firma del POST). |
| **Escalabilidad** | Índices en `wa_phone_number` y `(processed_status, created_at)`. Por volúmenes muy altos (p. ej. &gt; ~50k filas/mes), valorá **particionado** por mes u otra estrategia de archivo. |
| **Extensión a IA** | `intent_detected` puede alimentarse hoy con heurísticas regex; el campo está listo para sustituir o enriquecer con un modelo (p. ej. clasificación NLP) sin cambiar el esquema base. |

## 8. Flujo final en vivo (ejemplo inbound)

1. El usuario responde algo como *«Sí, confirmo»* al WhatsApp de recovery (o al número de prueba en sandbox).
2. Meta envía **POST** a `/api/whatsapp/inbound` con el payload de mensajes.
3. La ruta valida la **firma**, parsea el mensaje y llama a **`processInboundMessage`** (idempotencia por `wa_message_id`).
4. El router detecta intención (p. ej. `confirm_visit`) y, si hay **`patient_leads`** vinculado por teléfono, actualiza **`current_stage`** (p. ej. a **Visit Confirmed**), no una tabla `patients`.
5. Si la intención lo requiere, inserta filas en **`action_items`** (p. ej. soporte); tu equipo las ve en el **Action Center**.
6. Se persiste la fila en **`whatsapp_inbound_messages`** y la API responde **200** a Meta.
7. El equipo revisa CRM / tablas sin tener que registrar el mensaje a mano.

## 9. Próximo paso opcional

Con outbound (plantillas recovery/growth) + inbound (webhook + router) tenés el **ciclo** mensaje negocio ↔ usuario ↔ actualización en BD y tareas. Siguientes mejoras típicas: respuestas automáticas salientes tras ciertas intenciones, métricas de conversación, o sustituir regex por NLP en `intent_detected`.
