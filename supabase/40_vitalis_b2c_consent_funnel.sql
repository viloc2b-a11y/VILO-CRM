-- ============================================================
--  VITALIS B2C — consentimiento auditado, dedup, navigators, funnel
--  Ejecutar en Supabase SQL Editor DESPUÉS de:
--    • 01_schema.sql (patient_leads, vitalis_stage, contact_channel)
--    • 05_auth_rbac_activity.sql (user_profiles: role, active)
--    • 06_action_center_studies_ctms.sql (bu_enum, user_can_access_bu)
--    • 17_vitalis_intake.sql (consent_to_contact, intake_attribution)
--
--  Ajustes vs. snippet genérico:
--    • patients → patient_leads; status → current_stage (enum)
--    • Etapas: 'New Lead', 'Contact Attempted', 'Responded', 'Prequalified', …
--    • roles[] / status → role IN (…) y active (ver función navigator)
--    • RLS consent log → user_can_access_bu('vitalis')
-- ============================================================

-- 1. Campos B2C / navegación (UTM también en intake_attribution; columnas = reporting rápido)
ALTER TABLE public.patient_leads
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS consent_flags jsonb NOT NULL DEFAULT '{"sms": false, "whatsapp": false, "email": false, "data": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_contact_channel text,
  ADD COLUMN IF NOT EXISTS navigator_notes text,
  ADD COLUMN IF NOT EXISTS assigned_navigator uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.patient_leads.consent_flags IS
  'Consentimiento granular por canal; complementa consent_to_contact (opt-in global).';
COMMENT ON COLUMN public.patient_leads.last_contact_channel IS
  'Último canal de contacto efectivo (puede diferir de preferred_contact_channel).';
COMMENT ON COLUMN public.patient_leads.assigned_navigator IS
  'auth.users.id del coordinador asignado (round-robin vía assign_navigator_round_robin).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_patient_leads_last_contact_channel'
      AND conrelid = 'public.patient_leads'::regclass
  ) THEN
    ALTER TABLE public.patient_leads
      ADD CONSTRAINT chk_patient_leads_last_contact_channel CHECK (
        last_contact_channel IS NULL
        OR last_contact_channel IN ('sms', 'whatsapp', 'email', 'call', 'none')
      );
  END IF;
END $$;

-- 2. Consentimiento auditado (append-only vía políticas)
CREATE TABLE IF NOT EXISTS public.vitalis_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_lead_id uuid NOT NULL REFERENCES public.patient_leads (id) ON DELETE CASCADE,
  channel text NOT NULL
    CHECK (channel IN ('sms', 'whatsapp', 'email', 'web_form', 'call')),
  granted boolean NOT NULL,
  source text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.vitalis_consent_log IS
  'Historial de opt-in/opt-out por canal (Vitalis B2C). Revisar retención vs. requisitos locales.';

CREATE INDEX IF NOT EXISTS idx_vitalis_consent_lead_created
  ON public.vitalis_consent_log (patient_lead_id, created_at DESC);

ALTER TABLE public.vitalis_consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vitalis_consent_log_select ON public.vitalis_consent_log;
CREATE POLICY vitalis_consent_log_select
  ON public.vitalis_consent_log FOR SELECT
  TO authenticated
  USING (public.user_can_access_bu('vitalis'::public.bu_enum));

DROP POLICY IF EXISTS vitalis_consent_log_insert ON public.vitalis_consent_log;
CREATE POLICY vitalis_consent_log_insert
  ON public.vitalis_consent_log FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_bu('vitalis'::public.bu_enum));

GRANT SELECT, INSERT ON public.vitalis_consent_log TO authenticated;

