# VILO CRM Operativo

CRM interno para operar tres líneas de negocio desde una sola consola:

- **Vilo Research**: pipeline B2B para sponsors, CROs, oportunidades, contactos y reportes.
- **Vitalis**: pipeline B2C de pacientes, leads, prescreen, scheduling y seguimiento.
- **HazloAsíYa**: pipeline de consumidores, submissions, pagos Square, validación documental y recovery.

La filosofía del producto es simple: **menos dashboards decorativos, más ejecución diaria**. El CRM ahora es **organization-centric**: Sponsors, CROs, Labs, Vendors y Partners son el objeto padre; contactos, oportunidades, estudios, tareas, actividades, notas y revenue viven bajo una organización.

Repositorio: <https://github.com/viloc2b-a11y/VILO-CRM>

---

## Stack

- **Frontend**: Next.js App Router, React, TypeScript, Tailwind CSS, Lucide Icons.
- **Backend**: Supabase Postgres + Auth + Row Level Security.
- **Datos**: tablas operativas, vistas SQL, triggers, RPCs y migraciones en `supabase/`.
- **Automatización**: agentes internos para orchestration, triage, recovery, growth, intake y notificaciones.
- **Pagos HazloAsíYa**: **Square es el sistema canónico**. Stripe queda solo como legado si existen columnas antiguas.

---

## Cómo Funciona

El CRM se organiza alrededor de cuatro capas:

1. **Captura de datos**
   - El **Ingestion Center** recibe datos manuales y CSV.
   - Oportunidades Vilo deben estar vinculadas a una organización.
   - Filas incompletas o ambiguas van a staging antes de importar.
   - Leads Vitalis y submissions HazloAsíYa conservan sus flujos específicos.

2. **Normalización en Supabase**
   - Cada línea de negocio tiene tablas propias.
   - `action_items` funciona como cola operativa global.
   - `organizations` es el padre operativo para Vilo Research.
   - `ingestion_staging` guarda filas inválidas, duplicadas o pendientes de revisión.
   - RLS limita qué usuarios ven cada unidad de negocio.

3. **Agentes operativos**
   - **Orchestrator** crea tareas cuando cambia un estado importante.
   - **Triage** calcula prioridad por urgencia, valor USD y antigüedad.
   - **Recovery** atiende pagos fallidos.
   - **Growth** detecta oportunidades de upsell.
   - **Cadence / Scheduler** dispara seguimientos Vitalis y Vilo.

4. **Ejecución en UI**
   - El usuario entra al Action Center.
   - Filtra por unidad, prioridad, estado o búsqueda.
   - Completa, pospone, reasigna o escala tareas.
   - Abre el workspace de cada organización para operar contactos, oportunidades, estudios, tareas, notas, actividades y revenue.

---

## Modelo Organization-Centric

La jerarquía principal de Vilo Research es:

```txt
Organization
├─ Contacts
├─ Opportunities / Leads
├─ Studies
├─ Tasks
├─ Activity Timeline
├─ Notes
└─ Financials
```

Reglas clave:

- No se deben crear oportunidades huérfanas.
- `contacts` pertenecen a `organizations`.
- `vilo_opportunities` deben estar vinculadas a una organización.
- Tasks y activity logs soportan `related_type + related_id`.
- Dashboard, Pipeline y Action Center calculan sobre oportunidades vinculadas.

Workspace:

```txt
/dashboard/organizations/[organizationId]
```

Desde `/contacts`, cada organización tiene **Open workspace**.

---

## Módulos Principales

