-- ============================================================
--  Vitalis — Scheduler Agent (recordatorios / no-show / post-visita)
--  Run after 18_qualifier_agent.sql
--
--  Etapas nuevas en vitalis_stage:
--    • Visit Confirmed — confirmó asistencia (post mensaje 48h)
--    • Patient Lost — sin contacto tras flujo no-show (requiere screen_fail_reason)
-- ============================================================

DO $$
BEGIN
  ALTER TYPE public.vitalis_stage ADD VALUE 'Visit Confirmed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.vitalis_stage ADD VALUE 'Patient Lost';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.patient_leads
  ADD COLUMN IF NOT EXISTS scheduled_visit_at timestamptz,
  ADD COLUMN IF NOT EXISTS visit_site_address text,
  ADD COLUMN IF NOT EXISTS visit_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduler_state jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.patient_leads.scheduled_visit_at IS
  'Fecha/hora UTC de la visita (obligatorio para el scheduler).';
COMMENT ON COLUMN public.patient_leads.visit_site_address IS
  'Dirección del sitio para WhatsApp / enlace Maps.';
COMMENT ON COLUMN public.patient_leads.visit_completed_at IS
  'Primera vez que pasó a Enrolled; encuesta 24h después.';
COMMENT ON COLUMN public.patient_leads.scheduler_state IS
  'Idempotencia del agente: timestamps sent.*, no_show_at, etc.';

ALTER TABLE public.patient_leads DROP CONSTRAINT IF EXISTS chk_screen_fail_reason;
ALTER TABLE public.patient_leads ADD CONSTRAINT chk_screen_fail_or_lost_reason CHECK (
  (
    current_stage IS DISTINCT FROM 'Screen Fail'::public.vitalis_stage
    AND current_stage IS DISTINCT FROM 'Patient Lost'::public.vitalis_stage
  )
  OR (
    screen_fail_reason IS NOT NULL
    AND length(trim(screen_fail_reason)) > 0
  )
);

CREATE OR REPLACE FUNCTION public.set_patient_visit_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.current_stage = 'Enrolled'::public.vitalis_stage
    AND NEW.visit_completed_at IS NULL
    AND (
      TG_OP = 'INSERT'
      OR OLD.current_stage IS DISTINCT FROM 'Enrolled'::public.vitalis_stage
    )
  THEN
    NEW.visit_completed_at := timezone('utc', now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_leads_visit_completed ON public.patient_leads;
CREATE TRIGGER trg_patient_leads_visit_completed
  BEFORE INSERT OR UPDATE OF current_stage ON public.patient_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_patient_visit_completed_at();

CREATE OR REPLACE FUNCTION public.set_patient_no_show_scheduler_anchor()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.current_stage = 'No-show'::public.vitalis_stage THEN
    IF TG_OP = 'INSERT' THEN
      NEW.scheduler_state := jsonb_set(
        COALESCE(NEW.scheduler_state, '{}'::jsonb),
        '{no_show_at}',
        to_jsonb(timezone('utc', now())::text),
        true
      );
    ELSIF OLD.current_stage IS DISTINCT FROM 'No-show'::public.vitalis_stage THEN
      NEW.scheduler_state := jsonb_set(
        COALESCE(NEW.scheduler_state, '{}'::jsonb),
        '{no_show_at}',
        to_jsonb(timezone('utc', now())::text),
        true
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_leads_no_show_anchor ON public.patient_leads;
CREATE TRIGGER trg_patient_leads_no_show_anchor
  BEFORE INSERT OR UPDATE OF current_stage ON public.patient_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_patient_no_show_scheduler_anchor();

CREATE INDEX IF NOT EXISTS idx_leads_scheduler_visit
  ON public.patient_leads (current_stage, scheduled_visit_at)
  WHERE NOT archived AND scheduled_visit_at IS NOT NULL;

CREATE OR REPLACE VIEW public.v_vitalis_active AS
SELECT *
FROM public.patient_leads
WHERE NOT archived
  AND current_stage NOT IN ('Enrolled', 'Screen Fail', 'Patient Lost');

CREATE OR REPLACE VIEW public.v_dashboard_metrics AS
SELECT
  (SELECT count(*)::bigint
   FROM public.vilo_opportunities
   WHERE NOT archived AND status NOT IN ('Activated', 'Closed Lost')) AS vilo_active_count,
  (SELECT count(*)::bigint
   FROM public.vilo_opportunities
   WHERE NOT archived AND status = 'Feasibility Sent') AS vilo_feasibility_count,
  (SELECT count(*)::bigint
   FROM public.vilo_opportunities
   WHERE NOT archived AND status = 'Activated') AS vilo_won_count,
  (SELECT count(*)::bigint FROM public.v_vilo_overdue) AS vilo_overdue_count,
  (SELECT count(*)::bigint
   FROM public.patient_leads
   WHERE NOT archived AND (created_at AT TIME ZONE 'UTC')::date = (timezone('utc', now()))::date) AS vitalis_new_today,
  (SELECT count(*)::bigint
   FROM public.patient_leads
   WHERE NOT archived AND current_stage = 'Prescreen Started') AS vitalis_prescreens,
  (SELECT count(*)::bigint
   FROM public.patient_leads
   WHERE NOT archived AND current_stage IN ('Scheduled', 'Visit Confirmed')) AS vitalis_scheduled,
  (SELECT count(*)::bigint
   FROM public.patient_leads
   WHERE NOT archived AND current_stage = 'Enrolled') AS vitalis_enrolled,
  (SELECT count(*)::bigint FROM public.tasks WHERE NOT done) AS tasks_pending,
  (SELECT count(*)::bigint FROM public.v_tasks_overdue) AS tasks_overdue;
