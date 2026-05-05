# Vitalis B2C — Cron Cloudflare, WhatsApp y checklist de deploy

Guía operativa alineada con el código del repo (`lib/vitalis/intake-engine.ts`, `lib/vitalis/cadence-b2c.ts`, rutas `app/api/vitalis/*`, SQL `40_*` / `41_*`).

## Cloudflare: Cron Trigger (cadencia B2C)

1. **Cloudflare Dashboard** → **Workers & Pages** → tu proyecto → **Settings** → **Triggers** → **Cron Triggers** → **Add Cron Trigger**.

| Campo | Valor |
|--------|--------|
| **Schedule** | `*/30 * * * *` (cada 30 minutos; horario **UTC** en la UI) |
| **Target URL** | `https://tudominio.com/api/vitalis/cadence/tick` |
| **Method** | **POST** |
| **Body** | Opcional: `{}` |

Si en el proyecto definiste **`CRON_SECRET`**, añadí **Custom headers**:

| Header | Valor |
|--------|--------|
| `x-cron-secret` | El mismo string que **`CRON_SECRET`** (guardalo como **Encrypt** en Environment Variables) |
| `Content-Type` | `application/json` |

Más contexto y otras rutas: [`CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md).

## Meta: plantilla WhatsApp `vitalis_welcome_prescreen`

En **WhatsApp Manager** → **Message templates** → crear plantilla (nombre debe coincidir con la env **`VITALIS_WA_TEMPLATE_WELCOME`** o el default `vitalis_welcome_prescreen` en [`cadence-b2c.ts`](../lib/vitalis/cadence-b2c.ts)).

| Campo | Valor sugerido |
|--------|----------------|
| **Idioma** | Spanish (`es`) |
| **Categoría** | **UTILITY** (suele aprobar mejor que MARKETING para mensajes transaccionales) |
| **Cuerpo (ejemplo)** | Hola {{1}}, gracias por tu interés en el estudio de {{2}}. Completa el prescreening rápido aquí para verificar elegibilidad: {{3}}. Responde STOP para cancelar. |
| **Variables** | {{1}} nombre, {{2}} condición / estudio, {{3}} URL de prescreen |

El código envía las variables en este orden: nombre, `condition_or_study_interest` (o texto por defecto), URL de [`prescreenUrl()`](../lib/vitalis/cadence-b2c.ts) (`VITALIS_PRESCREEN_URL`, `NEXT_PUBLIC_VITALIS_PRESCREEN_URL` o fallback `NEXT_PUBLIC_APP_URL` + `/onboarding`).

Plantilla opcional de recordatorio de visita: **`VITALIS_WA_TEMPLATE_VISIT_REMINDER`** (default `vitalis_visit_reminder_24h`); creala y apróbala en Meta con el número de variables que uses en el código (hoy 2: nombre + link).

## Variables de entorno (Cloudflare / producción)

En **Settings** → **Environment Variables**: marcá **Encrypt** en secretos.

| Variable | Ejemplo | Notas |
|----------|---------|--------|
| `WHATSAPP_PHONE_NUMBER_ID` | `123456789012345` | ID del número en WhatsApp Cloud API |
| `WHATSAPP_ACCESS_TOKEN` | `EAAxxxxx…` | Token de la app Meta |
| `CRON_SECRET` | (aleatorio largo) | Debe coincidir con header `x-cron-secret` del cron |
| `NEXT_PUBLIC_APP_URL` | `https://tudominio.com` | Base pública; también usada como fallback del link de prescreen |
| `VITALIS_PRESCREEN_URL` | `https://tudominio.com/onboarding` | **Recomendado**: URL canónica del prescreen |
| `VITALIS_WA_TEMPLATE_WELCOME` | `vitalis_welcome_prescreen` | Opcional si usás otro nombre aprobado |
| `VITALIS_WA_TEMPLATE_VISIT_REMINDER` | `vitalis_visit_reminder_24h` | Opcional |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` | Servidor (intake/cron vía `serviceClient` donde aplique) |
| `RESEND_API_KEY` / `RESEND_FROM` | — | Si la cadencia envía **email** al lead |

Intake B2C público: **`INTAKE_WEBHOOK_SECRET`** + header **`x-intake-secret`** en `POST /api/vitalis/b2c-intake`. Intake unificado Meta/form: `POST /api/vitalis/intake`.

Lista ampliada: [`.env.example`](../.env.example), [`CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md).

