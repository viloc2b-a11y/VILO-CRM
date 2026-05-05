-- ============================================================
--  ROI vista: JOIN opcional por utm_source + utm_campaign
--  Run after 32_campaign_roi_metrics.sql
--
--  Si en marketing_campaigns rellenás **ambos** utm_source y utm_campaign (no vacíos):
--    • Vitalis: match por intake_attribution->>'utm_source' y ->>'utm_campaign'
--    • Hazlo: match por submissions.utm_source y submissions.utm_campaign
--  Si no (alguno NULL/vacío): source_campaign ILIKE '%' || name || '%' (parcial, case-insensitive)
-- ============================================================

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS utm_source text;

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS utm_campaign text;

COMMENT ON COLUMN public.marketing_campaigns.utm_source IS
  'Opcional: si junto con utm_campaign está definido, v_campaign_roi_metrics atribuye Vitalis/Hazlo por par UTM en lugar de name/source_campaign.';

COMMENT ON COLUMN public.marketing_campaigns.utm_campaign IS
  'Opcional: par con utm_source para atribución ROI (debe coincidir con intake / submission).';

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS utm_source text;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS utm_campaign text;

COMMENT ON COLUMN public.submissions.utm_source IS
  'Opcional: para ROI cuando marketing_campaigns usa par UTM.';

COMMENT ON COLUMN public.submissions.utm_campaign IS
  'Opcional: par con utm_source; alineado con marketing_campaigns y con intake_attribution del lead.';

CREATE INDEX IF NOT EXISTS idx_submissions_utm_pair
  ON public.submissions (utm_source, utm_campaign)
  WHERE NOT archived AND utm_source IS NOT NULL AND utm_campaign IS NOT NULL;

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
    AND (
      (
        c.utm_source IS NOT NULL
        AND trim(c.utm_source) <> ''
        AND c.utm_campaign IS NOT NULL
        AND trim(c.utm_campaign) <> ''
        AND coalesce(p.intake_attribution->>'utm_source', '') IS NOT DISTINCT FROM c.utm_source
        AND coalesce(p.intake_attribution->>'utm_campaign', '') IS NOT DISTINCT FROM c.utm_campaign
      )
      OR (
        NOT (
          c.utm_source IS NOT NULL
          AND trim(c.utm_source) <> ''
          AND c.utm_campaign IS NOT NULL
          AND trim(c.utm_campaign) <> ''
        )
        AND trim(c.name) <> ''
        AND p.source_campaign ILIKE '%' || c.name || '%'
      )
    )
  WHERE NOT c.archived
  GROUP BY
    c.id,
    c.name,
    c.platform,
    c.external_id,
    c.cost_per_lead,
    c.lifetime_spend,
    c.utm_source,
    c.utm_campaign
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
    AND (
      (
        c.utm_source IS NOT NULL
        AND trim(c.utm_source) <> ''
        AND c.utm_campaign IS NOT NULL
        AND trim(c.utm_campaign) <> ''
        AND coalesce(s.utm_source, '') IS NOT DISTINCT FROM c.utm_source
        AND coalesce(s.utm_campaign, '') IS NOT DISTINCT FROM c.utm_campaign
      )
      OR (
        NOT (
          c.utm_source IS NOT NULL
          AND trim(c.utm_source) <> ''
          AND c.utm_campaign IS NOT NULL
          AND trim(c.utm_campaign) <> ''
        )
        AND trim(c.name) <> ''
        AND s.source_campaign ILIKE '%' || c.name || '%'
      )
    )
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
  'ROI por campaña: Vitalis por UTM (intake_attribution) o source_campaign=name; Hazlo por UTM en submissions o source_campaign=name; Vilo por marketing_campaign_id. Ver 33_campaign_roi_utm_join.sql.';
