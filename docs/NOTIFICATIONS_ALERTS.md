# PASO 12 — Alertas unificadas (Email + Slack)

Motor **Edge-safe** (`fetch` + Supabase): **`sendEmail`** / **`sendSlack`** en [`lib/notifications/dispatcher.ts`](../lib/notifications/dispatcher.ts) y **`sendUnifiedAlert`** (dedupe BD) en [`lib/notifications/send-unified-alert.ts`](../lib/notifications/send-unified-alert.ts).

## Requisitos

1. Ejecutar [`supabase/36_notification_deliveries.sql`](../supabase/36_notification_deliveries.sql) (dedupe) y [`supabase/37_notifications_log.sql`](../supabase/37_notifications_log.sql) (auditoría; lectura **solo admins** vía `is_app_admin()`).
2. Variables (ver [`.env.example`](../.env.example)):
   - **Email:** `RESEND_API_KEY`, `RESEND_FROM`; destino: `ALERTS_EMAIL_TO` o, si vacío, `VITALIS_NAVIGATOR_EMAIL` / `OPS_EMAIL`.
   - **Slack:** `ALERTS_SLACK_WEBHOOK_URL` o, si vacío, `VITALIS_INTAKE_SLACK_WEBHOOK_URL`.
3. **Solo `service_role`** inserta en `notification_deliveries` (API routes, cron, webhooks con `serviceClient`).

## Idempotencia

- Una fila por **`idempotency_key`** (único, máx. 512 caracteres).
- Segundo envío con la misma clave: **no** llama a Resend ni Slack.
- Resend: cabecera adicional **`Idempotency-Key`** por si el proveedor deduplica a nivel API.

## Uso

```ts
import { sendUnifiedAlert } from "@/lib/notifications";

await sendUnifiedAlert({
  idempotencyKey: `critical_task:${taskId}:${dueDate}`,
  subject: "Tarea crítica vence hoy",
  text: "Detalle en plaintext…",
  html: "<p>…</p>",
  channels: ["email", "slack"], // opcional
});
```

Integración sugerida: tareas `action_items` con prioridad crítica, generación de reportes sponsor, fallos de agentes. Evitá claves que cambien en cada tick sin criterio (usa fecha o versión estable).

### Cron: tareas críticas vencidas

- **`POST` / `GET` `/api/notifications/tick-critical`** — `serviceClient`, header **`x-cron-secret`** si `CRON_SECRET` está definido.
- Env: **`OPS_EMAIL`** / **`RESEND_*`**, **`SLACK_CRITICAL_WEBHOOK`** (o fallback a webhooks genéricos del proyecto).
- Dedupe: **`notifications_log`** (`critical_task_overdue` + `task_id` en 24h). No se escribe `status = overdue` en `action_items` (no existe en el enum).

### Reporte listo (PDF / sponsor)

- **`POST` `/api/notifications/report-ready`** — JSON: `company_name`, `report_url` (misma origin y path bajo **`/api/reports/`**), opcional `channel` (`email` \| `slack` \| `both`), `recipient`, `company_id`.
- Auth: **`x-cron-secret`** = `CRON_SECRET` **o** sesión Supabase (usuario logueado en el CRM). Log con **`report_generated`** via `serviceClient`.
- Slack: **`SLACK_OPS_WEBHOOK`** o webhooks genéricos del proyecto.
- UI: [`OrganizationReportActions`](../components/contacts/OrganizationReportActions.tsx) en Contacts → Organizations.

Checklist de deploy: [`NOTIFICATIONS_DEPLOY_CHECKLIST.md`](./NOTIFICATIONS_DEPLOY_CHECKLIST.md).
