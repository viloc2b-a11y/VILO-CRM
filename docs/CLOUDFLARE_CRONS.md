# Paso 7: Crons en Cloudflare (alternativa a Vercel)

Cloudflare Pages no usa `vercel.json`. Los crons se configuran en el **Dashboard** y las rutas Next ya validan `x-cron-secret` cuando `CRON_SECRET` está definido en el entorno (mismo comportamiento que en Vercel/Node).

## 1. `wrangler.toml` (raíz del repo)

Definido en la raíz: nombre del proyecto, `compatibility_date`, `pages_build_output_dir` y `[vars]` para desarrollo local.

- Ajustá `pages_build_output_dir` si usás **@opennextjs/cloudflare** (p. ej. salida en `.open-next/`).
- No commitees secretos: en producción usá variables encriptadas del Dashboard o `wrangler secret put`.

## 2. Cron triggers (Cloudflare Dashboard)

1. **Cloudflare Dashboard** → **Workers & Pages** → tu proyecto (p. ej. **viloos-crm**).
2. **Settings** → **Triggers** → **Cron Triggers** → **Add Cron Trigger**.

### PASO 5 — Cadencia outreach B2B (`outreach-cadence/tick`)

Corre [`runOutreachTick`](../lib/vilo/outreach-cadence.ts): emails vía Resend cuando toca y `action_items` para pasos manuales (LinkedIn / llamada). Requiere **`SUPABASE_SERVICE_ROLE_KEY`**, **`RESEND_API_KEY`** y destinos de correo operativos (el código usa contacto de la oportunidad; **`OPS_EMAIL`** entra en otras rutas de alertas).

| Campo | Valor |
|--------|--------|
| **Schedule** | `0 9 * * 1-5` (lunes a viernes a las **09:00**; Cloudflare usa **UTC** — ajustá si querés 9:00 en otra zona) |
| **Target URL** | `https://tudominio.com/api/vilo/outreach-cadence/tick` |
| **Method** | **POST** |
| **Body** | Opcional: `{}` |

Si definiste **`CRON_SECRET`** en el entorno del proyecto, añadí **Custom headers**:

| Header | Valor |
|--------|--------|
| `x-cron-secret` | El mismo valor que **`CRON_SECRET`** (guardalo como **Encrypt** en variables) |
| `Content-Type` | `application/json` |

**Variables relacionadas (Dashboard → Settings → Environment variables → Encrypt en secretos):**

| Variable | Ejemplo | Notas |
|----------|---------|--------|
| `CRON_SECRET` | `tu_secreto_cron` (largo, aleatorio) | Debe coincidir con el header del trigger |
| `RESEND_API_KEY` | `re_xxxxx` | Obligatorio para pasos `email` de la cadencia |
| `RESEND_FROM` o `EMAIL_FROM` | remitente verificado en Resend | Ver [`.env.example`](../.env.example) |
| `OPS_EMAIL` | `admin@tudominio.com` | No es el destino de la cadencia B2B (va al contacto), pero conviene para alertas (`tick-critical`, etc.) |
| `NEXT_PUBLIC_APP_URL` | `https://tudominio.com` | Links y URL pública del CRM |
| `VILO_API_SECRET` | `vilo_b2b_api_key_xxx` | **Opcional hoy**: reservada para APIs B2B públicas (p. ej. intake); **esta ruta de cron no la lee**. Añadila si tenés otra ruta que autentique con ella |

### Resend Webhooks — tracking de email (`email-tracking`)

No es un Cron de Cloudflare: **Resend** hace **POST** a tu app cuando ocurre un evento del correo.

0. **Tracking de aperturas y clics (obligatorio para `opened` / `clicked`):** **Resend Dashboard** → **Settings** → **Emails** → activá **Open tracking** y **Click tracking** (la etiqueta exacta puede variar según la UI). Si están desactivados, no se emiten los eventos `email.opened` ni `email.clicked` y [`email-tracking`](../app/api/vilo/email-tracking/route.ts) no podrá actualizar `communications_log` ni disparar la lógica de engagement.

1. **Resend Dashboard** → **Webhooks** → **Add Endpoint**.
2. **Endpoint URL:** `https://tudominio.com/api/vilo/email-tracking` (mismo dominio que Cloudflare Pages).
3. **Events** (recomendados, alineados con [`app/api/vilo/email-tracking/route.ts`](../app/api/vilo/email-tracking/route.ts)):

   - `email.delivered`
   - `email.opened`
   - `email.clicked`
   - `email.complained`
   - `email.bounced`

