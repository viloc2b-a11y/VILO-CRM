# VILO CRM

Operational CRM for **Vilo Research Group** (B2B pipeline) and **Vitalis** (B2C patient leads). Built as a single Next.js app with two separate pipelines and a shared shell (dashboard, tasks).

**Repository:** [github.com/viloc2b-a11y/VILO-CRM](https://github.com/viloc2b-a11y/VILO-CRM)

## Stack

- Next.js 15 (App Router), TypeScript, Tailwind CSS
- Client state + persistence: Zustand + `localStorage` (key: `vilo-crm-v2`)

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm start
```

## Project layout

| Path | Purpose |
|------|---------|
| `app/` | Routes: `/`, `/vilo`, `/vitalis`, `/contacts`, `/tasks` |
| `components/` | UI, layout, pipeline screens |
| `lib/` | Types, constants, store, date helpers |

## Data note

This MVP stores data in the browser (`localStorage`). **Supabase:** run [`supabase/01_schema.sql`](./supabase/01_schema.sql) then [`supabase/02_rls.sql`](./supabase/02_rls.sql) in the [SQL editor](https://supabase.com/dashboard/project/ehxciiqxcolnqcohrbrx/sql/new). See [`supabase/INTEGRATION.md`](./supabase/INTEGRATION.md). Copy [`.env.example`](./.env.example) to `.env.local`. Types: [`lib/supabase/types.ts`](./lib/supabase/types.ts); client: [`lib/supabase/client.ts`](./lib/supabase/client.ts); blueprint: [`supabase/04_crud.ts`](./supabase/04_crud.ts).
