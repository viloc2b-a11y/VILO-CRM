-- ============================================================
--  HazloAsíYa — extras Opción C (recortada al esquema VILO CRM)
--  Run after 29_webhook_events_admin_rls.sql
--
--  NO aplica tal cual el SQL "Opción C" genérico porque aquí:
--  • No existe source_enum en submissions.
--  • webhook_events ya está en 26–29 (meta, stripe, square + RPC).
--  • action_items no tiene created_by_agent / agent_trigger ni UNIQUE
--    (record_type, record_id, agent_trigger); el fallo de pago ya genera
--    ítem en orchestrator_on_change() (23_orchestrator_agent.sql).
--  • growth_state ya es jsonb (22_hazlo_growth_agent.sql), no text+CHECK.
--  • No hay hazlo_users ni business_unit en submissions.
--
--  Este archivo solo añade columnas opcionales + vista de métricas MVP.
-- ============================================================

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS square_location_id text,
  ADD COLUMN IF NOT EXISTS payment_link_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_manual_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.submissions.square_location_id IS
  'Square Payments: location_id del vendedor / ubicación.';
COMMENT ON COLUMN public.submissions.payment_link_sent_at IS
  'Opcional: marca envío de link de pago al cliente.';
COMMENT ON COLUMN public.submissions.needs_manual_review IS
  'Bandera para revisión humana (UI / operaciones).';

CREATE INDEX IF NOT EXISTS idx_submissions_needs_review
  ON public.submissions (needs_manual_review)
  WHERE needs_manual_review AND NOT archived;

-- KPIs últimos 30 días (solo filas Hazlo: toda la tabla submissions es Hazlo).
-- revenue_usd_estimate: constante 49 USD por fila pagada — sustituir por
-- columna de monto real cuando exista.
CREATE OR REPLACE VIEW public.v_hazlo_metrics
WITH (security_invoker = true)
AS
SELECT
  count(*)::bigint AS submissions_30d,
  count(*) FILTER (WHERE completion_status = 'Funnel completed')::bigint AS funnels_completed,
  count(*) FILTER (WHERE payment_status = 'paid')::bigint AS paid_count,
  (49::numeric * count(*) FILTER (WHERE payment_status = 'paid')::numeric) AS revenue_usd_estimate,
  count(*) FILTER (WHERE completion_status = 'Ready for review')::bigint AS pending_reviews,
  count(*) FILTER (WHERE completion_status = 'Missing documents')::bigint AS missing_documents,
  count(*) FILTER (
    WHERE payment_status = 'paid'
      AND completion_status = 'PDF delivered'
      AND pdf_delivered_at IS NOT NULL
  )::bigint AS upsell_candidates_pdf_delivered,
  round(
    100.0 * count(*) FILTER (WHERE payment_status = 'paid')::numeric
      / nullif(count(*)::numeric, 0),
    2
  ) AS conversion_rate_pct_paid_over_all_30d
FROM public.submissions
WHERE NOT archived
  AND created_at >= timezone('utc', now()) - interval '30 days';

COMMENT ON VIEW public.v_hazlo_metrics IS
  'Métricas Hazlo 30d. conversion_rate_pct: pagos / todos los submissions en ventana. Ajustar precio en SQL o mover a columna.';

GRANT SELECT ON public.v_hazlo_metrics TO authenticated;
GRANT SELECT ON public.v_hazlo_metrics TO service_role;
