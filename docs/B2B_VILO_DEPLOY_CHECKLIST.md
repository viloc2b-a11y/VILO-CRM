# Checklist deploy — Vilo Research B2B (~5 min de ejecución + verificación)

Referencias: [`supabase/38_vilo_b2b_forecast.sql`](../supabase/38_vilo_b2b_forecast.sql), [`lib/vilo/intake-enrich.ts`](../lib/vilo/intake-enrich.ts), [`lib/vilo/outreach-cadence.ts`](../lib/vilo/outreach-cadence.ts), [`docs/CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md).

| Paso | Acción | Estado |
|------|--------|--------|
| 1 | **SQL B2B + forecasting** — Supabase SQL Editor → ejecutar [`38_vilo_b2b_forecast.sql`](../supabase/38_vilo_b2b_forecast.sql) (después de `01_schema` / tablas CRM). | ⬜ |
| 2 | **Ingesta B2B** — Código: [`lib/vilo/intake-enrich.ts`](../lib/vilo/intake-enrich.ts). API: **`POST`** [`/api/vilo/intake-b2b`](../app/api/vilo/intake-b2b/route.ts) (header opcional `x-vilo-api-secret` si definís `VILO_API_SECRET`). | ⬜ |
| 3 | **Pipeline Kanban** — [`app/(dashboard)/vilo/pipeline/page.tsx`](../app/(dashboard)/vilo/pipeline/page.tsx) + [`KanbanBoard`](../app/(dashboard)/vilo/pipeline/components/KanbanBoard.tsx). URL: **`/vilo/pipeline`** (layout dashboard). | ⬜ |
| 4 | **Cadencia outreach** — [`lib/vilo/outreach-cadence.ts`](../lib/vilo/outreach-cadence.ts) + cron **`POST`** [`/api/vilo/outreach-cadence/tick`](../app/api/vilo/outreach-cadence/tick/route.ts) (usa `serviceClient`). | ⬜ |
| 5 | **Cron Cloudflare** — Lun–vie 9:00 (**UTC**): URL `https://tudominio.com/api/vilo/outreach-cadence/tick`, método POST, header `x-cron-secret` si tenés `CRON_SECRET`. Detalle: [PASO 5 en `CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md). | ⬜ |
| 6 | **Variables Cloudflare** — `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM`/`EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`, opcional `VILO_API_SECRET`, `OPS_EMAIL` (alertas). Ver tablas en [`CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md). | ⬜ |
| 7 | **Deploy** — `npx wrangler pages deploy …` (carpeta según adaptador OpenNext / Pages). | ⬜ |
| 8 | **Probar** — `curl`/`Postman` → `POST /api/vilo/intake-b2b`; en navegador **`/vilo/pipeline`** y **`/vilo`**. | ⬜ |

---

## Notas B2B (producción)

| Aspecto | Implementación real |
|--------|----------------------|
| **Deduplicación** | Host del `website` normalizado + **`ILIKE`** sobre `organizations.website`; si no hay match, **`ILIKE`** sobre `organizations.name` (no dedupe estricto por nombre exacto). |
| **Cadencia** | Pasos por **`status`** (`vilo_stage`). “Días” = días enteros desde un **ancla** = máximo de `last_contact_date`, `contacts.updated_at` y `created_at` de la oportunidad (no hay columna `last_touch`). Coincidencia **exacta** `day === daysSinceAnchor`. Tras email automático se actualiza `last_contact_date` / `next_followup_date`, lo que mueve la ancla. |
| **Forecast ponderado** | Vista **`v_vilo_pipeline_forecast`**: `weighted_value = sum(potential_value * stage_weight_pct / 100)`; el peso es **por etapa** (no hay columna `probability` en fila). |
| **Oportunidades estancadas** | En la misma vista, **`stale_count`** por etapa: filas con **`updated_at`** &lt; ahora − 14 días (excluye lógica de fila `Nurture` en el filtro del count). |
| **Compliance** | Datos B2B no son PHI clínico; trazas útiles: `activity_log` (acciones CRM), `notifications_log` / entregas si usás el bus de notificaciones. |

---

## Qué queda cubierto en código

| Capacidad | Dónde |
|-----------|--------|
| Ingesta B2B + dedup + primera **`action_item`** | `ingestB2BLead`, `POST /api/vilo/intake-b2b` |
| Kanban por etapa + totales + cambio de **`status`** + Resend en cadencia | `/vilo/pipeline`, outreach tick |
| Cadencia (email + tareas manuales en **`action_items`**) | `runOutreachTick` |
| Forecast + stale por etapa | `v_vilo_pipeline_forecast` (SQL) |
| Action Center / notificaciones | `action_items`, rutas en `app/api/notifications/*` (según lo que tengas desplegado) |

Marcá ⬜ → ✅ en tu copia local cuando completes cada paso.
