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
| `/admin` | **Admin only** — team members, roles, activity log (`user_profiles` + `activity_log`) |
| `/vilo` | B2B opportunity pipeline |
| `/vitalis` | B2C patient leads |
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
| `PATCH /api/tasks/[id]` | Toggle `done` on a task row |
| `POST` / `GET /api/cron/check-automations` | Automation checks (Vercel cron; see [`vercel.json`](./vercel.json)) |
| `POST /api/activity` | Authenticated CRM actions → `activity_log` (used by the store; non-fatal errors still return 200) |
| `POST /api/admin/create-user` | **Admin only** — creates Auth user + profile (service role) |

## Project layout

| Path | Purpose |
|------|---------|
| `app/` | App Router pages + `app/api/*` |
| `components/` | UI, pipelines, [`dashboard/Dashboard.tsx`](./components/dashboard/Dashboard.tsx), sponsor dashboard, forms |
| `public/docs/` | **Optional.** Static `.docx` / `.pdf` files served at `/docs/<filename>` (create the folder and add files; links on the Dashboard open in a new tab) |
| `lib/store.ts` | Zustand store + async loaders/mutations calling `lib/db/*` |
| `lib/db/` | Thin modules: `vilo`, `vitalis`, `tasks`, `contacts`, `organizations`, `dashboard` (Supabase reads/writes) |
| `lib/supabase/` | `client.ts` (browser), `server.ts` (cookies), `service-role.ts`, mappers, types |
| `supabase/` | Reference SQL: `01_schema.sql`, `02_rls.sql`, `03_sponsor_dashboard.sql`, **`05_auth_rbac_activity.sql`** (profiles + activity + trigger) |

## Database

Apply the SQL files **in order** in the [Supabase SQL editor](https://supabase.com/dashboard): **`01` → `02` → `03` → `05`**. Without **`05`**, login and `user_profiles` / `activity_log` will not match the app. After the first deploy, promote one user to `admin` in `user_profiles` (see [`supabase/INTEGRATION.md`](./supabase/INTEGRATION.md)).

More detail: [`supabase/INTEGRATION.md`](./supabase/INTEGRATION.md). Generated / hand-maintained table typings: [`lib/supabase/types.ts`](./lib/supabase/types.ts).

## Deployment (Vercel)

[`vercel.json`](./vercel.json) schedules hourly calls to `/api/cron/check-automations`. Set `CRON_SECRET` (and the same value in the cron job headers if you customize auth) so only your infrastructure can hit that endpoint.