4. **Signing secret / Shared secret:** generá un valor largo y aleatorio; guardalo en Cloudflare como **`RESEND_WEBHOOK_SECRET`** (**Encrypt**). La ruta acepta el mismo valor en cabecera **`x-resend-secret`** o **`x-webhook-secret`** (configurá en Resend lo que permita enviar ese valor; si Resend solo firma con Svix, podés añadir un header personalizado si tu plan lo permite, o ampliar la ruta para verificar firma Svix).

   > No uses un secreto de ejemplo en producción; el valor `vilo_email_track_2024` es solo ilustrativo.

5. **Cloudflare Pages** → tu proyecto → **Settings** → **Environment variables** → **Encrypt**:

   | Variable | Notas |
   |----------|--------|
   | `RESEND_WEBHOOK_SECRET` | Mismo secreto que configurás para validar el webhook |
   | `CRON_SECRET` | Para Cron Triggers (`x-cron-secret`), no para Resend |
   | `OPS_EMAIL` | Alertas operativas (`tick-critical`, etc.) |
   | `RESEND_API_KEY` | Envío de correos (cadencia, alertas) |

Sin **`RESEND_WEBHOOK_SECRET`** definido, [`email-tracking`](../app/api/vilo/email-tracking/route.ts) responde **503**.

### PASO 6 — Alertas críticas vencidas (`tick-critical`)

| Campo | Valor |
|--------|--------|
| **Schedule** | `0 */2 * * *` (cada **2 horas**, minuto 0; horario **UTC** en la UI de Cloudflare) |
| **Target URL** | `https://tudominio.com/api/notifications/tick-critical` |
| **Method** | **POST** |
| **Body** | Opcional: `{}` (la ruta no exige cuerpo) |

Si en **Environment Variables** definiste **`CRON_SECRET`**, añadí **Custom headers** en el mismo trigger:

| Header | Valor |
|--------|--------|
| `x-cron-secret` | El mismo string que **`CRON_SECRET`** (generá uno largo y guardalo como **Encrypt** en el Dashboard). |
| `Content-Type` | `application/json` |

Sin `CRON_SECRET` en el entorno, la ruta acepta el POST sin ese header (**solo desarrollo**; en producción definí el secreto).

Requisitos de negocio: **`RESEND_*`** / destino (**`OPS_EMAIL`**, etc.) y/o Slack (**`SLACK_CRITICAL_WEBHOOK`** u otros webhooks del proyecto), y migración **`37_notifications_log.sql`** + **`36_notification_deliveries.sql`** si usás el bus unificado. Ver [`NOTIFICATIONS_ALERTS.md`](./NOTIFICATIONS_ALERTS.md).

### Cadencia B2C Vitalis (`/api/vitalis/cadence/tick`)

Ejecuta [`runVitalisCadenceTick`](../lib/vitalis/cadence-b2c.ts) (WhatsApp Cloud API / Resend + `action_items`). Requiere **`SUPABASE_SERVICE_ROLE_KEY`**, **`WHATSAPP_PHONE_NUMBER_ID`**, **`WHATSAPP_ACCESS_TOKEN`** (para pasos con plantilla) y **`RESEND_*`** si caés en rama email. Plantillas y variables: [`VITALIS_B2C_DEPLOY_CHECKLIST.md`](./VITALIS_B2C_DEPLOY_CHECKLIST.md).

| Campo | Valor |
|--------|--------|
| **Schedule** | `*/30 * * * *` (cada **30 minutos**; Cloudflare usa **UTC**) |
| **Target URL** | `https://tudominio.com/api/vitalis/cadence/tick` |
| **Method** | **POST** |
| **Body** | Opcional: `{}` |

Si definiste **`CRON_SECRET`**, añadí **Custom headers**:

| Header | Valor |
|--------|--------|
| `x-cron-secret` | El mismo valor que **`CRON_SECRET`** (**Encrypt** en variables) |
| `Content-Type` | `application/json` |

---

Repetí el patrón anterior para el resto de jobs (método **POST** cuando la ruta lo soporte; timezone **UTC** salvo que indiques otra):

| Schedule (cron) | Target URL | Notas |
|-----------------|------------|--------|
| `0 */4 * * *` (cada 4 h) | `https://tudominio.com/api/hazlo/validator/tick` | Validador Hazlo |
| `0 9 * * *` (diario 9:00) | `https://tudominio.com/api/hazlo/recovery/tick` | Recuperación de pagos |
| `0 10 * * 1` (lunes 10:00) | `https://tudominio.com/api/hazlo/growth/tick` | Growth |

**Custom headers** (cada trigger que requiera auth), si tenés `CRON_SECRET` definido:

