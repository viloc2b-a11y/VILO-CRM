# Checklist deploy — Analytics / ROI (~5 min)

| Paso | Acción | Estado |
|------|--------|--------|
| 1 | Ejecutar SQL **`32_campaign_roi_metrics.sql`** en Supabase SQL Editor (y opcionalmente **`33_campaign_roi_utm_join.sql`** si usás atribución por UTM). | ⬜ |
| 2 | Confirmar que existen filas en **`marketing_campaigns`** y atribución en **`patient_leads.source_campaign`** / **`intake_attribution`** (y/o Hazlo **`submissions.source_campaign`** o **`utm_*`** según **33**). | ⬜ |
| 3 | La app ya incluye **`app/(dashboard)/analytics/page.tsx`** y **`components/ROICards`**, **`CampaignTable`** bajo **`app/(dashboard)/analytics/components/`**. | ✅ en repo |
| 4 | Enlace en **`components/layout/Sidebar.tsx`** → **`/analytics`** (etiqueta «ROI & Campañas»). | ✅ en repo |
| 5 | Verificar tracking: no existen `patients.source` ni `submissions.source` en este esquema. Revisá **`patient_leads.source_campaign`** (y UTM en **`intake_attribution`**) y **`submissions.source_campaign`** frente a **`marketing_campaigns.name`** o al par UTM (**`33`**). Guía: [`MARKETING_ATTRIBUTION.md`](./MARKETING_ATTRIBUTION.md). | ⬜ |
| 6 | Deploy (Cloudflare u otro): variables de entorno Supabase; build con tu adaptador Next.js; p. ej. [`CLOUDFLARE_CRONS.md`](./CLOUDFLARE_CRONS.md) (`wrangler pages deploy` + carpeta de salida correcta). | ⬜ |
| 7 | Abrir **`/analytics`** con un usuario autenticado y comprobar filas en **`v_campaign_roi_metrics`** (RLS: visibilidad según rol/BU). | ⬜ |

---

## Qué mide el dashboard

| Métrica | Fórmula en esta vista | Uso estratégico |
|---------|------------------------|-----------------|
| **CPL** (coste por lead) | `total_spend / leads` | Optimizar pujas (Meta/Google, etc.). |
| **CAC** (coste por adquisición) | `total_spend / conversions` | Decidir escalar o pausar (conversiones Vitalis = etapa **`Enrolled`** en el SQL). |
| **ROI %** | `((total_revenue - total_spend) / total_spend) * 100` | Comparar rentabilidad agregada; `total_revenue` mezcla ingresos Hazlo (literal USD en SQL) + pipeline Vilo. |
| **Pipeline Vilo** | En BD: `sum(potential_value * 0.5)` por campaña (probabilidad implícita **50 %**; no hay columna `probability` en `vilo_opportunities`). | Forecasting orientativo; ajustá el factor en **`32`/`33`** si tu negocio usa otro criterio. |

Las tarjetas superiores del UI agregan gasto, ingresos/pipeline, leads, CAC medio (solo campañas con CAC > 0) y ROI global.

Referencias SQL: [`supabase/32_campaign_roi_metrics.sql`](../supabase/32_campaign_roi_metrics.sql), [`supabase/33_campaign_roi_utm_join.sql`](../supabase/33_campaign_roi_utm_join.sql).
