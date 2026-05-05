# Checklist deploy — reporte PDF por sponsor (~5 min)

| Paso | Acción | Estado |
|------|--------|--------|
| 1 | `npm install @react-pdf/renderer @react-pdf/font` (ya en `package.json`) | Hecho en repo |
| 2 | Ejecutar SQL `supabase/35_sponsor_report_kpis.sql` en **Supabase → SQL Editor** (después de migraciones `01`…`06` por `study_id`) | Pendiente en tu proyecto |
| 3 | `lib/reports/SponsorReportPDF.tsx` | Hecho en repo |
| 4 | Ruta `GET /api/reports/sponsor/[id]/pdf` → [`app/api/reports/sponsor/[id]/pdf/route.tsx`](../app/api/reports/sponsor/[id]/pdf/route.tsx) (**`.tsx`**, no `.ts`, por JSX) | Hecho en repo |
| 5 | Botón / enlace UI: descarga por **organización** en [`components/contacts/ContactsPage.tsx`](../components/contacts/ContactsPage.tsx) (`/api/reports/sponsor/${o.id}/pdf`). El dashboard global [`components/sponsor/SponsorDashboard.tsx`](../components/sponsor/SponsorDashboard.tsx) sigue usando **`/api/reports/sponsor/pdf`** (PDF agregado con `pdf-lib`, sin `[id]`). | Parcial: añadí enlace en **Contacts → Organizations** |
| 6 | Deploy Cloudflare: `npx wrangler pages deploy .vercel/output/static --project-name <tu-proyecto>` (el proyecto Pages debe existir en el dashboard) | Pendiente / cuenta |
| 7 | Probar en navegador: iniciar sesión → **Contacts** → tarjeta de org → **Descargar reporte PDF**; debe bajar PDF con KPIs + oportunidades (RLS según sesión) | Pendiente |

## Rutas relacionadas

| Ruta | Uso |
|------|-----|
| `GET /api/reports/sponsor/[id]/pdf` | PDF por **org** (`organizations.id`): React-PDF + vista `v_sponsor_report_kpis` + `vilo_opportunities`. |
| `GET /api/reports/sponsor/pdf` | PDF **global** semanal (vistas `03_sponsor_dashboard.sql`), `pdf-lib`. |

## Qué incluye el PDF generado (`SponsorReportPDF`)

| Sección | Contenido real en código |
|---------|----------------------------|
| Header | Título ViloOS CRM, subtítulo, **nombre de la organización** (no hay asset de logo en el componente actual). |
| KPIs | Leads en pipeline, screened/scheduled, visitas completadas (mapeo a etapa **Enrolled**), pipeline forecast (`potential_value` agregado en la vista). |
| Tabla oportunidades | **Proyecto/tipo** (`company_name` + `opportunity_type`), **etapa** (`status` Vilo), **prioridad** (no existe columna de probabilidad en CRM), **valor potencial** (`potential_value`). |
| Actividad | Primer lead / última actividad desde filas de la vista KPI. |
| Footer | Disclaimer confidencial, timestamp de generación, “Pág. 1”. |

## Notas

- La vista `v_sponsor_report_kpis` solo agrega orgs tipo **Sponsor** y **CRO**; si la org es otro tipo, la fila KPI puede faltar y el PDF usará ceros en esos campos.
- El handler `[id]` usa `createServerSideClient()`: el usuario debe estar **autenticado** y pasar RLS para leer `organizations`, la vista y `vilo_opportunities`.