- `x-cron-secret`: mismo valor que `CRON_SECRET`
- `Content-Type`: `application/json`

Si `CRON_SECRET` no está definido en el entorno, las rutas aceptan la petición sin ese header (útil solo en desarrollo).

### Otros crons (referencia)

En el repo, [`vercel.json`](../vercel.json) programa **`/api/cron/check-automations`** cada hora. En Cloudflare, añadí otro trigger equivalente si lo seguís usando:

- Schedule: `0 * * * *`
- URL: `https://tudominio.com/api/cron/check-automations`
- Mismo header `x-cron-secret` si aplica.

Opcionalmente podés programar también Action Center / Vitalis si los usás en producción:

- `/api/action-center/orchestrator/tick`
- `/api/action-center/triage/tick`
- `/api/vitalis/cadence/tick` (cadencia B2C; ver subsección arriba)
- `/api/vitalis/scheduler/tick`
- etc.

## Variables generales en Cloudflare Dashboard

En **producción** no uses `.env.local` (solo sirve en tu máquina). Definí las variables en Cloudflare:

1. **Cloudflare Dashboard** → **Workers & Pages** → tu proyecto (p. ej. `viloos-crm`).
2. **Settings** → **Environment Variables**.
3. **Add variable** por cada una. Para secretos, activá **Encrypt** (Cloudflare los trata como valores sensibles).

Mínimo habitual para Hazlo + crons + WhatsApp + Supabase (valores de ejemplo; reemplazá por los tuyos):