-- 3. Índices dedup / funnel (phone+email ya cubiertos por normalizados en 17; este es complementario)
CREATE INDEX IF NOT EXISTS idx_leads_phone_email_raw
  ON public.patient_leads (phone, email)
  WHERE NOT archived AND (phone IS NOT NULL OR email IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_leads_stage_updated
  ON public.patient_leads (current_stage, updated_at DESC)
  WHERE NOT archived;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_navigator
  ON public.patient_leads (assigned_navigator, current_stage)
  WHERE NOT archived
    AND assigned_navigator IS NOT NULL
    AND current_stage IN (
      'New Lead'::public.vitalis_stage,
      'Contact Attempted'::public.vitalis_stage,
      'Responded'::public.vitalis_stage,
      'Scheduled'::public.vitalis_stage
    );

-- 4. Funnel por fuente / UTM / último canal (30 días, no archivados)
CREATE OR REPLACE VIEW public.v_vitalis_funnel_metrics
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    COALESCE(NULLIF(TRIM(pl.source_campaign), ''), '(none)') AS source_label,
    COALESCE(
      NULLIF(TRIM(pl.utm_source), ''),
      NULLIF(TRIM(pl.intake_attribution->>'utm_source'), ''),
      '(direct)'
    ) AS utm_source,
    COALESCE(pl.last_contact_channel, 'none') AS last_contact_channel,
    pl.current_stage,
    COUNT(*)::bigint AS cnt,
    COUNT(*) FILTER (WHERE pl.current_stage = 'New Lead'::public.vitalis_stage)::bigint AS new_leads,
    COUNT(*) FILTER (
      WHERE pl.current_stage IN (
        'Prequalified'::public.vitalis_stage,
        'Scheduled'::public.vitalis_stage,
        'Enrolled'::public.vitalis_stage
      )
    )::bigint AS conversions
  FROM public.patient_leads pl
  WHERE NOT pl.archived
    AND pl.created_at >= timezone('utc', now()) - interval '30 days'
  GROUP BY 1, 2, 3, 4
)
SELECT
  source_label AS source,
  utm_source,
  last_contact_channel,
  SUM(cnt) AS total_leads,
  SUM(new_leads) AS new_leads,
  SUM(conversions) AS conversions,
  CASE
    WHEN SUM(new_leads) > 0
    THEN ROUND((SUM(conversions)::numeric / NULLIF(SUM(new_leads), 0)) * 100, 1)
    ELSE 0::numeric
  END AS conversion_rate
FROM base
GROUP BY 1, 2, 3
ORDER BY total_leads DESC;

COMMENT ON VIEW public.v_vitalis_funnel_metrics IS
  'Métricas agregadas Vitalis (últimos 30 días). Respeta RLS de patient_leads.';

GRANT SELECT ON public.v_vitalis_funnel_metrics TO authenticated;

-- 5. Round-robin: menor carga en etapas activas (coordinadores activos)
--    Ampliar el predicado de role si añades p.ej. 'navigator' al CHECK de user_profiles.
CREATE OR REPLACE FUNCTION public.assign_navigator_round_robin(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nav uuid;
  v_best uuid;
  v_min int := 2147483647;
  v_cnt int;
BEGIN
  FOR v_nav IN
    SELECT p.id
    FROM public.user_profiles p
    WHERE p.active
      AND p.role = 'coordinator'
  LOOP
    SELECT count(*)::int INTO v_cnt
    FROM public.patient_leads pl
    WHERE pl.assigned_navigator = v_nav
      AND NOT pl.archived
      AND pl.current_stage IN (
        'New Lead'::public.vitalis_stage,
        'Contact Attempted'::public.vitalis_stage,
        'Responded'::public.vitalis_stage,
        'Scheduled'::public.vitalis_stage
      );
    IF v_cnt < v_min THEN
      v_min := v_cnt;
      v_best := v_nav;
    END IF;
  END LOOP;

  RETURN v_best;
END;
$$;

COMMENT ON FUNCTION public.assign_navigator_round_robin(uuid) IS
  'Devuelve user id del coordinador activo con menos leads abiertos (Vitalis). p_lead_id reservado para trazas futuras.';

REVOKE ALL ON FUNCTION public.assign_navigator_round_robin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_navigator_round_robin(uuid) TO authenticated;
