# Supabase — VILO CRM

**Project:** [ehxciiqxcolnqcohrbrx](https://supabase.com/dashboard/project/ehxciiqxcolnqcohrbrx) → SQL Editor.

**Schema v1.0:** enums (`org_type`, `priority_level`, `vilo_stage` including `Activated`, `opportunity_type`, `lead_source`, etc.), columns `org_id` / `contact_id` / `linked_vilo_id` / `linked_vitalis_id`, tasks with `due_date`, `done`, and `done_at`.

## Run order

1. **[`01_schema.sql`](./01_schema.sql)** — full schema (enums, tables, indexes, views, triggers).
2. **[`02_rls.sql`](./02_rls.sql)** — RLS + `GRANT` for `authenticated` and views.
3. **[`03_sponsor_dashboard.sql`](./03_sponsor_dashboard.sql)** — sponsor reporting views and related objects (if not already applied with your baseline).
4. **[`05_auth_rbac_activity.sql`](./05_auth_rbac_activity.sql)** — `user_profiles` (roles: `admin`, `bd`, `coordinator`, `viewer`), `activity_log`, RLS, `is_app_admin()`, trigger on `auth.users` to create a profile row. **Required** for `/login`, `/admin`, and sidebar identity.

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

## Environment variables

Copy [`.env.example`](../.env.example) to `.env.local` and set the URL and anon key for project **ehxciiqxcolnqcohrbrx** (plus `SUPABASE_SERVICE_ROLE_KEY` for server API routes).
