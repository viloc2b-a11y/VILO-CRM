# PASO 5: Tracking de source para ROI / `v_campaign_roi_metrics`

Para que el dashboard **Analytics** (`/analytics`) y la vista **`v_campaign_roi_metrics`** cuadren, conviene alinear **`source_campaign`** con **`marketing_campaigns.name`**. En modo “solo nombre”, el join usa **`ILIKE '%' || name || '%'`** (subcadena, sin distinguir mayúsculas). El modo UTM sigue siendo **igualdad** en `utm_source` / `utm_campaign`.

## Nombres reales en el esquema VILO CRM

| Concepto genérico | Tabla / columna en este repo |
|-------------------|-------------------------------|
| “Patients” | **`patient_leads`** (no existe `patients`) |
| Source del lead Vitalis | **`patient_leads.source_campaign`** (no hay columna `source` en pacientes) |
| Source del expediente Hazlo | **`submissions.source_campaign`** (añadida en **`32_campaign_roi_metrics.sql`**; no uses una columna `submissions.source` a menos que la añadas tú en otra migración) |
| Nombre de campaña de gasto | **`marketing_campaigns.name`** |

Sin par UTM en la campaña, **`source_campaign`** debe **incluir** el texto de **`name`** (no hace falta ser idéntico en todo el string, salvo que quieras evitar solapamientos entre campañas).

## Modo A — solo nombre de campaña

1. Creá filas en **`marketing_campaigns`** con el **`name`** canónico (ej. `Facebook Leads Q1 2026`).
2. Dejá **`utm_source`** y **`utm_campaign`** en NULL (o vacíos).
3. En intake, **`source_campaign`** debe contener el texto de **`name`** (la vista usa `ILIKE '%' || name || '%'`). Para match exacto, que sean iguales carácter a carácter; evitá `%` y `_` en `marketing_campaigns.name` (comodines en SQL `LIKE`).

## Modo B — trackear por `utm_source` + `utm_campaign`

Migración **`33_campaign_roi_utm_join.sql`** redefine la vista con este criterio:

- En **`marketing_campaigns`**, rellená **los dos** campos **`utm_source`** y **`utm_campaign`** (no vacíos).
- **Vitalis:** el lead debe tener en **`intake_attribution`** las claves `utm_source` y `utm_campaign` con los **mismos** valores (el intake ya las guarda desde el payload UTM).
- **Hazlo:** en **`submissions`**, rellená **`utm_source`** y **`utm_campaign`** al crear el expediente (mismos valores que en la fila de campaña).
- Si la campaña **no** tiene el par UTM completo, la vista atribuye por **`source_campaign` ILIKE '%' || name || '%'`** (misma regla que en **32**).

## Vitalis / formularios

1. Creá filas en **`marketing_campaigns`** según modo A o B arriba.
2. En modo A, enviá el mismo texto en UTM/nombre **o** un slug que mapees al nombre canónico.

**APIs que ya enriquecen el body:**

- `POST /api/vitalis/intake`
- `POST /api/patient_leads`

Ambas pasan por **`enrichVitalisIntakeFromRawBody`** en [`lib/vitalis/intake.ts`](../lib/vitalis/intake.ts), que:

- Lee **`utm_campaign`** / **`utmCampaign`** y el objeto **`utm`**.
- Asigna **`source_campaign`** con prioridad: valor ya enviado → UTM → **`Organic`** si no hay nada.

**Mapeo slug → nombre** (cuando Meta/forms mandan un ID corto distinto al `name` en BD): editá el diccionario en [`lib/vitalis/campaign-aliases.ts`](../lib/vitalis/campaign-aliases.ts) (`UTM_CAMPAIGN_TO_NAME`).

## Hazlo (`submissions`)

Cuando creés o actualizáis un expediente (funnel propio, API futura, etc.), persistí:

```text
submissions.source_campaign = '<mismo texto que marketing_campaigns.name>'
```

Podés reutilizar **`resolveCampaignNameFromUtm`** desde [`lib/vitalis/campaign-aliases.ts`](../lib/vitalis/campaign-aliases.ts) si recibís `utm_campaign` en query/body.

## Vilo Research

Para pipeline por campaña usá **`vilo_opportunities.marketing_campaign_id`** apuntando al **`id`** de `marketing_campaigns` (ver **`32_campaign_roi_metrics.sql`**).

## Checklist rápido

1. Nombres de campaña definidos en **`marketing_campaigns.name`**.
2. Leads: **`patient_leads.source_campaign`** = ese nombre (o slug mapeado en `campaign-aliases.ts`).
3. Hazlo: **`submissions.source_campaign`** = ese nombre al crear/actualizar el submission.
4. Vilo: **`marketing_campaign_id`** rellenado donde aplique.

## Referencia SQL

- Base ROI: [`supabase/32_campaign_roi_metrics.sql`](../supabase/32_campaign_roi_metrics.sql)
- JOIN UTM opcional (redefine la vista): [`supabase/33_campaign_roi_utm_join.sql`](../supabase/33_campaign_roi_utm_join.sql)
- Orden de migraciones: [`supabase/INTEGRATION.md`](../supabase/INTEGRATION.md)
