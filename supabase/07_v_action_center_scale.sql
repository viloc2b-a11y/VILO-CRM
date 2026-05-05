-- ============================================================
--  VILO CRM — Action Center scale path (MVP-safe)
--  Run AFTER 06_action_center_studies_ctms.sql
--
--  • v_action_center: today = SELECT from action_items. Later replace body
--    with UNION ALL of normalized rows (tasks, leads, hazlo_*) — UI unchanged.
--  • v_action_center_metrics: aggregates respect RLS (security_invoker).
--  • Reglas auto action_items por etapa: ver 08_sync_action_items_crm.sql
--    (sustituye el trigger puntual de Negociación que existía en versiones
--    anteriores de este archivo).
-- ============================================================

-- ── Unified feed (passthrough MVP) ────────────────────────────

DROP VIEW IF EXISTS public.v_action_center;

CREATE VIEW public.v_action_center
WITH (security_invoker = true)
AS
SELECT *
FROM public.action_items;

COMMENT ON VIEW public.v_action_center IS
  'Action Center source. MVP: mirrors action_items. Scale: UNION ALL normalized rows from tasks, opportunities, patient_leads, hazlo_*, etc., with identical column set.';

-- ── Metrics (per-user via RLS on underlying action_items) ───

DROP VIEW IF EXISTS public.v_action_center_metrics;

CREATE VIEW public.v_action_center_metrics
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) FILTER (
    WHERE priority = 'critical'::public.action_item_priority_enum
      AND status = ANY (
        ARRAY[
          'pending'::public.action_item_status_enum,
          'in_progress'::public.action_item_status_enum
        ]
      )
  )::bigint AS critical,
  COALESCE(
    SUM(value_usd) FILTER (WHERE status = 'pending'::public.action_item_status_enum),
    0::numeric
  ) AS pipeline_value
FROM public.action_items;

COMMENT ON VIEW public.v_action_center_metrics IS
  'Counts/sums only rows visible to the current user (RLS on action_items).';

-- ── Grants ───────────────────────────────────────────────────

GRANT SELECT ON public.v_action_center TO authenticated;
GRANT SELECT ON public.v_action_center_metrics TO authenticated;
