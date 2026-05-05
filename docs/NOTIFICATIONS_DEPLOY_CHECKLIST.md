# Checklist deploy — notificaciones (~5 min + pruebas)

| Paso | Acción | Estado en repo |
|------|--------|----------------|
| 1 | Ejecutar [`supabase/37_notifications_log.sql`](../supabase/37_notifications_log.sql) en **Supabase → SQL Editor** (auditoría + cooldown 24h por `task_id`). Opcional: [`36_notification_deliveries.sql`](../supabase/36_notification_deliveries.sql) si usás **`sendUnifiedAlert`**. | SQL listo; **ejecutar en tu proyecto** |
| 2 | [`lib/notifications/dispatcher.ts`](../lib/notifications/dispatcher.ts) (`sendEmail`, `sendSlack`, `fetch` nativo). | **Hecho** |
| 3 | Rutas [`app/api/notifications/tick-critical/route.ts`](../app/api/notifications/tick-critical/route.ts) y [`app/api/notifications/report-ready/route.ts`](../app/api/notifications/report-ready/route.ts). | **Hecho** |
| 4 | UI: [`components/contacts/OrganizationReportActions.tsx`](../components/contacts/OrganizationReportActions.tsx) en **Contacts → Organizations**. | **Hecho** |
| 5 | Cron **`/api/notifications/tick-critical`** en Cloudflare (p. ej. cada 2 h) + `x-cron-secret` si hay `CRON_SECRET`. Ver [**PASO 6** en `CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md). | **Configurar en Dashboard** |
| 6 | Variables en Cloudflare: **`RESEND_*`**, **`OPS_EMAIL`**, webhooks, **`NEXT_PUBLIC_APP_URL`**, **`CRON_SECRET`**. Ver [**PASO 7** en `CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md). | **Configurar en Dashboard** |
| 7 | Deploy: `npx wrangler pages deploy …` (u otro pipeline). | **Tu CI / manual** |
| 8 | Test: crear **`action_item`** crítico `pending`/`in_progress` con **`due_date`** en el pasado; tras el cron, email/Slack + fila en `notifications_log`. Revisar **Logs** en Cloudflare. | **Manual** |

## Notas de producción

| Aspecto | Implementación real |
|---------|---------------------|
| **Anti-spam** | Ventana **24 h** por combinación `template_key` + `payload.task_id` en **`notifications_log`** antes de reenviar (tick-critical). |
| **Velocidad** | Resend/Slack vía **`fetch`** en el dispatcher; sin SDK pesado. La latencia depende de redes externas (típicamente sub-segundo a unos segundos). |
| **Fail-safe** | Si un canal falla, **`notifications_log.status`** puede ser **`failed`** con `email_ok` / `slack_ok` en `payload`; el handler no lanza para tumbar el cron. Reintentos: nuevo tick tras cooldown o corrección manual. |
| **Seguridad** | **`CRON_SECRET`** + header **`x-cron-secret`** en triggers (si está definido). **`report-ready`**: mismo header **o** sesión Supabase. **`notifications_log`**: lectura solo **admins** (`is_app_admin()`). |
| **Escalabilidad** | Alto volumen: valorar **Cloudflare Queues**, batch o proveedor con rate limits propios; hoy es “un POST por tarea elegible” por ejecución de cron. |

## Flujo (corregido al esquema CRM)

1. Cron ejecuta **`POST /api/notifications/tick-critical`** (p. ej. cada 2 h).
2. Se listan **`action_items`** con **`priority = critical`**, **`status` ∈ (`pending`, `in_progress`)**, **`due_date` < now**.
3. Por cada fila: si en **`notifications_log`** ya hay **`critical_task_overdue`** con el mismo **`task_id`** en las últimas **24 h**, se omite.
4. Se envían **email y/o Slack** según env; se inserta **`notifications_log`** (`sent` / `failed` según canales).
5. **No** se actualiza `action_items.status` a **`overdue`**: ese valor **no existe** en el enum; “vencido” es **derivado** (`due_date` + estado abierto). El anti-spam es solo el log + tiempo.
6. En **Contacts**, el usuario puede **“Enviar por email / Slack”** → **`POST /api/notifications/report-ready`** con URL bajo **`/api/reports/`** (sesión o cron secret).
7. El correo/Slack incluye enlace al PDF; queda auditoría en **`notifications_log`** (`report_generated`).

Referencia rápida: [`NOTIFICATIONS_ALERTS.md`](./NOTIFICATIONS_ALERTS.md).