## Deploy (Pages)

```bash
npx wrangler pages deploy
```

(Ajustá según tu build OpenNext / salida; ver [`wrangler.toml`](../wrangler.toml).)

## Checklist rápido (~5 min)

| Paso | Acción | Estado |
|------|--------|--------|
| 1 | Supabase: ejecutar SQL Vitalis B2C (`40_vitalis_b2c_consent_funnel.sql`, `41_communications_log_patient_lead.sql`) y migraciones previas (`01`, `06`, `17`, `39`) | ⬜ |
| 2 | Código: `lib/vitalis/intake-engine.ts` + `POST /api/vitalis/b2c-intake` | ⬜ |
| 3 | Código: `lib/vitalis/cadence-b2c.ts` + `POST/GET /api/vitalis/cadence/tick` | ⬜ |
| 4 | UI: pipeline `/vitalis`, ficha `/vitalis/patients/[id]`, QuickLog + timeline | ⬜ |
| 5 | Cloudflare: cron cada 30 min → `/api/vitalis/cadence/tick` + `x-cron-secret` | ⬜ |
| 6 | Meta: plantilla aprobada + variables alineadas al código | ⬜ |
| 7 | Cloudflare: variables de entorno (tabla arriba) | ⬜ |
| 8 | Deploy producción | ⬜ |
| 9 | Prueba: `POST /api/vitalis/b2c-intake` con JSON válido (`B2CLeadInput`) → ver lead en pipeline; tras cron, revisar envíos / logs (sin spam en producción hasta validar) | ⬜ |

**Nota:** la ruta de ingest B2C en el repo es **`/api/vitalis/b2c-intake`**, no `/api/vitalis/leads/ingest`.

## Producción, cumplimiento y límites del código actual

| Aspecto | En repo hoy |
|---------|----------------|
| Consentimiento | `ingestB2CLead` exige datos + al menos un canal; filas en `vitalis_consent_log` con IP/UA opcionales. **STOP** debe cumplirse a nivel operativo/plantilla Meta y políticas locales. |
| Anti-spam cadencia | Pausa 48h si hay inbound en **`whatsapp_inbound_messages`** o **`communications_log`** (`direction = inbound`, `patient_lead_id`). **No** hay aún “1 mensaje por día por lead” en código: mejora futura. |
| Deduplicación intake | Teléfono/email normalizados (`phone_normalized` / `email_normalized` en `patient_leads`). |
| Navigators | RPC `assign_navigator_round_robin`; UI muestra nombre si RLS permite leer `user_profiles`. |
| PHI en logs | `communications_log.body` puede contener texto libre: **evitá** datos clínicos innecesarios; usá notas operativas. `vitalis_consent_log` es auditoría de consentimiento. |
| Rendimiento cadencia | La query actual trae **todas** las filas no archivadas en etapas de cadencia (orden `updated_at`); no hay límite ni batch de 50. Si el volumen crece, añadí `.limit` + paginación o procesamiento por lotes en SQL/worker. |
| Índices | Ver `40_vitalis_b2c_consent_funnel.sql` y existentes en `patient_leads`. |

## Qué incluye el módulo Vitalis B2C en este repo

- Captación multi-fuente vía intake (`b2c-intake` + intake unificado).
- Dedup y flags de consentimiento; log auditado; asignación round-robin (post-migración).
- Cadencia automatizada (WhatsApp plantilla / email) + tareas en `action_items`; cron dedicado.
- Pipeline filtrable y ficha de paciente con QuickLog y timeline sobre `communications_log.patient_lead_id` (tras migración `41`).
