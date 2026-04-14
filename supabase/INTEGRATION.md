# Supabase — VILO CRM

**Proyecto:** [ehxciiqxcolnqcohrbrx](https://supabase.com/dashboard/project/ehxciiqxcolnqcohrbrx) → SQL Editor.

**Schema v1.0:** enums (`org_type`, `priority_level`, `vilo_stage` con `Activated`, `opportunity_type`, `lead_source`, etc.), columnas `org_id` / `contact_id` / `linked_vilo_id` / `linked_vitalis_id`, tasks con `due_date` + `done` + `done_at`.

## Orden de ejecución

1. **[`01_schema.sql`](./01_schema.sql)** — esquema completo (enums, tablas, índices, vistas, triggers).
2. **[`02_rls.sql`](./02_rls.sql)** — RLS + `GRANT` para `authenticated` y vistas.

## Otros archivos

| Archivo | Uso |
|---------|-----|
| [`lib/supabase/types.ts`](../lib/supabase/types.ts) | Tipos `Database` + filas + joins sugeridos |
| [`lib/supabase/client.ts`](../lib/supabase/client.ts) | `createSupabaseBrowserClient()` |
| [`04_crud.ts`](./04_crud.ts) | Blueprint: orden de build, CRUD, auto-task, validaciones, Realtime |

## Variables de entorno

Copia [`.env.example`](../.env.example) a `.env.local` (URL y anon key del proyecto **ehxciiqxcolnqcohrbrx**).
