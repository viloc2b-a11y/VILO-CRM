# VILO CRM Operativo

CRM interno para operar tres líneas de negocio desde una sola consola:

- **Vilo Research**: pipeline B2B para sponsors, CROs, oportunidades, contactos y reportes.
- **Vitalis**: pipeline B2C de pacientes, leads, prescreen, scheduling y seguimiento.
- **HazloAsíYa**: pipeline de consumidores, submissions, pagos Square, validación documental y recovery.

La filosofía del producto es simple: **menos dashboards decorativos, más ejecución diaria**. La vista principal es el **Action Center**, una cola única de trabajo que prioriza tareas vencidas, leads calientes, pagos fallidos y oportunidades sin movimiento.

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
   - Leads Vitalis entran por formularios, intake, WhatsApp o API.
   - Oportunidades Vilo entran por carga manual, intake B2B o enriquecimiento.
   - Submissions HazloAsíYa entran desde el funnel público y se actualizan con eventos de pago.

2. **Normalización en Supabase**
   - Cada línea de negocio tiene tablas propias.
   - `action_items` funciona como cola operativa global.
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
   - Cada módulo conserva su pipeline propio para contexto.

---

## Módulos Principales

| Ruta | Uso |
|---|---|
| `/action-center` | Cola global de ejecución. Prioridad máxima del sistema. |
| `/vilo` | Pipeline B2B de oportunidades Vilo Research. |
| `/vilo/pipeline` | Kanban comercial por etapa. |
| `/vilo/contacts/[id]` | Ficha y timeline de comunicaciones B2B. |
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
- `communications_log`
- `studies`
- `study_sites`
- `study_payments`

Uso operativo:

- Registrar sponsors/CROs.
- Crear oportunidades.
- Avanzar etapas comerciales.
- Registrar llamadas, emails y notas.
- Generar reportes sponsor.
- Crear tareas automáticas si una oportunidad queda sin movimiento.

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

- tareas vencidas y de hoy;
- leads Vitalis sin contactar;
- pagos fallidos HazloAsíYa;
- oportunidades Vilo sin movimiento;
- otras acciones abiertas.

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

Implementado:

- CRM multibusiness unit.
- Action Center.
- Pipelines Vilo, Vitalis y Hazlo.
- Clinical Ops.
- Biospecimens.
- Financials.
- Analytics.
- Admin panel.
- Agentes MVP.
- Migraciones Supabase.
- Compatibilidad con esquemas incompletos durante setup.

Pendiente antes de producción estricta:

- Confirmar migraciones en Supabase real.
- Revisar RLS con usuarios reales.
- Activar webhooks Square.
- Configurar crons.
- Validar flujos con datos reales.
- Extender auditoría si se requiere trazabilidad tipo 21 CFR Part 11.

