-- ============================================================
--  Marketing ROI / CAC — vista v_campaign_roi_metrics
--  Run after 23_orchestrator_agent.sql (marketing_campaigns).
--
--  Atribución:
--  • Vitalis: patient_leads.source_campaign ILIKE '%' || marketing_campaigns.name || '%'
--  • Hazlo: submissions.source_campaign ILIKE '%' || marketing_campaigns.name || '%'
--    Ojo: % y _ en name son comodines LIKE; evitalos en name o escapá con ESCAPE.
--  • Vilo: vilo_opportunities.marketing_campaign_id → marketing_campaigns.id (columna nueva)
--
--  Gasto: marketing_campaigns.lifetime_spend si existe; si no, cost_per_lead × leads Vitalis.
--  Ingreso Hazlo pagado: 49 USD por submission (ajustá el literal si tu precio cambia).
--  Pipeline Vilo: sum(potential_value × 0.5) — probabilidad implícita 50 % (sin columna probability).
-- ============================================================

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS lifetime_spend numeric(14, 2);

COMMENT ON COLUMN public.marketing_campaigns.lifetime_spend IS
  'Gasto total de media atribuible a la campaña. Si NULL, la vista estima con cost_per_lead × leads Vitalis.';

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS source_campaign text;

CREATE INDEX IF NOT EXISTS idx_submissions_source_campaign
  ON public.submissions (source_campaign)
  WHERE NOT archived AND source_campaign IS NOT NULL;

COMMENT ON COLUMN public.submissions.source_campaign IS
  'Opcional: mismo texto que marketing_campaigns.name para ROI Hazlo.';

ALTER TABLE public.vilo_opportunities
  ADD COLUMN IF NOT EXISTS marketing_campaign_id uuid REFERENCES public.marketing_campaigns (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vilo_marketing_campaign
  ON public.vilo_opportunities (marketing_campaign_id)
  WHERE NOT archived AND marketing_campaign_id IS NOT NULL;

COMMENT ON COLUMN public.vilo_opportunities.marketing_campaign_id IS
  'Opcional: enlaza la oportunidad a una fila de marketing_campaigns para pipeline ROI.';

CREATE OR REPLACE VIEW public.v_campaign_roi_metrics
WITH (security_invoker = true)
AS
WITH vitalis_stats AS (
  SELECT
    c.id AS campaign_id,
    c.name AS campaign_name,
    c.platform,
    c.external_id AS external_ref,
    c.cost_per_lead AS cost_per_lead_config,
    c.lifetime_spend,
    count(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL) AS leads,
    count(DISTINCT p.id) FILTER (
      WHERE p.current_stage IN (
        'Prequalified'::public.vitalis_stage,
        'Scheduled'::public.vitalis_stage,
        'Visit Confirmed'::public.vitalis_stage,
        'Enrolled'::public.vitalis_stage
      )
    ) AS qualified,
    count(DISTINCT p.id) FILTER (WHERE p.current_stage = 'Enrolled'::public.vitalis_stage) AS conversions
  FROM public.marketing_campaigns c
  LEFT JOIN public.patient_leads p
    ON NOT p.archived
    AND trim(c.name) <> ''
    AND p.source_campaign ILIKE '%' || c.name || '%'
  WHERE NOT c.archived
  GROUP BY c.id, c.name, c.platform, c.external_id, c.cost_per_lead, c.lifetime_spend
),
hazlo_stats AS (
  SELECT
    c.id AS campaign_id,
    count(s.id) AS submissions,
    count(s.id) FILTER (WHERE s.payment_status = 'paid') AS paid_submissions,
    coalesce(
      sum(
        CASE
          WHEN s.payment_status = 'paid' THEN 49::numeric
          ELSE 0::numeric
        END
      ),
      0::numeric
    ) AS revenue
  FROM public.marketing_campaigns c
  LEFT JOIN public.submissions s
    ON NOT s.archived
    AND trim(c.name) <> ''
    AND s.source_campaign ILIKE '%' || c.name || '%'
  WHERE NOT c.archived
  GROUP BY c.id
),
vilo_pipeline AS (
  SELECT
    c.id AS campaign_id,
    coalesce(
      sum(coalesce(o.potential_value, 0::numeric) * 0.5::numeric),
      0::numeric
    ) AS pipeline_value
  FROM public.marketing_campaigns c
  LEFT JOIN public.vilo_opportunities o
    ON NOT o.archived
    AND o.marketing_campaign_id = c.id
  WHERE NOT c.archived
  GROUP BY c.id
),
joined AS (
  SELECT
    vs.campaign_id,
    vs.campaign_name,
    vs.platform,
    vs.external_ref,
    vs.cost_per_lead_config,
    vs.lifetime_spend,
    vs.leads,
    vs.qualified,
    vs.conversions,
    coalesce(hs.submissions, 0::bigint) AS hazlo_submissions,
    coalesce(hs.paid_submissions, 0::bigint) AS hazlo_paid,
    coalesce(hs.revenue, 0::numeric) AS hazlo_revenue,
    coalesce(vp.pipeline_value, 0::numeric) AS vilo_pipeline,
    coalesce(hs.revenue, 0::numeric) + coalesce(vp.pipeline_value, 0::numeric) AS total_revenue,
    coalesce(
      vs.lifetime_spend,
      CASE
        WHEN vs.leads > 0 AND vs.cost_per_lead_config IS NOT NULL
        THEN vs.cost_per_lead_config * vs.leads::numeric
        ELSE NULL::numeric
      END,
      0::numeric
    ) AS total_spend
  FROM vitalis_stats vs
  LEFT JOIN hazlo_stats hs ON hs.campaign_id = vs.campaign_id
  LEFT JOIN vilo_pipeline vp ON vp.campaign_id = vs.campaign_id
)
SELECT
  campaign_id,
  campaign_name,
  platform,
  external_ref,
  cost_per_lead_config,
  lifetime_spend,
  leads,
  qualified,
  conversions,
  hazlo_submissions,
  hazlo_paid,
  hazlo_revenue,
  vilo_pipeline,
  total_revenue,
  total_spend,
  CASE
    WHEN leads > 0 THEN round((total_spend / nullif(leads, 0)::numeric), 2)
    ELSE 0::numeric
  END AS cost_per_lead,
  CASE
    WHEN conversions > 0 THEN round((total_spend / nullif(conversions, 0)::numeric), 2)
    ELSE 0::numeric
  END AS cac,
  CASE
    WHEN total_spend > 0 THEN
      round((((total_revenue - total_spend) / total_spend) * 100::numeric), 1)
    ELSE 0::numeric
  END AS roi_percent
FROM joined;

COMMENT ON VIEW public.v_campaign_roi_metrics IS
  'ROI por campaña: Vitalis/Hazlo por source_campaign ILIKE %name%; Vilo por marketing_campaign_id. security_invoker respeta RLS.';

GRANT SELECT ON public.v_campaign_roi_metrics TO authenticated;
GRANT SELECT ON public.v_campaign_roi_metrics TO service_role;
