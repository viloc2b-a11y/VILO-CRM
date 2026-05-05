-- ============================================================
--  VILO RESEARCH — Campos B2B, vista de forecast y score de relación
--  Run after 01_schema (vilo_opportunities, contacts, organizations).
--
--  Ajustes vs. snippet genérico:
--  • Tabla `vilo_opportunities` (no `opportunities`); `status` = vilo_stage;
--    `potential_value` (no estimated_value); no hay probability → peso por etapa.
--  • `contacts.org_id` (no company_id).
--  • Cierres: Activated ≈ won, Closed Lost; Nurture excluido del pipeline abierto.
--  • Coexiste `next_followup_date` (date, legado); `next_follow_up` es timestamptz opcional.
-- ============================================================

-- ── 1. Columnas B2B en oportunidades ──────────────────────────

ALTER TABLE public.vilo_opportunities
  ADD COLUMN IF NOT EXISTS decision_maker_role text,
  ADD COLUMN IF NOT EXISTS last_interaction_type text,
  ADD COLUMN IF NOT EXISTS next_follow_up timestamptz,
  ADD COLUMN IF NOT EXISTS relationship_strength smallint,
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'pending';

DO $$ BEGIN
  ALTER TABLE public.vilo_opportunities
    ADD CONSTRAINT vilo_opportunities_last_interaction_type_check
      CHECK (last_interaction_type IS NULL OR last_interaction_type IN (
        'email', 'call', 'linkedin', 'meeting', 'proposal', 'none'
      ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.vilo_opportunities
    ADD CONSTRAINT vilo_opportunities_relationship_strength_check
      CHECK (relationship_strength IS NULL OR (relationship_strength >= 1 AND relationship_strength <= 5));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.vilo_opportunities
    ADD CONSTRAINT vilo_opportunities_enrichment_status_check
      CHECK (enrichment_status IN ('pending', 'processing', 'completed', 'failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.vilo_opportunities.decision_maker_role IS
  'Rol del tomador de decisión (B2B); distinto del role del contacto denormalizado.';
COMMENT ON COLUMN public.vilo_opportunities.last_interaction_type IS
  'Último tipo de touch de outreach.';
COMMENT ON COLUMN public.vilo_opportunities.next_follow_up IS
  'Siguiente seguimiento (timestamptz). Complementa next_followup_date (date).';
COMMENT ON COLUMN public.vilo_opportunities.relationship_strength IS
  '1–5; puede alimentarse desde calculate_relationship_strength(org_id).';
COMMENT ON COLUMN public.vilo_opportunities.enrichment_status IS
  'Estado de enriquecimiento de lead B2B.';

-- ── 2. Índices pipeline / seguimiento ────────────────────────

CREATE INDEX IF NOT EXISTS idx_vilo_b2b_pipeline_open
  ON public.vilo_opportunities (status, updated_at DESC)
  WHERE NOT archived
    AND status NOT IN (
      'Activated'::public.vilo_stage,
      'Closed Lost'::public.vilo_stage,
      'Nurture'::public.vilo_stage
    );

CREATE INDEX IF NOT EXISTS idx_vilo_b2b_next_follow_up
  ON public.vilo_opportunities (next_follow_up)
  WHERE NOT archived AND next_follow_up IS NOT NULL;

-- ── 3. Vista forecast (peso implícito por etapa vilo_stage) ───
-- Pesos editables; suman interpretación de “probabilidad” sin columna en tabla.

CREATE OR REPLACE VIEW public.v_vilo_pipeline_forecast
WITH (security_invoker = true) AS
WITH w AS (
  SELECT
    vo.*,
    CASE vo.status
      WHEN 'Lead Identified'::public.vilo_stage THEN 10::numeric
      WHEN 'Outreach Sent'::public.vilo_stage THEN 15::numeric
      WHEN 'Response Received'::public.vilo_stage THEN 25::numeric
      WHEN 'Intro Call Pending'::public.vilo_stage THEN 35::numeric
      WHEN 'Feasibility Sent'::public.vilo_stage THEN 55::numeric
      WHEN 'Negotiation'::public.vilo_stage THEN 75::numeric
      ELSE 10::numeric
    END AS stage_weight_pct
  FROM public.vilo_opportunities vo
  WHERE NOT vo.archived
    AND vo.status NOT IN (
      'Activated'::public.vilo_stage,
      'Closed Lost'::public.vilo_stage,
      'Nurture'::public.vilo_stage
    )
)
SELECT
  status AS stage,
  count(*)::bigint AS opp_count,
  coalesce(sum(potential_value), 0)::numeric(14, 2) AS total_value,
  coalesce(
    sum(coalesce(potential_value, 0) * stage_weight_pct / 100.0),
    0
  )::numeric(14, 2) AS weighted_value,
  count(*) FILTER (
    WHERE updated_at < (timezone('utc', now()) - interval '14 days')
      AND status IS DISTINCT FROM 'Nurture'::public.vilo_stage
  )::bigint AS stale_count,
  round(avg(stage_weight_pct), 1)::numeric(5, 1) AS avg_stage_weight_pct
FROM w
GROUP BY status
ORDER BY
  CASE status
    WHEN 'Lead Identified'::public.vilo_stage THEN 1
    WHEN 'Outreach Sent'::public.vilo_stage THEN 2
    WHEN 'Response Received'::public.vilo_stage THEN 3
    WHEN 'Intro Call Pending'::public.vilo_stage THEN 4
    WHEN 'Feasibility Sent'::public.vilo_stage THEN 5
    WHEN 'Negotiation'::public.vilo_stage THEN 6
    ELSE 99
  END;

COMMENT ON VIEW public.v_vilo_pipeline_forecast IS
  'Forecast por etapa Vilo: total_value = sum(potential_value); weighted_value pondera por stage_weight_pct (sin columna probability). security_invoker respeta RLS.';

GRANT SELECT ON public.v_vilo_pipeline_forecast TO authenticated;

-- ── 4. Score de relación por organización (org_id) ─────────────
-- Heurística: contactos, touches recientes en oportunidades, oportunidades abiertas.

CREATE OR REPLACE FUNCTION public.calculate_relationship_strength(p_org_id uuid)
RETURNS smallint
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_contacts int;
  v_recent_touches int;
  v_active_opps int;
  v_score int := 1;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN 1::smallint;
  END IF;

  SELECT count(*)::int INTO v_contacts
  FROM public.contacts c
  WHERE c.org_id = p_org_id AND NOT c.archived;

  SELECT count(*)::int INTO v_recent_touches
  FROM public.vilo_opportunities o
  WHERE o.org_id = p_org_id
    AND NOT o.archived
    AND (
      (o.last_contact_date IS NOT NULL AND o.last_contact_date >= (timezone('utc', now())::date - 30))
      OR o.updated_at >= (timezone('utc', now()) - interval '30 days')
    );

  SELECT count(*)::int INTO v_active_opps
  FROM public.vilo_opportunities o
  WHERE o.org_id = p_org_id
    AND NOT o.archived
    AND o.status IN (
      'Lead Identified'::public.vilo_stage,
      'Outreach Sent'::public.vilo_stage,
      'Response Received'::public.vilo_stage,
      'Intro Call Pending'::public.vilo_stage,
      'Feasibility Sent'::public.vilo_stage,
      'Negotiation'::public.vilo_stage
    );

  v_score := 1 + least(v_contacts, 3) + least(v_recent_touches, 2) + (v_active_opps * 2);
  RETURN least(v_score, 5)::smallint;
END;
$$;

COMMENT ON FUNCTION public.calculate_relationship_strength(uuid) IS
  'Heurística 1–5 por org: contactos, actividad reciente en opps, opps en pipeline abierto.';

GRANT EXECUTE ON FUNCTION public.calculate_relationship_strength(uuid) TO authenticated;
