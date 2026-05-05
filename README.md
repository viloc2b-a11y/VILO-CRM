# VILO CRM

Operational CRM for **Vilo Research Group** (B2B pipeline) and **Vitalis** (B2C patient leads). Single Next.js app with two pipelines, tasks, contacts, sponsor analytics, **Supabase Auth** (login + roles), an admin panel, and a public intake endpoint.

**Repository:** [github.com/viloc2b-a11y/VILO-CRM](https://github.com/viloc2b-a11y/VILO-CRM)

## Stack

- **Next.js 15** (App Router), React 19, TypeScript, Tailwind CSS
- **Supabase** — Postgres for CRM entities and sponsor views; [`@supabase/ssr`](https://supabase.com/docs/guides/auth/server-side/nextjs) for browser/server clients, [`@supabase/supabase-js`](https://supabase.com/docs/reference/javascript/introduction) for the server-only service client
- **Zustand** — UI and client cache; **`localStorage`** only for `sidebarCollapsed` (CRM rows are loaded from Supabase, not persisted in the browser)
- **[`lucide-react`](https://lucide.dev/)** — Icons (e.g. [`components/dashboard/Dashboard.tsx`](./components/dashboard/Dashboard.tsx) Documents section)
- **Auth** — [`middleware.ts`](./middleware.ts) protects app routes; [`app/login/page.tsx`](./app/login/page.tsx); profiles and activity log in [`supabase/05_auth_rbac_activity.sql`](./supabase/05_auth_rbac_activity.sql) (run in Supabase after `01`–`03`)

## Environment

Copy [`.env.example`](./.env.example) to `.env.local` and fill in:

| Variable | Where it runs | Purpose |
|----------|----------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — API routes | Bypasses RLS for dashboard, reports, cron, `patient_leads` POST; never expose to the browser |
| `CRON_SECRET` | Server | Optional. If set, `POST`/`GET` [`/api/cron/check-automations`](./app/api/cron/check-automations/route.ts) requires `Authorization: Bearer <secret>` or `x-cron-secret: <secret>` |

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
npm start
```

## Routes (App)

| Path | Description |
|------|-------------|
| `/login` | Sign in (email/password); unauthenticated users are redirected here |
| `/` | Home — operational **Dashboard** (requires auth; Vilo / Vitalis metrics, pending tasks, **Documents** card with links under `/docs/…`) |
| `/admin` | **Admin only** — team members, roles, activity log (`user_profiles` + `activity_log`); pestaña **Agents** (migración 25) |
| `/action-center` | Action Center — `action_items`, métricas, panel de agentes (admins) |
| `/vilo` | B2B opportunity pipeline |
| `/vilo/pipeline` | Kanban “abierto” (sin Activated / Closed Lost / Nurture en el fetch inicial) |
| `/vilo/contacts/[id]` | Timeline de `communications_log` para el contacto (enlace **Timeline** en `/contacts`) |
| `/vitalis` | B2C patient leads (pipeline + ficha `/vitalis/patients/[id]`); deploy, cron Cloudflare y plantillas WhatsApp: [`docs/VITALIS_B2C_DEPLOY_CHECKLIST.md`](./docs/VITALIS_B2C_DEPLOY_CHECKLIST.md) |
| `/hazlo` | HazloAsíYa — pipeline de `submissions` + métricas (`v_hazlo_metrics`) |
| `/analytics` | ROI / CAC por campaña (`v_campaign_roi_metrics`); checklist: [`docs/ANALYTICS_DEPLOY_CHECKLIST.md`](./docs/ANALYTICS_DEPLOY_CHECKLIST.md) |
| `/contacts` | Organizations + contacts (Vilo) |
| `/tasks` | Task list |
| `/intake` | Lead capture (posts to API) |
| `/dashboard/sponsor` | Sponsor metrics (fetches `/api/dashboard` + `/api/reports/sponsor`, refreshes every 60s) |

## API routes

Server handlers use **`serviceClient`** from [`lib/supabase/service-role.ts`](./lib/supabase/service-role.ts) (not the anon key in the browser).

| Route | Role |
|-------|------|
| `POST /api/patient_leads` | Public intake → inserts `patient_leads` (follow-up task is created by DB trigger `trg_new_lead_task`, not duplicated in this route) |
| `GET /api/dashboard` | Sponsor panel: enrollment / execution views + pipeline + tasks + screen fails |
| `GET /api/reports/sponsor` | Weekly sponsor report + sources + screen-fail snippet + bilingual `sponsor_message` |
| `GET /api/reports/sponsor/pdf` | PDF auto-generado para sponsors/CROs ([`docs/SPONSOR_REPORT_PDF.md`](./docs/SPONSOR_REPORT_PDF.md)) |
| `PATCH /api/tasks/[id]` | Toggle `done` on a task row |
| `POST` / `GET /api/cron/check-automations` | Automation checks (Vercel cron; see [`vercel.json`](./vercel.json)) |
| `POST` / `GET /api/vilo/outreach-cadence/tick` | Cadencia B2B (Resend + `action_items`); `x-cron-secret` si `CRON_SECRET` está definido — Cloudflare: [`docs/CLOUDFLARE_CRONS.md`](./docs/CLOUDFLARE_CRONS.md) |
| `POST /api/vilo/intake-b2b` | Ingesta B2B (`ingestB2BLead`); `x-vilo-api-secret` si `VILO_API_SECRET` está definido — checklist: [`docs/B2B_VILO_DEPLOY_CHECKLIST.md`](./docs/B2B_VILO_DEPLOY_CHECKLIST.md) |
| `POST /api/vilo/email-tracking` | Webhook Resend (opens/clicks → `communications_log` + tarea engagement); `RESEND_WEBHOOK_SECRET` + header `x-resend-secret` o `x-webhook-secret` |
| `GET /api/vilo/contacts/[id]/communications` | JSON: últimos 50 `communications_log` del contacto (sesión Supabase + RLS) |
| `POST /api/vilo/communications/log` | Insert manual en `communications_log` (Quick-Log; body: `contactId`, `orgId` / `companyId`, `opportunityId` / `oppId`, `channel`, `type`, `body`, `direction`) |
| `POST /api/vitalis/b2c-intake` | Ingesta B2C (`ingestB2CLead`); header `x-intake-secret` si `INTAKE_WEBHOOK_SECRET` — [`docs/VITALIS_B2C_DEPLOY_CHECKLIST.md`](./docs/VITALIS_B2C_DEPLOY_CHECKLIST.md) |
| `POST` / `GET /api/vitalis/cadence/tick` | Cadencia B2C Vitalis (WhatsApp/email + tareas); `x-cron-secret` si `CRON_SECRET` |
| `POST /api/vitalis/communications/log` | Quick-Log paciente → `communications_log.patient_lead_id` (sesión + RLS Vitalis; requiere SQL `41`) |
| `POST /api/activity` | Authenticated CRM actions → `activity_log` (used by the store; non-fatal errors still return 200) |
| `POST /api/admin/create-user` | **Admin only** — creates Auth user + profile (service role) |

Checklists deploy: [`docs/B2B_VILO_DEPLOY_CHECKLIST.md`](./docs/B2B_VILO_DEPLOY_CHECKLIST.md) (ingesta + pipeline + cadencia), [`docs/VITALIS_B2C_DEPLOY_CHECKLIST.md`](./docs/VITALIS_B2C_DEPLOY_CHECKLIST.md) (Vitalis B2C: SQL, intake, cadencia, WhatsApp, Cloudflare), [`docs/COMMUNICATIONS_TRACKING_DEPLOY_CHECKLIST.md`](./docs/COMMUNICATIONS_TRACKING_DEPLOY_CHECKLIST.md) (`communications_log`, Resend, Quick-Log), [`docs/CLOUDFLARE_CRONS.md`](./docs/CLOUDFLARE_CRONS.md).

## Flujo HazloAsíYa (Square → webhooks → agentes)

Resumen alineado al código actual (`app/api/hazlo/`, `lib/hazlo/`, triggers en `supabase/20_*` y `22_*`):

1. El usuario paga en el funnel (sitio Hazlo) → **Square** procesa el cobro.
2. Square envía **`POST`** a [`/api/hazlo/square/webhook`](./app/api/hazlo/square/webhook/route.ts) con eventos típicamente **`payment.created`** / **`payment.updated`**. Los rechazos suelen llegar como **`payment.updated`** con `payment.status` **FAILED** / **CANCELED**, no como un tipo `payment.failed` separado en el catálogo.
3. El handler valida la firma (**`x-square-hmacsha256-signature`**, `SQUARE_WEBHOOK_NOTIFICATION_URL` + cuerpo) y la **idempotencia** (`webhook_events` vía `register_webhook_event`).
4. **Pago fallido:** se actualiza `submissions` (`payment_status`, `payment_recovery_state`, etc.); puede enviarse correo D0 de recovery; el trigger **`trg_submissions_action_center`** sincroniza **`action_items`** con siguiente paso del estilo **«Resolver fallo de pago»** (y título de trámite). Casos **fraud_block** pueden crear una tarea de soporte adicional desde código.
5. **Pago completado** (`COMPLETED`): se marca **`paid`** / **`Paid`**; el trigger genera la tarea con **«Entregar PDF + upsell (pago confirmado)»**. El **Growth Agent (+7 días)** opera cuando el expediente está en **`PDF delivered`** con **`pdf_delivered_at`** poblado (la entrega del PDF puede ser un paso posterior al webhook de pago, según tu operación).
6. **Recovery Agent** — cron [`/api/hazlo/recovery/tick`](./app/api/hazlo/recovery/tick/route.ts) (programá frecuencia en Vercel u otro): secuencia por días (email, WhatsApp, llamada, etc.) según `lib/hazlo/recovery/run.ts`.
7. **Growth Agent** — cron [`/api/hazlo/growth/tick`](./app/api/hazlo/growth/tick/route.ts): ofertas complementarias para filas con PDF entregado hace **≥7 días**; la periodicidad del cron es la que configures (**diaria**, semanal, etc.).
8. **Action Center** — todas las tareas **`action_items`** con filtros por UE (p. ej. `?bu=hazloasiya`).
9. **WhatsApp (Meta)** — Recovery día 2 y Growth pueden usar plantillas Cloud API: [`docs/WHATSAPP_HAZLO_AGENTS.md`](./docs/WHATSAPP_HAZLO_AGENTS.md).
9. **UI `/hazlo`** — vista dedicada del pipeline; implementación en `app/(dashboard)/hazlo/page.tsx`.

Detalle de webhooks y variables: [`app/api/hazlo/README.md`](./app/api/hazlo/README.md) y [`.env.example`](./.env.example).

## Project layout

| Path | Purpose |
|------|---------|
| `app/` | App Router pages + `app/api/*` |
| `components/` | UI, pipelines, [`dashboard/Dashboard.tsx`](./components/dashboard/Dashboard.tsx), sponsor dashboard, forms |
| `public/docs/` | **Optional.** Static `.docx` / `.pdf` files served at `/docs/<filename>` (create the folder and add files; links on the Dashboard open in a new tab) |
| `lib/store.ts` | Zustand store + async loaders/mutations calling `lib/db/*` |
| `lib/db/` | Thin modules: `vilo`, `vitalis`, `tasks`, `contacts`, `organizations`, `dashboard` (Supabase reads/writes) |
| `lib/supabase/` | `client.ts` (browser), `server.ts` (cookies), `service-role.ts`, mappers, types |
| `supabase/` | … **`08`–`10`** (`10` = `v_action_metrics`) |

## Database

Apply the SQL files **in order** in the [Supabase SQL editor](https://supabase.com/dashboard): ver orden completo en [`supabase/INTEGRATION.md`](./supabase/INTEGRATION.md) (**`01` … `25`** según necesites orchestrator, triage, agent control, Hazlo, Vitalis, etc.). Mínimo histórico: **`01` → `02` → `03` → `05` → `06` → `07` → `08`**. The Action Center reads **`v_action_center`** / **`action_items`**; **`08`** sincroniza etapas desde Vilo/Vitalis. Without **`05`**, login and `user_profiles` / `activity_log` will not match the app. After the first deploy, promote one user to `admin` in `user_profiles` (see [`supabase/INTEGRATION.md`](./supabase/INTEGRATION.md)).

More detail: [`supabase/INTEGRATION.md`](./supabase/INTEGRATION.md). Generated / hand-maintained table typings: [`lib/supabase/types.ts`](./lib/supabase/types.ts).

## Deploy en 3 pasos

### 1. Supabase

En el [SQL Editor](https://supabase.com/dashboard) del proyecto, ejecuta los scripts **en orden numérico** según [`supabase/INTEGRATION.md`](./supabase/INTEGRATION.md): desde **`01_schema.sql`** hasta **`25_agent_control.sql`** (y Edge Functions opcionales en `supabase/functions/`).

- El archivo [`supabase/migrations/001_viloos_schema.sql`](./supabase/migrations/001_viloos_schema.sql) es solo **referencia** para el árbol `migrations/`; **no** sustituye al resto. Tras aplicar los scripts, en **Database → Tables** deben existir, entre otras, `action_items`, `user_profiles`, `vilo_opportunities`, `patient_leads`, `agent_execution_logs` (tras la 25).

### 2. Next.js

```bash
npm install
cp .env.example .env.local   # completar variables (ver tabla «Environment» arriba)
npm run build
```

Dependencias ya previstas en el repo: `date-fns`, `zod`, `@supabase/supabase-js`, `@supabase/ssr`. Rutas relevantes del Action Center / agentes: [`app/action-center/`](./app/action-center/), [`app/api/action-center/`](./app/api/action-center/), [`lib/agents/`](./lib/agents/).

### 3. Vercel

```bash
vercel --prod
```

Configura en el proyecto Vercel (Settings → Environment Variables), como mínimo:

| Variable | Entorno | Notas |
|----------|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production / Preview | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production / Preview | Clave anónima (RLS activo en cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Production / Preview | **Solo uso servidor** (API routes, cron, `serviceClient`); nunca en el bundle del cliente |
| `CRON_SECRET` | Production | Recomendado: ticks bajo [`app/api/action-center/*/tick`](./app/api/action-center/) y otros cron exigen `x-cron-secret` si está definido |

Añade también las variables que uses (p. ej. Stripe, Resend, Twilio) según [`/.env.example`](./.env.example).

[`vercel.json`](./vercel.json) puede programar llamadas a cron; alinea el secreto con el header configurado.

**Cloudflare Pages:** los crons no van en `vercel.json`; variables y secretos en el Dashboard (**Encrypt**), no `.env.local` en producción. Guía: [`docs/CLOUDFLARE_CRONS.md`](./docs/CLOUDFLARE_CRONS.md) (**PASO 5** + crons). Vitalis B2C (plantillas WhatsApp, env, checklist): [`docs/VITALIS_B2C_DEPLOY_CHECKLIST.md`](./docs/VITALIS_B2C_DEPLOY_CHECKLIST.md).

---

## Notas de producción

- **Idempotencia:** Las tareas del Action Center son filas en **`action_items`**, no una tabla `tasks` genérica. El orchestrator en SQL (`23_orchestrator_agent.sql`) y el handler TS [`handleStateChange`](./lib/agents/state-change.ts) evitan duplicados comprobando `source` + `record_id` (y estados abiertos) antes de insertar.
- **RLS:** Políticas por **`business_unit`** y `user_profiles.allowed_business_units`; los agentes que escriben con **`SUPABASE_SERVICE_ROLE_KEY`** bypass RLS solo en rutas servidor.
- **Auditoría:** **`activity_log`** (acciones de usuario) y **`agent_execution_logs`** (migración **25**). No hay `audit_logs` ni trigger masivo estilo 21 CFR Part 11 en todas las tablas; para trazabilidad completa habría que extender triggers o usar Edge Functions con registro explícito.
- **Webhooks / agentes:** Las funciones en `lib/agents/` están pensadas para invocarse desde API routes o una **Supabase Edge Function** que, tras validar el payload, llame a [`handleStateChange`](./lib/agents/state-change.ts) u otros ticks con reintentos idempotentes.

---

## Deployment — resumen cron

- **Vercel:** [`vercel.json`](./vercel.json) programa `/api/cron/check-automations` (y podés añadir más paths ahí). Usá `CRON_SECRET` / `x-cron-secret` para restringir el acceso.
- **Cloudflare:** Cron Triggers en el Dashboard; ver [`docs/CLOUDFLARE_CRONS.md`](./docs/CLOUDFLARE_CRONS.md) (Hazlo validator/recovery/growth, **cadencia Vitalis B2C** `/api/vitalis/cadence/tick`, variables). Checklist Vitalis: [`docs/VITALIS_B2C_DEPLOY_CHECKLIST.md`](./docs/VITALIS_B2C_DEPLOY_CHECKLIST.md).
