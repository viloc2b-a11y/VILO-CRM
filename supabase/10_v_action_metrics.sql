-- ============================================================
--  VILO CRM — v_action_metrics (filas clave / valor)
--  Run after 06 (action_items). RLS vía security_invoker.
--
--  Nota: no existe status = 'overdue' en action_items; "vencido" se define
--  como pending o in_progress con due_date < ahora (UTC).
-- ============================================================

DROP VIEW IF EXISTS public.v_action_metrics;

CREATE VIEW public.v_action_metrics
WITH (security_invoker = true)
AS
SELECT
  'total_pipeline_value'::text AS metric,
  COALESCE(SUM(value_usd), 0)::numeric AS value,
  'pending'::text AS status
FROM public.action_items
WHERE status = 'pending'::public.action_item_status_enum

UNION ALL

SELECT
  'overdue_count'::text,
  COUNT(*)::numeric,
  'overdue'::text
FROM public.action_items
WHERE status = ANY (
    ARRAY[
      'pending'::public.action_item_status_enum,
      'in_progress'::public.action_item_status_enum
    ]
  )
  AND due_date IS NOT NULL
  AND due_date < timezone('utc', now())

UNION ALL

SELECT
  'vilo_tasks'::text,
  COUNT(*)::numeric,
  'all'::text
FROM public.action_items
WHERE business_unit = 'vilo_research'::public.bu_enum
  AND status = ANY (
    ARRAY[
      'pending'::public.action_item_status_enum,
      'in_progress'::public.action_item_status_enum
    ]
  )

UNION ALL

SELECT
  'vitalis_tasks'::text,
  COUNT(*)::numeric,
  'all'::text
FROM public.action_items
WHERE business_unit = 'vitalis'::public.bu_enum
  AND status = ANY (
    ARRAY[
      'pending'::public.action_item_status_enum,
      'in_progress'::public.action_item_status_enum
    ]
  )

UNION ALL

SELECT
  'hazloasiya_tasks'::text,
  COUNT(*)::numeric,
  'all'::text
FROM public.action_items
WHERE business_unit = 'hazloasiya'::public.bu_enum
  AND status = ANY (
    ARRAY[
      'pending'::public.action_item_status_enum,
      'in_progress'::public.action_item_status_enum
    ]
  );

COMMENT ON VIEW public.v_action_metrics IS
  'Métricas por fila (metric, value, status). overdue_count usa due_date + estados abiertos.';

GRANT SELECT ON public.v_action_metrics TO authenticated;