| Ruta | Uso |
|---|---|
| `/action-center` | Cola global de ejecución. Prioridad máxima del sistema. |
| `/vilo` | Pipeline B2B de oportunidades Vilo Research. |
| `/vilo/pipeline` | Kanban comercial por etapa. |
| `/vilo/contacts/[id]` | Ficha y timeline de comunicaciones B2B. |
| `/dashboard/organizations/[organizationId]` | Workspace operativo por Sponsor/CRO/Lab/Vendor/Partner. |
| `/dashboard/ingestion` | Ingestion Center para carga manual, CSV y staging queue. |
| `/dashboard/sponsor` | Sponsor Intelligence: reporte y métricas operativas cuando hay datos reales en Supabase. |
| `/vitalis` | Pipeline de leads/pacientes Vitalis. |
| `/vitalis/patients/[id]` | Ficha de paciente y seguimiento. |
| `/hazlo` | Pipeline HazloAsíYa de submissions y pagos. |
| `/hazlo/review` | Cola de revisión manual. |
| `/hazlo/submissions/[id]` | Ficha completa del expediente. |
| `/clinical-ops` | Estudios, sitios, visitas y pagos clínicos. |
| `/biospecimens` | Specimens, shipments y cadena de custodia. |
| `/financials` | Invoices, revenue leakage y pagos abiertos. |
| `/analytics` | ROI y campañas. |
| `/contacts` | Organizaciones y contactos. |
| `/tasks` | Tareas operativas. |
| `/admin` | Usuarios, roles, business units y agentes. |

---

## Administración de Datos en el CRM

### 1. Usuarios y Acceso

Los usuarios se administran desde Supabase Auth y la tabla `user_profiles`.

Campos clave:

- `role`: rol operativo, por ejemplo `admin`, `manager`, `coordinator`.
- `allowed_business_units`: unidades permitidas, por ejemplo `vilo_research`, `vitalis`, `hazloasiya`.
- RLS usa estos campos para controlar lectura/escritura.

Un usuario admin puede:

- Crear usuarios desde `/admin`.
- Asignar business units.
- Revisar actividad.
- Activar o pausar agentes.

### 2. Datos B2B Vilo Research

Tablas principales:

- `organizations`
- `contacts`
- `vilo_opportunities`
- `ingestion_staging`
- `communications_log`
- `studies`
- `study_sites`
- `study_payments`
- `invoices`

Uso operativo:

- Registrar sponsors/CROs.
- Abrir workspace de organización.
- Crear contactos dentro de una organización.
- Crear oportunidades.
- Avanzar etapas comerciales.
- Registrar llamadas, emails y notas.
- Generar reportes sponsor.
- Crear tareas automáticas si una oportunidad queda sin movimiento.

### 2.1 Ingestion Center

Ruta:

```txt
/dashboard/ingestion
```

Opciones:

- **Manual Entry**: Organizations, Contacts, Opportunities, Studies, Communications, Patient Leads, Financial Items y Tasks / Follow-ups. Si la tabla de Supabase no existe o el usuario no tiene acceso, la pestaña muestra un estado *not connected* y no envía el formulario.
- **CSV Import**: upload, preview, mapping, validación e importación (entidades soportadas en CSV: Organizations, Contacts, Opportunities, Tasks).
- **Staging Queue**: filas inválidas, duplicadas o pendientes de revisión.

**Sponsor Intelligence** (`/dashboard/sponsor`): las métricas operativas del reporte dependen de conteos reales sobre tablas existentes (p. ej. `vilo_opportunities`, `studies`, `communications_log`, `patient_leads`, `invoices`). Sin filas operativas, la UI permanece en estado vacío operativo; no se muestran KPIs como si fueran datos confirmados.

Reglas de CSV (alineadas al validador del servidor):

- Organizations requieren `name` y `type`.
- Contacts requieren organización y `name`, más `email` o `phone`.
- Opportunities requieren `organization_id` (o nombre de organización resoluble), `indication`, `study_type` (campo `type` o `study_type`), `stage`, `expected_value` (`expected_revenue` o `expected_value`), `next_follow_up_date` (`next_step_date` o `next_follow_up_date`), `owner` y `notes`.
- Tasks requieren `title`, `owner`, `due_date`, `priority`, `status` y `notes`.

Si una oportunidad no tiene organización:

- no se crea como orphan record;
- se marca inválida;
- se envía a staging si la tabla existe;
- el validador exige organización antes de insertar.

### 3. Datos Vitalis

Tablas principales:

- `patient_leads`
- `patient_visits`
- `communications_log`
- tablas de qualifier/scheduler según migraciones aplicadas.

Uso operativo:

- Capturar lead.
- Contactar rápido.
- Prescreen.
- Agendar visita.
- Confirmar/no-show/enrolled.
- Crear tareas por leads sin contactar o cambios de etapa.