| Variable | Valor de ejemplo | Notas |
|----------|------------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | URL del proyecto Supabase (usa esta; el código del CRM **no** lee `SUPABASE_URL`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJxxxxx…` (anon) | Cliente / RLS. **Encrypt** si tu política de equipo lo exige. |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJxxxxx…` (service role) | Solo servidor (API routes, webhooks, `serviceClient`). **Encrypt**. |
| `WHATSAPP_VERIFY_TOKEN` | `viloos_wa_verify_2024` | Debe coincidir con **Verify token** del webhook en Meta (PASO 4 en [`WHATSAPP_HAZLO_AGENTS.md`](./WHATSAPP_HAZLO_AGENTS.md)). **Encrypt**. |
| `META_APP_SECRET` | (App Secret de Meta) | Firma webhook POST `X-Hub-Signature-256` (inbound WhatsApp). **Encrypt**. |
| `WHATSAPP_PHONE_NUMBER_ID` | `123456789012345` | WhatsApp Manager → número de envío (Cloud API). |
| `WHATSAPP_ACCESS_TOKEN` | `EAAxxxxx…` | Token de larga duración de la app Meta. **Encrypt**. |
| `CRON_SECRET` | `tu_secreto_cron` | Mismo valor que mandás en header `x-cron-secret` en los Cron Triggers. **Encrypt**. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | `sq0sig_xxxx` | Firma de webhooks Square, si usás Hazlo con Square. **Encrypt**. |

Desarrollo local: podés usar `.env.local` o `.dev.vars` con Wrangler (ver comentarios en [`wrangler.toml`](../wrangler.toml)); eso **no** sustituye la configuración del Dashboard en producción.

### Más variables (producción / preview)

**Settings** → **Environment Variables**. Marcá **Encrypt** en todo lo que sea secreto.

Ejemplos adicionales (alineados con [`.env.example`](../.env.example)):

| Variable | Uso |
|----------|-----|
| `META_INTAKE_VERIFY_TOKEN` | Alternativa si no definís `WHATSAPP_VERIFY_TOKEN` (mismo flujo GET challenge) |
| `HAZLO_WHATSAPP_USE_TEMPLATES` | `true` si Recovery/Growth envían plantillas Meta |
| `WHATSAPP_TEMPLATE_LANGUAGE` | p. ej. `es` o `es_MX` (debe coincidir con la plantilla aprobada) |
| `RESEND_API_KEY` | Email (si aplica) |

**Production** y **Preview** deben tener los valores que correspondan a cada entorno.

WhatsApp Hazlo (plantillas y env): [`WHATSAPP_HAZLO_AGENTS.md`](./WHATSAPP_HAZLO_AGENTS.md).

## PASO 7: Variables de entorno — notificaciones y app URL (Cloudflare)

**Workers & Pages** → tu proyecto → **Settings** → **Environment Variables** → **Add variable**.

Marcá **Encrypt** en todo lo que sea secreto (API keys, webhooks, `CRON_SECRET`). **`NEXT_PUBLIC_*`** no suele necesitar cifrado, pero debe existir en **Production** (y en **Preview** si probás ahí).

| Variable | Valor de ejemplo | Encrypt (recomendado) | Uso en el código |
|----------|------------------|------------------------|------------------|
| `RESEND_API_KEY` | `re_xxxxxxxx` | Sí | [`lib/notifications/dispatcher.ts`](../lib/notifications/dispatcher.ts) |
| `RESEND_WEBHOOK_SECRET` | (secreto largo, aleatorio) | Sí | [`POST /api/vilo/email-tracking`](../app/api/vilo/email-tracking/route.ts) — cabeceras `x-resend-secret` o `x-webhook-secret` |
| `RESEND_FROM` | `ViloOS <notificaciones@tudominio.com>` | Opcional | Remitente Resend (**preferido** en el repo; ver [`.env.example`](../.env.example) `RESEND_FROM`). |
| `EMAIL_FROM` | Mismo formato que arriba | Opcional | **Alias**: si `RESEND_FROM` está vacío, el dispatcher usa `EMAIL_FROM`. |
| `OPS_EMAIL` | `admin@tudominio.com` | Opcional | Destino por defecto en [`tick-critical`](../app/api/notifications/tick-critical/route.ts) y fallback en [`report-ready`](../app/api/notifications/report-ready/route.ts). |
| `SLACK_CRITICAL_WEBHOOK` | `https://hooks.slack.com/services/…` | Sí | Alertas **tareas críticas vencidas** (o cae en webhooks genéricos si está vacío). |
| `SLACK_OPS_WEBHOOK` | `https://hooks.slack.com/services/…` | Sí | **Reporte listo** (o cae en `ALERTS_SLACK_WEBHOOK_URL` / Vitalis). |
| `NEXT_PUBLIC_APP_URL` | `https://tudominio.com` | No (público) | Links en correos, validación de `report_url`, PDFs. Alineá con el dominio real del proyecto Pages. |
| `CRON_SECRET` | `tu_secreto_cron` (largo, aleatorio) | Sí | Igual valor que el header `x-cron-secret` de los Cron Triggers (ver PASO 6). |

Opcionales relacionados: `ALERTS_EMAIL_TO`, `ALERTS_SLACK_WEBHOOK_URL`, `NEXT_PUBLIC_DEFAULT_REPORT_EMAIL` — ver [`.env.example`](../.env.example) y [`NOTIFICATIONS_ALERTS.md`](./NOTIFICATIONS_ALERTS.md).

## 4. Deploy

```bash
npm install -D wrangler
npm run build
# Ajustá la carpeta al output de tu adaptador:
npx wrangler pages deploy .vercel/output/static --project-name viloos-crm
```

Si usás **@opennextjs/cloudflare**, el comando y la carpeta serán los que indique la documentación de ese adaptador.

## Checklist rápido

| Paso | Acción |
|------|--------|
| 1 | **Variables generales** (Supabase, WhatsApp, `CRON_SECRET`, etc.); **Encrypt** en secretos |
| 2 | **PASO 7**: Variables de **notificaciones** + `NEXT_PUBLIC_APP_URL` (tabla arriba) |
| 3 | `wrangler.toml` en raíz |
| 4 | **PASO 5**: Cron **`/api/vilo/outreach-cadence/tick`** lun–vie 9:00 UTC + `x-cron-secret` si aplica |
| 5 | **Resend**: **Settings → Emails** → Open & Click tracking ON; **Webhooks** → **`/api/vilo/email-tracking`** + **`RESEND_WEBHOOK_SECRET`** (**Encrypt**) |
| 6 | **PASO 6**: Cron **`/api/notifications/tick-critical`** cada 2 h + `x-cron-secret` si aplica |
| 7 | Tres (o más) **Cron Triggers** Hazlo/check-automations con URL + cron + headers |
| 8 | `wrangler pages deploy` con la carpeta correcta |
| 9 | **Logs** del proyecto → filtrar ejecuciones programadas / cron |

## Verificación

En **Workers & Pages** → tu proyecto → **Logs**:

- **200**: ejecución correcta.
- **401**: `CRON_SECRET` del entorno no coincide con `x-cron-secret` del trigger (crons), o **`RESEND_WEBHOOK_SECRET`** no coincide con `x-resend-secret` / `x-webhook-secret` (webhook Resend).
- **503**: falta **`RESEND_WEBHOOK_SECRET`** en el entorno (`/api/vilo/email-tracking`).
- **500**: revisar logs de la API route y el stack trace.

## Referencia en código

Las rutas Hazlo citadas leen `CRON_SECRET` y el header `x-cron-secret` igual que en despliegues Node; no hace falta código extra solo por Cloudflare.
