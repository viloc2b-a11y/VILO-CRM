-- ============================================================
--  Vilo CRM — Operational CRM MVP additions
--  Run after 42_communications_log_submission.sql
--
--  Minimal, additive patch:
--  - Adds requested canonical CRM tables.
--  - Expands legacy tasks into a polymorphic Action/Ops layer.
--  - Adds first-pass Orchestrator + Triage SQL primitives.
--  - Keeps existing app architecture and action_items intact.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.crm_business_unit_code AS ENUM ('vilo_research', 'vitalis', 'hazloasiya');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_task_status AS ENUM ('pending', 'in_progress', 'completed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.vilo_pipeline_stage AS ENUM (
    'lead_identified',
    'outreach_sent',
    'response_received',
    'intro_call_pending',
    'feasibility_sent',
    'negotiation',
    'closed_won',
    'closed_lost',
    'nurture'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.patient_pipeline_stage AS ENUM (
    'new_lead',
    'contact_attempted',
    'responded',
    'prescreen_started',
    'prequalified',
    'scheduled',
    'completed_visit',
    'no_show',
    'screen_fail',
    'do_not_contact',
    'nurture'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.hazlo_submission_stage AS ENUM (
    'visitor',
    'started',
    'submitted',
    'missing_documents',
    'ready_for_review',
    'paid',
    'pdf_delivered',
    'refunded',
    'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.priority_level ADD VALUE IF NOT EXISTS 'Critical';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.business_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code public.crm_business_unit_code NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

INSERT INTO public.business_units (code, name)
VALUES
  ('vilo_research', 'Vilo Research'),
  ('vitalis', 'Vitalis'),
  ('hazloasiya', 'HazloAsíYa')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

DROP TRIGGER IF EXISTS trg_business_units_updated_at ON public.business_units;
CREATE TRIGGER trg_business_units_updated_at
  BEFORE UPDATE ON public.business_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit public.crm_business_unit_code NOT NULL DEFAULT 'vilo_research',
  name text NOT NULL,
  company_type text,
  website text,
  estimated_value_usd numeric(12, 2),
  last_activity_at timestamptz,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS business_unit public.crm_business_unit_code NOT NULL DEFAULT 'vilo_research',
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit public.crm_business_unit_code NOT NULL DEFAULT 'vilo_research',
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts (id) ON DELETE SET NULL,
  title text NOT NULL,
  pipeline_stage public.vilo_pipeline_stage NOT NULL DEFAULT 'lead_identified',
  value_usd numeric(12, 2),
  probability_pct integer NOT NULL DEFAULT 25 CHECK (probability_pct BETWEEN 0 AND 100),
  expected_close_date date,
  last_activity_at timestamptz,
  next_followup_at timestamptz,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit public.crm_business_unit_code NOT NULL DEFAULT 'vitalis',
  name text NOT NULL,
  channel text,
  source text,
  spend_usd numeric(12, 2),
  starts_at date,
  ends_at date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit public.crm_business_unit_code NOT NULL DEFAULT 'vitalis',
  campaign_id uuid REFERENCES public.campaigns (id) ON DELETE SET NULL,
  full_name_encrypted text NOT NULL,
  phone_encrypted text,
  email_encrypted text,
  preferred_language text NOT NULL DEFAULT 'Spanish',
  condition_or_study_interest text,
  consent_to_contact boolean NOT NULL DEFAULT false,
  contacted_at timestamptz,
  priority_value_usd numeric(12, 2),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.patient_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  stage public.patient_pipeline_stage NOT NULL DEFAULT 'new_lead',
  entered_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  exited_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.hazlo_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit public.crm_business_unit_code NOT NULL DEFAULT 'hazloasiya',
  full_name text NOT NULL,
  email text,
  phone text,
  language text NOT NULL DEFAULT 'Spanish',
  last_activity_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS business_unit public.crm_business_unit_code NOT NULL DEFAULT 'hazloasiya',
  ADD COLUMN IF NOT EXISTS hazlo_user_id uuid REFERENCES public.hazlo_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS funnel_stage public.hazlo_submission_stage NOT NULL DEFAULT 'started',
  ADD COLUMN IF NOT EXISTS value_usd numeric(12, 2);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS business_unit public.crm_business_unit_code NOT NULL DEFAULT 'vilo_research',
  ADD COLUMN IF NOT EXISTS status public.crm_task_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS value_usd numeric(12, 2),
  ADD COLUMN IF NOT EXISTS priority_score numeric(6, 2),
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS linked_company_id uuid REFERENCES public.companies (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS linked_contact_id uuid REFERENCES public.contacts (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS linked_opportunity_id uuid REFERENCES public.opportunities (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS linked_patient_id uuid REFERENCES public.patients (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS linked_campaign_id uuid REFERENCES public.campaigns (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS linked_hazlo_user_id uuid REFERENCES public.hazlo_users (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS linked_submission_id uuid REFERENCES public.submissions (id) ON DELETE CASCADE;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS chk_task_polymorphic_target;
ALTER TABLE public.tasks ADD CONSTRAINT chk_task_polymorphic_target CHECK (
  num_nonnulls(
    linked_vilo_id,
    linked_vitalis_id,
    linked_company_id,
    linked_contact_id,
    linked_opportunity_id,
    linked_patient_id,
    linked_campaign_id,
    linked_hazlo_user_id,
    linked_submission_id
  ) <= 1
);

UPDATE public.tasks
SET status = CASE WHEN done THEN 'completed'::public.crm_task_status ELSE status END;

CREATE OR REPLACE FUNCTION public.crm_priority_score(
  p_value_usd numeric,
  p_due_date date,
  p_probability_pct numeric DEFAULT 50
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_points numeric;
  u_points numeric;
  p_points numeric;
BEGIN
  v_points := CASE
    WHEN p_value_usd IS NULL THEN 2
    WHEN p_value_usd > 50000 THEN 10
    WHEN p_value_usd > 10000 THEN 7
    WHEN p_value_usd > 1000 THEN 4
    ELSE 2
  END;

  u_points := CASE
    WHEN p_due_date IS NULL THEN 2
    WHEN p_due_date < (timezone('utc', now()))::date THEN 10
    WHEN p_due_date = (timezone('utc', now()))::date THEN 10
    WHEN p_due_date <= (timezone('utc', now()))::date + 3 THEN 7
    WHEN p_due_date <= (timezone('utc', now()))::date + 7 THEN 4
    ELSE 2
  END;

  p_points := CASE
    WHEN p_probability_pct IS NULL THEN 5
    WHEN p_probability_pct > 80 THEN 10
    WHEN p_probability_pct > 50 THEN 7
    WHEN p_probability_pct > 30 THEN 5
    ELSE 3
  END;

  RETURN round(((v_points * 0.40) + (u_points * 0.30) + (p_points * 0.30)) * 10, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_priority_from_score(p_score numeric)
RETURNS public.priority_level
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_score >= 80 THEN 'Critical'::public.priority_level
    WHEN p_score >= 60 THEN 'High'::public.priority_level
    WHEN p_score >= 40 THEN 'Medium'::public.priority_level
    ELSE 'Low'::public.priority_level
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_task_priority_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.priority_score := public.crm_priority_score(NEW.value_usd, NEW.due_date, 50);
  NEW.priority := public.crm_priority_from_score(NEW.priority_score);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_priority_score ON public.tasks;
CREATE TRIGGER trg_tasks_priority_score
  BEFORE INSERT OR UPDATE OF value_usd, due_date
  ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_priority_score();

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'user',
  action text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  business_unit public.crm_business_unit_code,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE OR REPLACE FUNCTION public.crm_orchestrator_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF TG_TABLE_NAME = 'patients' THEN
    IF TG_OP = 'INSERT' AND NEW.contacted_at IS NULL AND NOT NEW.archived THEN
      SELECT EXISTS (
        SELECT 1 FROM public.tasks
        WHERE linked_patient_id = NEW.id
          AND source = 'orchestrator:vitalis:new_patient_2h'
          AND status IN ('pending', 'in_progress')
      ) INTO v_exists;

      IF NOT v_exists THEN
        INSERT INTO public.tasks (
          title, channel, business_unit, due_date, status, value_usd, source, linked_patient_id
        ) VALUES (
          'Contactar lead Vitalis sin contacto',
          'vitalis',
          'vitalis',
          (timezone('utc', now()) + interval '2 hours')::date,
          'pending',
          NEW.priority_value_usd,
          'orchestrator:vitalis:new_patient_2h',
          NEW.id
        );
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'submissions' THEN
    IF NEW.payment_status = 'failed' AND NOT NEW.archived THEN
      SELECT EXISTS (
        SELECT 1 FROM public.tasks
        WHERE linked_submission_id = NEW.id
          AND source = 'orchestrator:hazlo:failed_payment'
          AND status IN ('pending', 'in_progress')
      ) INTO v_exists;

      IF NOT v_exists THEN
        INSERT INTO public.tasks (
          title, channel, business_unit, due_date, status, value_usd, source, linked_submission_id
        ) VALUES (
          'Recuperar pago fallido HazloAsíYa',
          'vilo',
          'hazloasiya',
          (timezone('utc', now()) + interval '12 hours')::date,
          'pending',
          NEW.value_usd,
          'orchestrator:hazlo:failed_payment',
          NEW.id
        );
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'opportunities' THEN
    IF NOT NEW.archived
      AND NEW.pipeline_stage NOT IN ('closed_won', 'closed_lost', 'nurture')
      AND coalesce(NEW.last_activity_at, NEW.created_at) < timezone('utc', now()) - interval '5 days'
    THEN
      SELECT EXISTS (
        SELECT 1 FROM public.tasks
        WHERE linked_opportunity_id = NEW.id
          AND source = 'orchestrator:vilo:stale_5d'
          AND status IN ('pending', 'in_progress')
      ) INTO v_exists;

      IF NOT v_exists THEN
        INSERT INTO public.tasks (
          title, channel, business_unit, due_date, status, value_usd, source, linked_opportunity_id
        ) VALUES (
          'Mover oportunidad Vilo sin actividad',
          'vilo',
          'vilo_research',
          (timezone('utc', now()) + interval '24 hours')::date,
          'pending',
          NEW.value_usd,
          'orchestrator:vilo:stale_5d',
          NEW.id
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_orchestrator_patients ON public.patients;
CREATE TRIGGER trg_crm_orchestrator_patients
  AFTER INSERT OR UPDATE OF contacted_at, archived ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.crm_orchestrator_on_change();

DROP TRIGGER IF EXISTS trg_crm_orchestrator_submissions ON public.submissions;
CREATE TRIGGER trg_crm_orchestrator_submissions
  AFTER INSERT OR UPDATE OF payment_status, archived ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.crm_orchestrator_on_change();

DROP TRIGGER IF EXISTS trg_crm_orchestrator_opportunities ON public.opportunities;
CREATE TRIGGER trg_crm_orchestrator_opportunities
  AFTER INSERT OR UPDATE OF pipeline_stage, last_activity_at, archived ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.crm_orchestrator_on_change();

CREATE OR REPLACE VIEW public.v_operational_action_center AS
SELECT
  t.id,
  t.business_unit,
  CASE
    WHEN t.due_date <= (timezone('utc', now()))::date THEN 'tasks_overdue_today'
    WHEN t.source = 'orchestrator:vitalis:new_patient_2h' THEN 'vitalis_uncontacted_2h'
    WHEN t.source = 'orchestrator:hazlo:failed_payment' THEN 'hazlo_failed_payments'
    WHEN t.source = 'orchestrator:vilo:stale_5d' THEN 'vilo_stale_opportunities'
    ELSE 'other'
  END AS action_group,
  t.title,
  t.status::text AS status,
  t.priority::text AS priority,
  t.priority_score,
  t.value_usd,
  t.due_date::timestamptz AS due_at,
  t.source,
  t.created_at,
  t.updated_at
FROM public.tasks t
WHERE t.status IN ('pending', 'in_progress')
  AND NOT t.done;

CREATE INDEX IF NOT EXISTS idx_companies_bu_name ON public.companies (business_unit, name) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON public.opportunities (pipeline_stage) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS idx_opportunities_stale ON public.opportunities (last_activity_at)
  WHERE NOT archived AND pipeline_stage NOT IN ('closed_won', 'closed_lost', 'nurture');
CREATE INDEX IF NOT EXISTS idx_patients_uncontacted ON public.patients (created_at)
  WHERE contacted_at IS NULL AND NOT archived;
CREATE INDEX IF NOT EXISTS idx_tasks_bu_status_due ON public.tasks (business_unit, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_priority_score ON public.tasks (priority_score DESC NULLS LAST)
  WHERE status IN ('pending', 'in_progress');

ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazlo_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_units_select ON public.business_units;
CREATE POLICY business_units_select ON public.business_units
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS companies_bu_access ON public.companies;
CREATE POLICY companies_bu_access ON public.companies
  FOR ALL TO authenticated
  USING (public.user_can_access_bu(business_unit::public.bu_enum))
  WITH CHECK (public.user_can_access_bu(business_unit::public.bu_enum));

DROP POLICY IF EXISTS opportunities_bu_access ON public.opportunities;
CREATE POLICY opportunities_bu_access ON public.opportunities
  FOR ALL TO authenticated
  USING (public.user_can_access_bu(business_unit::public.bu_enum))
  WITH CHECK (public.user_can_access_bu(business_unit::public.bu_enum));

DROP POLICY IF EXISTS campaigns_bu_access ON public.campaigns;
CREATE POLICY campaigns_bu_access ON public.campaigns
  FOR ALL TO authenticated
  USING (public.user_can_access_bu(business_unit::public.bu_enum))
  WITH CHECK (public.user_can_access_bu(business_unit::public.bu_enum));

DROP POLICY IF EXISTS patients_bu_access ON public.patients;
CREATE POLICY patients_bu_access ON public.patients
  FOR ALL TO authenticated
  USING (public.user_can_access_bu(business_unit::public.bu_enum))
  WITH CHECK (public.user_can_access_bu(business_unit::public.bu_enum));

DROP POLICY IF EXISTS patient_pipeline_bu_access ON public.patient_pipeline;
CREATE POLICY patient_pipeline_bu_access ON public.patient_pipeline
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_pipeline.patient_id
        AND public.user_can_access_bu(p.business_unit::public.bu_enum)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_pipeline.patient_id
        AND public.user_can_access_bu(p.business_unit::public.bu_enum)
    )
  );

DROP POLICY IF EXISTS hazlo_users_bu_access ON public.hazlo_users;
CREATE POLICY hazlo_users_bu_access ON public.hazlo_users
  FOR ALL TO authenticated
  USING (public.user_can_access_bu(business_unit::public.bu_enum))
  WITH CHECK (public.user_can_access_bu(business_unit::public.bu_enum));

DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_app_admin());

GRANT SELECT ON public.business_units TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_pipeline TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hazlo_users TO authenticated;
GRANT SELECT ON public.v_operational_action_center TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