La UI está preparada para operar aunque falten columnas opcionales en Supabase: muestra datos core y avisa qué migración falta.

### 4. Datos HazloAsíYa

Tablas principales:

- `submissions`
- `webhook_events`
- `communications_log`
- vistas de métricas Hazlo.

Uso operativo:

- Ver expedientes recientes.
- Detectar pagos fallidos.
- Revisar validación documental.
- Gestionar recuperación de pago.
- Activar growth/upsell tras entrega.

**Square** es la fuente canónica para cobros. El webhook principal es:

```txt
POST /api/hazlo/square/webhook
```

El sistema valida firma, registra idempotencia y actualiza `submissions`.

### 5. Action Center

Tabla central:

- `action_items`

Campos clave:

- `business_unit`
- `record_type`
- `record_id`
- `title`
- `status`
- `priority`
- `due_date`
- `value_usd`
- `assigned_to`
- `source`

El Action Center agrupa:

- follow-ups vencidos;
- sponsor replies pendientes;
- feasibility submissions;
- Budget/CTA follow-ups;
- startup blockers;
- biospecimen requests;
- tareas de hoy.

Además, genera acciones desde:

- `action_items`;
- `tasks`;
- `vilo_opportunities` vinculadas a organización.

Las acciones Vilo se agrupan por organización cuando hay contexto disponible.

---

## Seguridad y Compliance

Este proyecto está diseñado con base para operación sensible, incluyendo contexto clínico.

Medidas incluidas:

- Supabase Auth.
- Row Level Security.
- Service role solo en rutas servidor.
- Separación por business unit.
- Logs de actividad.
- Logs de ejecución de agentes.
- Variables sensibles fuera del cliente.
- Preparación para cifrado de campos sensibles.

Importante:

- No subir `.env.local`.
- No exponer `SUPABASE_SERVICE_ROLE_KEY`.
- No guardar PHI/PII en logs de consola.
- Usar RLS antes de producción.
- Ejecutar migraciones completas antes de operar datos reales.

---

## Migraciones Supabase

Los SQL viven en `supabase/` y deben aplicarse en orden numérico.

Ejemplos de bloques:

- `06` a `10`: Action Center y métricas.
- `17` a `19`: Vitalis intake, qualifier y scheduler.
- `20` a `22`: Hazlo submissions, recovery y growth.
- `23` a `25`: Orchestrator, triage y agent control.
- `39` a `42`: communications log por entidad.
- `43` y `44`: esquema operativo CRM y clinical ops extendido.
- `45`: alignment execution CRM, etapas Vilo y revenue fields.
- `46`: Ingestion Center y `ingestion_staging`.
- `47`: hardening organization-centric, aliases `organization_id`, índices y generic related fields.

Guía principal:

```txt
supabase/INTEGRATION.md
```

Si una tabla o vista falta, la UI muestra “modo estructura” para no romper el dashboard mientras se completa la base.

---

## Variables de Entorno

Copiar:

```bash
cp .env.example .env.local
```

Variables mínimas:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

Variables según módulos:

```txt
SQUARE_WEBHOOK_SIGNATURE_KEY=
SQUARE_WEBHOOK_NOTIFICATION_URL=
SQUARE_ACCESS_TOKEN=
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
WHATSAPP_ACCESS_TOKEN=
OPENAI_API_KEY=
```

Ver `.env.example` para la lista completa.

---

## Desarrollo Local

Instalar:

```bash
npm install
```

Ejecutar:

```bash
npm run dev
```

Abrir:

```txt
http://localhost:3000
```

Validar antes de subir:

```bash
npm run build
npx tsc --noEmit
npm run lint
```

Nota: después de `npm run build`, si el servidor dev estaba vivo, reiniciarlo para evitar bundles mezclados de Next.

---

## Despliegue

1. Aplicar migraciones en Supabase.
2. Configurar variables de entorno.
3. Verificar RLS y usuarios admin.
4. Ejecutar build.
5. Desplegar en Vercel o la plataforma configurada.
6. Configurar crons para agentes.
7. Configurar webhooks externos.

Crons recomendados:

