# Supabase — VILO CRM

**Project:** [ehxciiqxcolnqcohrbrx](https://supabase.com/dashboard/project/ehxciiqxcolnqcohrbrx) → SQL Editor.

**Schema v1.0:** enums (`org_type`, `priority_level`, `vilo_stage` including `Activated`, `opportunity_type`, `lead_source`, etc.), columns `org_id` / `contact_id` / `linked_vilo_id` / `linked_vitalis_id`, tasks with `due_date`, `done`, and `done_at`.

## Run order

**Automático (Windows):** con `psql` en PATH y la URI Postgres del proyecto (`Project Settings → Database → Connection string`), definí `DATABASE_URL` y ejecutá [`apply-schema.ps1`](./apply-schema.ps1) desde PowerShell (lista el orden de todos los `NN_*.sql`; opción `-IncludeBackfill` para `09_*.sql`).

1. **[`01_schema.sql`](./01_schema.sql)** — full schema (enums, tables, indexes, views, triggers).
2. **[`02_rls.sql`](./02_rls.sql)** — RLS + `GRANT` for `authenticated` and views.
3. **[`03_sponsor_dashboard.sql`](./03_sponsor_dashboard.sql)** — sponsor reporting views and related objects (if not already applied with your baseline).
4. **[`05_auth_rbac_activity.sql`](./05_auth_rbac_activity.sql)** — `user_profiles` (roles: `admin`, `bd`, `coordinator`, `viewer`), `activity_log`, RLS, `is_app_admin()`, trigger on `auth.users` to create a profile row. **Required** for `/login`, `/admin`, and sidebar identity.
5. **[`06_action_center_studies_ctms.sql`](./06_action_center_studies_ctms.sql)** — `allowed_business_units` on `user_profiles` (default: Vilo + Vitalis), **`studies`** + CTMS-lite tables (`study_sites`, `study_monitoring_visits`, `protocol_deviations`, `study_payments`), **`action_items`** (Action Center), `study_id` on `vilo_opportunities` / `patient_leads`, RLS helpers `user_can_access_bu` / `user_has_clinical_business_access`, and replacement of flat `team_all_*` policies so **Hazlo-only** accounts (BU = `hazloasiya` only) cannot read Vilo/Vitalis PHI. **Service role** API routes still bypass RLS.
6. **[`07_v_action_center_scale.sql`](./07_v_action_center_scale.sql)** — **`v_action_center`**: mismo esquema que `action_items` hoy (passthrough); más adelante sustituí el cuerpo por `UNION ALL` de fuentes normalizadas sin tocar la UI. **`v_action_center_metrics`**: `critical` + `pipeline_value` con **`security_invoker`** para que los agregados respeten RLS. **Trigger** en `vilo_opportunities`: al pasar a **`Negotiation`** (fase tipo “contracting” hasta que exista etapa explícita en el enum), inserta un `action_item` con `next_action = 'Revisar contrato'` si no hay uno abierto equivalente.

### Webhooks (opcional, además del trigger)

En **Supabase Dashboard → Database → Webhooks** podés publicar eventos `UPDATE` sobre `vilo_opportunities` (u otras tablas) hacia una Edge Function o URL que inserte en `action_items` con la misma lógica. El trigger SQL ya cubre el caso “Negociación” en el MVP; los webhooks sirven para integraciones externas o reglas más complejas sin duplicar la pantalla Action Center.

### IA (después)

Con **500+** `action_items` / notas consistentes, conviene empezar por **resumen de notas** o **sugerencia de siguiente acción** vía LLM; no hace falta antes.

7. **[`08_sync_action_items_crm.sql`](./08_sync_action_items_crm.sql)** — Trigger **`sync_action_items_from_crm`** en **`vilo_opportunities`** (cambio de `status`) y **`patient_leads`** (cambio de `current_stage`): mantiene **una** fila auto por registro (`source` `trigger:sync:vilo_opportunity:*` / `trigger:sync:patient_lead:*`), `due_date` +24h, `owner_id` null. **No** uses política tipo `allow_all_authenticated` sobre `action_items`: anula la segregación Hazlo/clínico; el `SECURITY DEFINER` cubre inserciones “de sistema”. Si ya aplicaste un `07` antiguo con trigger solo-Negociación, **`08`** lo elimina. Hazlo: comentario al final del archivo hasta existir tabla.

8. **[`09_backfill_action_items.sql`](./09_backfill_action_items.sql)** (opcional, **una vez**) — Rellena `action_items` desde **`vilo_opportunities`** y **`patient_leads`** sin duplicar (`LEFT JOIN` / `a.id IS NULL`). Excluye oportunidades archivadas o en **Closed Lost**. **`source`**: `migration:backfill:*` (distinto de `trigger:sync:*`; al cambiar etapa, el trigger puede añadir otra fila — podés deduplicar luego o borrar migración tras estabilizar). Hazlo: bloque `DO` solo si existe **`public.submissions`**; si falla por columnas, ajustá el `SELECT` al esquema real.

9. **[`10_v_action_metrics.sql`](./10_v_action_metrics.sql)** — Vista **`v_action_metrics`**: filas `total_pipeline_value` (suma `value_usd` en `pending`), `overdue_count` (abiertos con `due_date` &lt; ahora UTC; no hay columna `overdue`), conteos por BU (`vilo_tasks`, `vitalis_tasks`, `hazloasiya_tasks`) en `pending`/`in_progress`. **`security_invoker`** + `GRANT SELECT` a `authenticated`.

After creating the first user in **Authentication → Users**, set an admin:

```sql
UPDATE user_profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
```

## Other files

| File | Purpose |
|------|---------|
| [`lib/supabase/types.ts`](../lib/supabase/types.ts) | `Database` types + row shapes + suggested joins |
| [`lib/supabase/client.ts`](../lib/supabase/client.ts) | Browser client: `createClient()` from `@supabase/ssr` |
| [`04_crud.ts`](./04_crud.ts) | Blueprint: build order, CRUD patterns, auto-task notes, validation, Realtime ideas |

## Edge Function: `notify-due` (Resend + ítems vencidos)

Código: [`functions/notify-due/index.ts`](./functions/notify-due/index.ts).

1. **Secrets** (Dashboard → Edge Functions → notify-due → Secrets): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `OPS_EMAIL`, opcional `RESEND_FROM`, `APP_URL` (URL pública del CRM), `CRON_SECRET` (recomendado).
2. Deploy: `supabase functions deploy notify-due` (con CLI vinculado al proyecto).
3. **Cron**: Supabase → **Edge Functions → Schedules** o invocación `POST`/`GET` a la URL de la función con header `x-cron-secret: <CRON_SECRET>` si configuraste el secret.
4. La función **no** hace `PATCH` a `status = overdue`: en este CRM el vencimiento es **derivado** (`due_date` + estado abierto). Solo **lista** y **envía correo**.

[`config.toml`](./config.toml) tiene `verify_jwt = false` para esta función (autenticación vía `CRON_SECRET`).

## Edge Function: `backup-daily` (CSV → Storage)

Código: [`functions/backup-daily/index.ts`](./functions/backup-daily/index.ts).

1. **Bucket:** ejecutá [`14_storage_backups_bucket.sql`](./14_storage_backups_bucket.sql) o creá en el Dashboard **Storage → New bucket** el bucket **`backups`** (privado).
2. **Deploy** (desde la raíz del repo, con [CLI](https://supabase.com/docs/guides/cli) autenticada: `supabase login`):

   ```bash
   npx supabase functions deploy backup-daily --project-ref ehxciiqxcolnqcohrbrx
   ```

   Sustituí `ehxciiqxcolnqcohrbrx` si usás otro proyecto. Si el CLI falla al leer **`.env.local`**, comprobá que el archivo **no tenga BOM UTF-8** (el BOM suele provocar `unexpected character '»' in variable name`).
3. **Cron (2:00 diario):** en el Dashboard, según tu plan: **Database → Cron Jobs** o **Edge Functions → Schedules**. Programá **`0 2 * * *`** (2:00 UTC) para invocar **`backup-daily`** en **Production**. Si configuraste **`CRON_SECRET`** en los secrets de la función, el job debe enviar el header **`x-cron-secret`** con ese valor (igual que `notify-due`).
4. **Resultado:** archivos nuevos en **Storage → backups** (`viloos_backup_*.csv`); la función borra objetos con antigüedad **> 30 días** según `created_at` del listado.

[`config.toml`](./config.toml) incluye `[functions.backup-daily]` con `verify_jwt = false`.

## Edge Function: `nurture-agent` (secuencias email Vilo Research)

- SQL: [`15_nurture_agent.sql`](./15_nurture_agent.sql) — columnas `nurture_*` en `vilo_opportunities`, tabla `nurture_email_events`, trigger que limpia reglas al cambiar `status`.
- Código: [`functions/nurture-agent/index.ts`](./functions/nurture-agent/index.ts) — reglas alineadas a `vilo_stage` (p. ej. `Outreach Sent` en lugar de “Contacted”, `Negotiation` en lugar de “Budget negotiation”).
- Secrets: `RESEND_API_KEY`, `RESEND_FROM`, `CALENDAR_BOOKING_URL` (opcional), `OPS_EMAIL` si faltan emails en la oportunidad; `NURTURE_ACTIVITY_USER_ID` + `NURTURE_ACTIVITY_USER_NAME` para insertar en `activity_log`; `CRON_SECRET` opcional.
- Deploy: `npx supabase functions deploy nurture-agent --project-ref <ref>`. Programar cron (p. ej. cada 12 h) con header `x-cron-secret` si aplica.

[`config.toml`](./config.toml): `[functions.nurture-agent]` → `verify_jwt = false`.

## Edge Function: `proposal-agent` (borrador PDF en Negociación)

- SQL: [`16_proposal_agent.sql`](./16_proposal_agent.sql) — columnas `proposal_pdf_*`, bucket Storage **`proposals`**.
- Código: [`functions/proposal-agent/index.ts`](./functions/proposal-agent/index.ts) — oportunidades con **`status = 'Negotiation'`** (equiv. “Budget negotiation”) y sin PDF previo; genera PDF con **pdf-lib**, sube a **`proposals/{org_id|opp_id}_{timestamp}.pdf`**, **append** en **`notes`** con enlace firmado (7 días) o ruta, **`action_items`** “Revisar proposal…”.
- Secrets: `APP_URL` (logo por defecto `{APP_URL}/vilo-logo.png`) o **`PROPOSAL_LOGO_URL`**; `CRON_SECRET` opcional.
- Deploy: `npx supabase functions deploy proposal-agent --project-ref <ref>`. Cron recomendado 1–6 h o invocación al entrar en Negociación (webhook).
- **Google Docs**: no incluido en MVP (solo PDF). Integración Docs requiere OAuth aparte.

[`config.toml`](./config.toml): `[functions.proposal-agent]` → `verify_jwt = false`.

## Vitalis Intake Agent (multi-canal → `patient_leads`)

- SQL: [`17_vitalis_intake.sql`](./17_vitalis_intake.sql) — `consent_to_contact`, `intake_attribution` (UTM + referral + toques), `last_intake_at`, columnas generadas `phone_normalized` / `email_normalized` para dedup.
- API: **`POST /api/vitalis/intake`** con JSON unificado y header **`x-intake-secret: INTAKE_WEBHOOK_SECRET`** (recomendado en producción). **`GET`** opcional para verificación Meta (`META_INTAKE_VERIFY_TOKEN` + `hub.*` query params).
- **`POST /api/patient_leads`** reutiliza la misma lógica (`applyVitalisIntake`) para el formulario web (sin secret).
- Dedup: mismo **`phone_normalized`** o **`email_normalized`** → actualiza **`last_intake_at`**, merge de **`intake_attribution`**, append en **`notes`**, **`consent_to_contact`** OR si el nuevo evento trae consentimiento.
- Tarea **«Contactar en &lt;2h»**: la sigue creando el trigger **`08_sync_action_items_crm`** en **INSERT** de `patient_leads` (no en solo UPDATE de duplicado).
- Notificaciones: Slack (`VITALIS_INTAKE_SLACK_WEBHOOK_URL`) y/o email (`VITALIS_NAVIGATOR_EMAIL` + `RESEND_*`). WhatsApp auto-reply: `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`.
- Variables de entorno: ver [`.env.example`](../.env.example).

## Vitalis B2C — consentimiento, funnel, timeline paciente

- SQL: [`40_vitalis_b2c_consent_funnel.sql`](./40_vitalis_b2c_consent_funnel.sql) (tras **17**, **06**, **01**) — columnas `utm_*`, `consent_flags`, `last_contact_channel`, `assigned_navigator`, `vitalis_consent_log`, vista funnel, RPC `assign_navigator_round_robin`.
- SQL: [`41_communications_log_patient_lead.sql`](./41_communications_log_patient_lead.sql) (tras **39**, **01**) — `communications_log.patient_lead_id`, canal `sms`, RLS combinada Vitalis + Vilo B2B.
- API: **`POST /api/vitalis/b2c-intake`** — `ingestB2CLead` (consentimiento estricto, dedup, consent log); header **`x-intake-secret`** si `INTAKE_WEBHOOK_SECRET`.
- API: **`POST` / `GET /api/vitalis/cadence/tick`** — [`runVitalisCadenceTick`](../lib/vitalis/cadence-b2c.ts); **`x-cron-secret`** si `CRON_SECRET`.
- API: **`POST /api/vitalis/communications/log`** — Quick-Log en ficha `/vitalis/patients/[id]`.
- Checklist deploy (Cloudflare cron, plantillas Meta, env): [`docs/VITALIS_B2C_DEPLOY_CHECKLIST.md`](../docs/VITALIS_B2C_DEPLOY_CHECKLIST.md).

## Qualifier Agent (prescreening automático)

- SQL: [`18_qualifier_agent.sql`](./18_qualifier_agent.sql) — `prescreen_*` en `patient_leads`.
- Etapas CRM: disparo **`New Lead`** o **`Responded`** (equiv. “Reached”); tras invitación **`Prescreen Started`**; resultado **`Prequalified`** (califica) o **`Screen Fail`** + `screen_fail_reason`.
- **`POST /api/vitalis/qualifier/invite`**: body `{ "lead_id" }` o batch vacío; header opcional `x-qualifier-secret` (`QUALIFIER_CRON_SECRET`). Requiere env **`QUALIFIER_FORM_URL_*`**.
- **`POST /api/vitalis/qualifier/webhook`**: recibe `patient_lead_id` + `answers` (booleans / `distance_km` / `hard_exclusion`); header `x-qualifier-webhook-secret` si configurás `QUALIFIER_WEBHOOK_SECRET`. Umbral MVP: **70** y sin exclusiones.
- Plantillas y keywords: [`lib/vitalis/qualifier-templates.ts`](../lib/vitalis/qualifier-templates.ts). Tarea “Agendar visita”: la genera **`08_sync_action_items_crm`** al pasar a **`Prequalified`**.

## HazloAsíYa — WhatsApp Cloud API (Recovery / Growth)

- Guía Meta + plantillas + env: [`docs/WHATSAPP_HAZLO_AGENTS.md`](../docs/WHATSAPP_HAZLO_AGENTS.md).
- **[`34_whatsapp_inbound_messages.sql`](./34_whatsapp_inbound_messages.sql)** (tras **20** y **01**): mensajes entrantes Meta; FK opcional a `submissions` y `patient_leads`; RLS lectura admin; `normalize_phone()` para matchear dígitos. Inserts vía API con **service role** (webhook inbound pendiente en app).

## HazloAsíYa (submissions + validator SQL)

- **[`20_hazlo_submissions_validator.sql`](./20_hazlo_submissions_validator.sql)** — `submissions`, bucket **`hazlo-docs`**, RLS storage, trigger **`sync_action_items_from_crm`** para Hazlo.
- **[`31_hazlo_validator_sql_support.sql`](./31_hazlo_validator_sql_support.sql)** (tras **20** y migraciones Hazlo que añadan columnas) — `validation_confidence`, `validation_errors`, `extracted_data`; trigger **`trg_submissions_validation_low_confidence`** (tarea `source = hazlo:validator:low_confidence` si confianza &lt; 0.85); vista **`v_hazlo_review_queue`**; RPC **`mark_submission_reviewed`**. No aplica el SQL genérico con `hazlo_users` / `agent_trigger` (no existen en este esquema).
- **[`32_campaign_roi_metrics.sql`](./32_campaign_roi_metrics.sql)** (tras **23**) — columnas opcionales: `marketing_campaigns.lifetime_spend`, `submissions.source_campaign`, `vilo_opportunities.marketing_campaign_id`; vista **`v_campaign_roi_metrics`** (Vitalis por `patient_leads.source_campaign` = nombre de campaña, Hazlo/Vilo por esas columnas). **`security_invoker`**: respeta RLS. Ajustá en el SQL el literal **49** (USD por pago Hazlo) y la ponderación **0.5** del pipeline Vilo si tu negocio usa otros valores.
- **PASO 5 — Atribución / tracking:** [`docs/MARKETING_ATTRIBUTION.md`](../docs/MARKETING_ATTRIBUTION.md) (alinear `source_campaign` con `marketing_campaigns.name`, UTM + mapa en [`lib/vitalis/campaign-aliases.ts`](../lib/vitalis/campaign-aliases.ts)).
- **[`33_campaign_roi_utm_join.sql`](./33_campaign_roi_utm_join.sql)** (tras **32**) — columnas `utm_source` / `utm_campaign` en `marketing_campaigns` y `submissions`; vista **`v_campaign_roi_metrics`** atribuye Vitalis por `intake_attribution` o Hazlo por columnas UTM cuando el par está definido en la campaña; si no, sigue el join por `name` / `source_campaign`.
- **[`42_communications_log_submission.sql`](./42_communications_log_submission.sql)** (tras **41**, **06**, **`submissions`**) — `communications_log.submission_id`, RLS Hazlo (`hazloasiya`) con filas solo por expediente; Vitalis/Vilo siguen con exclusividad de contexto. API: **`POST /api/hazlo/communications/log`**; ficha: **`/hazlo/submissions/[id]`** (timeline + quick-log).
- Checklist deploy UI **`/analytics`**: [`docs/ANALYTICS_DEPLOY_CHECKLIST.md`](../docs/ANALYTICS_DEPLOY_CHECKLIST.md).

## Environment variables

Copy [`.env.example`](../.env.example) to `.env.local` and set the URL and anon key for project **ehxciiqxcolnqcohrbrx** (plus `SUPABASE_SERVICE_ROLE_KEY` for server API routes).
