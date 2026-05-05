-- ============================================================
--  VILO CRM — Sponsor reporting: KPI view per organization
--  Run after 01_schema, 02_rls, 03_sponsor_dashboard, 06_action_center_studies_ctms
--  (06 adds patient_leads.study_id / vilo_opportunities.study_id).
--
--  Maps the conceptual “companies / opportunities / patients” model to:
--    organizations, vilo_opportunities, patient_leads
--  Patient linkage: study_id match to any opportunity on the org, else fuzzy
--  match on org name / opportunity company_name / therapeutic_area.
--  completed_visits → Vitalis stage Enrolled (no “Completed visit” enum).
-- ============================================================

CREATE OR REPLACE VIEW public.v_sponsor_report_kpis
WITH (security_invoker = true) AS
WITH org_base AS (
  SELECT
    o.id,
    o.name
  FROM public.organizations o
  WHERE
    NOT o.archived
    AND o.type IN ('Sponsor'::public.org_type, 'CRO'::public.org_type)
),
opp_agg AS (
  SELECT
    vo.org_id,
    COUNT(*)::bigint AS active_opportunities,
    COALESCE(SUM(vo.potential_value), 0)::numeric(14, 2) AS pipeline_forecast
  FROM public.vilo_opportunities vo
  WHERE
    NOT vo.archived
    AND vo.status NOT IN (
      'Activated'::public.vilo_stage,
      'Closed Lost'::public.vilo_stage,
      'Nurture'::public.vilo_stage
    )
  GROUP BY vo.org_id
),
therapeutic_agg AS (
  SELECT
    vo.org_id,
    string_agg(
      DISTINCT btrim(vo.therapeutic_area),
      ', '
      ORDER BY btrim(vo.therapeutic_area)
    ) AS therapeutic_areas
  FROM public.vilo_opportunities vo
  WHERE
    NOT vo.archived
    AND vo.therapeutic_area IS NOT NULL
    AND btrim(vo.therapeutic_area) <> ''
  GROUP BY vo.org_id
),
lead_agg AS (
  SELECT
    ob.id AS org_id,
    COUNT(DISTINCT pl.id) FILTER (
      WHERE pl.current_stage IN (
        'New Lead'::public.vitalis_stage,
        'Contact Attempted'::public.vitalis_stage,
        'Responded'::public.vitalis_stage
      )
    ) AS leads_in_pipeline,
    COUNT(DISTINCT pl.id) FILTER (
      WHERE pl.current_stage IN (
        'Prequalified'::public.vitalis_stage,
        'Scheduled'::public.vitalis_stage
      )
    ) AS screened_scheduled,
    COUNT(DISTINCT pl.id) FILTER (
      WHERE pl.current_stage = 'Enrolled'::public.vitalis_stage
    ) AS completed_visits,
    MIN(pl.created_at) AS first_lead_date,
    MAX(pl.updated_at) AS last_activity_date
  FROM org_base ob
  LEFT JOIN public.patient_leads pl
    ON NOT pl.archived
    AND (
      (
        pl.study_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.vilo_opportunities vox
          WHERE
            vox.org_id = ob.id
            AND NOT vox.archived
            AND vox.study_id = pl.study_id
        )
      )
      OR (
        pl.study_id IS NULL
        AND (
          pl.source_campaign ILIKE '%' || ob.name || '%'
          OR pl.notes ILIKE '%' || ob.name || '%'
          OR EXISTS (
            SELECT 1
            FROM public.vilo_opportunities vox
            WHERE
              vox.org_id = ob.id
              AND NOT vox.archived
              AND (
                pl.source_campaign ILIKE '%' || vox.company_name || '%'
                OR (
                  vox.therapeutic_area IS NOT NULL
                  AND pl.condition_or_study_interest ILIKE '%' || vox.therapeutic_area || '%'
                )
              )
          )
        )
      )
    )
  GROUP BY ob.id
)
SELECT
  ob.id AS company_id,
  ob.name AS company_name,
  ta.therapeutic_areas,
  COALESCE(oa.active_opportunities, 0::bigint) AS active_opportunities,
  COALESCE(oa.pipeline_forecast, 0::numeric(14, 2)) AS pipeline_forecast,
  COALESCE(la.leads_in_pipeline, 0::bigint) AS leads_in_pipeline,
  COALESCE(la.screened_scheduled, 0::bigint) AS screened_scheduled,
  COALESCE(la.completed_visits, 0::bigint) AS completed_visits,
  la.first_lead_date,
  la.last_activity_date
FROM org_base ob
LEFT JOIN opp_agg oa ON oa.org_id = ob.id
LEFT JOIN lead_agg la ON la.org_id = ob.id
LEFT JOIN therapeutic_agg ta ON ta.org_id = ob.id;

COMMENT ON VIEW public.v_sponsor_report_kpis IS
  'Per sponsor/CRO org: open Vilo pipeline counts/value, Vitalis lead funnel counts (study_id + fuzzy match). security_invoker respects RLS.';

GRANT SELECT ON public.v_sponsor_report_kpis TO authenticated;
