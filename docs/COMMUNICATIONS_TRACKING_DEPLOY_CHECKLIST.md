# Checklist deploy — Communications log, tracking y cadencia (~5 min + pruebas)

Referencias: [`supabase/39_communications_log.sql`](../supabase/39_communications_log.sql), [`app/api/vilo/email-tracking/route.ts`](../app/api/vilo/email-tracking/route.ts), [`app/api/vilo/communications/log/route.ts`](../app/api/vilo/communications/log/route.ts), [`docs/CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md).

| Paso | Acción | Estado |
|------|--------|--------|
| 1 | **SQL `communications_log`** — Supabase SQL Editor → ejecutar [`39_communications_log.sql`](../supabase/39_communications_log.sql) (después de `01_schema` y `06_action_center_studies_ctms.sql`). | ⬜ |
| 2 | **Rutas API** — Ya en el repo: `POST` [`/api/vilo/email-tracking`](../app/api/vilo/email-tracking/route.ts) (Resend), `POST` [`/api/vilo/communications/log`](../app/api/vilo/communications/log/route.ts) (Quick-Log), `GET` [`/api/vilo/contacts/[id]/communications`](../app/api/vilo/contacts/[id]/communications/route.ts) (lista JSON). | ⬜ |
| 3 | **UI** — Timeline [`CommunicationTimeline`](../app/(dashboard)/vilo/contacts/[id]/components/CommunicationTimeline.tsx), Quick-Log [`QuickLogInteraction`](../components/vilo/QuickLogInteraction.tsx), página [`/vilo/contacts/[id]`](../app/(dashboard)/vilo/contacts/[id]/page.tsx). | ⬜ |
| 4 | **Cadencia** — [`lib/vilo/outreach-cadence.ts`](../lib/vilo/outreach-cadence.ts): guardia por `communications_log` reciente (3 días), excluye `type = outreach_cadence`; pausa + tarea `outreach_cadence_recent_touch`. | ⬜ |
| 5 | **Resend + Cloudflare** — Webhook, Open/Click tracking, `RESEND_WEBHOOK_SECRET`, variables: [**Resend Webhooks** en `CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md). | ⬜ |
| 6 | **Deploy** — `npx wrangler pages deploy …` (carpeta según adaptador). | ⬜ |
| 7 | **Prueba** — Enviar correo (cadencia o manual con `resend_email_id` en `metadata`), abrir en cliente de prueba, revisar webhook en logs; Quick-Log manual; timeline en `/vilo/contacts/<id>`. | ⬜ |

---

## Notas de producción y cumplimiento

| Aspecto | Implementación |
|--------|----------------|
| **LinkedIn** | Sin scraping ni APIs no oficiales (riesgo ToS). Quick-Log manual + plantillas/cadencia con tareas manuales para pasos LinkedIn. |
| **Tracking de email** | Resend gestiona píxeles/enlaces según su documentación. El CRM guarda en `metadata` contadores/eventos agregados (`opens`, `clics`, `resend_last_event`, etc.), no un modelo de atribución por IP en este repo. |
| **Cadencia vs engagement** | **Aperturas/clics:** el webhook [`email-tracking`](../app/api/vilo/email-tracking/route.ts) actualiza filas existentes de `communications_log` (mismo `created_at`) y puede actualizar `vilo_opportunities` + `action_items` por engagement. **Pausa por “actividad reciente”** en el tick de cadencia: filas en `communications_log` con `created_at` en los últimos 3 días y `type ≠ outreach_cadence` (p. ej. Quick-Log, otros tipos de evento registrados como filas nuevas). Revisá que vuestro flujo cubra los casos que queráis pausar. |
| **Auditoría** | Eventos con `channel`, `direction`, `type`, `subject`, `body`, `metadata`. RLS por BU (`vilo_research`) en la tabla. **21 CFR Part 11** u otros marcos requieren validación legal/proceso aparte; este diseño ayuda a trazabilidad pero no sustituye esa validación. |
| **Rendimiento** | Índices en `(contact_id, created_at desc)` y similares en [`39`](../supabase/39_communications_log.sql). Cargas grandes: paginá en API si más adelante superás el límite de 50 en el GET. |

---

## Qué queda cubierto en código

| Capacidad | Dónde |
|-----------|--------|
| Webhook Resend → metadata + engagement | `POST /api/vilo/email-tracking` |
| Alta manual Quick-Log | `POST /api/vilo/communications/log` + UI en `/vilo/contacts/[id]` |
| Timeline unificado | `CommunicationTimeline` + índices SQL |
| Cadencia con guardia reciente + tarea manual | `runOutreachTick` |

Marcá ⬜ → ✅ cuando completes cada paso.