- `/api/action-center/orchestrator/tick`
- `/api/action-center/triage/tick`
- `/api/hazlo/recovery/tick`
- `/api/hazlo/growth/tick`
- `/api/hazlo/validator/tick`
- `/api/vitalis/cadence/tick`
- `/api/vilo/outreach-cadence/tick`

---

## Operación Diaria

Rutina recomendada:

1. Abrir `/action-center`.
2. Resolver primero críticas y vencidas.
3. Revisar Vitalis leads nuevos.
4. Revisar pagos fallidos Hazlo.
5. Revisar Vilo oportunidades sin movimiento.
6. Reasignar tareas por carga.
7. Cerrar tareas completadas.
8. Revisar `/admin` para agentes y logs si algo no corre.

---

## Estado del Proyecto

Último rechequeo local: **2026-05-07**.

Validado:

- `npm run build` pasa con build limpio.
- `npx tsc --noEmit` pasa.
- `npm run lint` pasa.
- Las rutas principales cargan sin runtime crash:
  - `/`
  - `/action-center`
  - `/vilo`
  - `/vilo/pipeline`
  - `/vitalis`
  - `/hazlo`
  - `/clinical-ops`
  - `/biospecimens`
  - `/financials`
  - `/analytics`
  - `/contacts`
  - `/dashboard/ingestion`
  - `/dashboard/organizations/[organizationId]`
  - `/tasks`
  - `/admin`
  - `/dashboard/sponsor`

Implementado:

- CRM multibusiness unit.
- Action Center.
- Pipelines Vilo, Vitalis y Hazlo.
- Clinical Ops.
- Biospecimens.
- Financials.
- Analytics.
- Admin panel.
- Ingestion Center.
- Organization Workspace.
- Organization-centric Action Center / Dashboard / Pipeline.
- Agentes MVP.
- Migraciones Supabase.
- Compatibilidad con esquemas incompletos durante setup.

Funciona con administración manual:

- `/contacts`: `Quick add`, `Rename`, `Delete`, `Timeline`.
- `/contacts`: `Open workspace` por organización.
- `/dashboard/ingestion`: manual entry, CSV import, staging queue.
- `/dashboard/organizations/[organizationId]`: contacts, opportunities, studies, tasks, notes, activities y financial snapshot.
- `/tasks`: `Quick add`, `Add task`.
- `/action-center`: `Asignar a...`, `Completar`, `+1d`.
- `/clinical-ops`: crear estudios, sitios, visitas y pagos clínicos.
- `/biospecimens`: crear specimens/shipments y actualizar status.
- `/financials`: crear invoices y actualizar status.
- `/admin`: crear usuarios, revisar roles/agentes.
- `/vilo`: pipeline por organización; creación redirige a Ingestion Center para evitar oportunidades huérfanas.

Funciona en modo estructura mientras faltan migraciones/datos:

- `/action-center`: carga, pero necesita `action_items` y `v_action_metrics` para operar con datos reales.
- `/vitalis`: carga con datos core si faltan columnas opcionales.
- `/hazlo`: carga, pero necesita `submissions` para expedientes reales.
- `/analytics`: necesita `v_campaign_roi_metrics`.

Eslabones pendientes antes de producción estricta:

- Confirmar migraciones en Supabase real.
- Aplicar `45_execution_crm_alignment.sql`.
- Aplicar `46_ingestion_center.sql`.
- Aplicar `47_organization_centric_crm.sql`.
- Aplicar/validar `action_items`.
- Aplicar/validar `v_action_metrics`.
- Aplicar/validar `submissions`.
- Aplicar/validar `v_hazlo_metrics`.
- Aplicar/validar `v_campaign_roi_metrics`.
- Completar columnas opcionales Vitalis como `last_contact_channel` y `assigned_navigator`.
- Revisar RLS con usuarios reales.
- Activar webhooks Square.
- Configurar crons.
- Añadir en `vercel.json` o Cloudflare los ticks de orchestrator, triage, Hazlo recovery/growth/validator, Vitalis cadence y Vilo outreach.
- Validar flujos con datos reales.
- Extender auditoría si se requiere trazabilidad tipo 21 CFR Part 11.
