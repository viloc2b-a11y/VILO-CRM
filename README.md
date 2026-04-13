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

This MVP stores data in the browser (`localStorage`). For team-wide or backed-up data, plan a migration to a database API (for example Supabase or Postgres) behind the same UI.
