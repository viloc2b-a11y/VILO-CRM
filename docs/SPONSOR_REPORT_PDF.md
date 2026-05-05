# PASO 11: Reporting para sponsors / CROs (PDF auto-generado)

Informe **PDF** con métricas de reclutamiento Vitalis alineadas al dashboard sponsor: semana actual, motor 7d, ejecución, **pipeline por etapa**, fuentes 30d, *screen fail*, y texto bilingüe listo para email.

## Requisitos

- SQL aplicado: [`supabase/03_sponsor_dashboard.sql`](../supabase/03_sponsor_dashboard.sql) (vistas `v_weekly_sponsor_report`, `v_enrollment_engine_7d`, `v_execution_metrics`, `v_pipeline_by_stage`, `v_leads_by_source_30d`, `v_screen_fail_insights`).
- Entorno servidor: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (igual que otras API con `serviceClient`).

## Uso

| Ruta | Descripción |
|------|-------------|
| `GET /api/reports/sponsor` | JSON para UI ([`SponsorDashboard`](../components/sponsor/SponsorDashboard.tsx) tab **Report**). |
| `GET /api/reports/sponsor/pdf` | Descarga `application/pdf` (`Content-Disposition: attachment`). |

En **Dashboard → Sponsor → Report** el enlace **Download PDF report** apunta al endpoint PDF.

## Implementación (App Router + Cloudflare)

- Datos compartidos: [`lib/reports/sponsor-report-data.ts`](../lib/reports/sponsor-report-data.ts) → `fetchSponsorReportPayload()`.
- Generación: [`lib/reports/sponsor-pdf.ts`](../lib/reports/sponsor-pdf.ts) con **`pdf-lib`** (sin headless browser; compatible con runtime Node/Workers que empaqueten el bundle).
- Handler: [`app/api/reports/sponsor/pdf/route.ts`](../app/api/reports/sponsor/pdf/route.ts).

## Seguridad

Hoy `/api/*` no exige sesión en [`middleware.ts`](../middleware.ts). Si el PDF es sensible, añadí verificación (cookie Supabase, header interno, o restricción por rol) en la ruta PDF antes de llamar a `fetchSponsorReportPayload`.

## Extensión

- Logo / marca: embebé PNG con `doc.embedPng` en `sponsor-pdf.ts`.
- Presupuesto / timeline: nuevas vistas SQL + campos en `SponsorReportPayload` y secciones extra en el PDF.
