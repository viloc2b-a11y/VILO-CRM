-- ============================================================
--  VILO CRM — Supabase PostgreSQL Schema
--  Version: 1.0
--  Tables: organizations, contacts, vilo_opportunities,
--          patient_leads, tasks
--  Schema: public (Supabase default)
-- ============================================================

-- ── EXTENSIONS ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── ENUMS ────────────────────────────────────────────────────

CREATE TYPE public.org_type AS ENUM (
  'CRO',
  'Sponsor',
  'Lab',
  'Biobank',
  'Partner',
  'Other'
);

CREATE TYPE public.priority_level AS ENUM (
  'High',
  'Medium',
  'Low'
);

CREATE TYPE public.vilo_stage AS ENUM (
  'Lead Identified',
  'Outreach Sent',
  'Response Received',
  'Intro Call Pending',
  'Feasibility Sent',
  'Negotiation',
  'Activated',
  'Closed Lost',
  'Nurture'
);

CREATE TYPE public.opportunity_type AS ENUM (
  'Phase I',
  'Phase II',
  'Phase III',
  'Phase IV',
  'Observational',
  'Registry',
  'Lab/Biobank'
);

CREATE TYPE public.lead_source AS ENUM (
  'LinkedIn',
  'Apollo',
  'ClinicalTrials.gov',
  'Conference',
  'Referral',
  'Cold Email',
  'Other'
);

CREATE TYPE public.vitalis_stage AS ENUM (
  'New Lead',
  'Contact Attempted',
  'Responded',
  'Prescreen Started',
  'Prequalified',
  'Scheduled',
  'No-show',
  'Enrolled',
  'Screen Fail',
  'Nurture / Future Study'
);

CREATE TYPE public.preferred_language AS ENUM (
  'Spanish',
  'English',
  'Bilingual'
);

CREATE TYPE public.contact_channel AS ENUM (
  'WhatsApp',
  'Phone',
  'SMS',
  'Email'
);

CREATE TYPE public.gender_value AS ENUM (
  'Female',
  'Male',
  'Non-binary',
  'Prefer not to say'
);

CREATE TYPE public.age_range_value AS ENUM (
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55-64',
  '65+'
);

CREATE TYPE public.task_channel AS ENUM (
  'vilo',
  'vitalis'
);

CREATE TYPE public.preferred_contact_method AS ENUM (
  'Email',
  'Phone',
  'LinkedIn',
  'WhatsApp'
);

-- ── UTILITY: auto-update updated_at ──────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

-- ── TABLE 1: organizations ────────────────────────────────────

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.org_type NOT NULL DEFAULT 'CRO',
  website text,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_orgs_type ON public.organizations (type) WHERE NOT archived;
CREATE INDEX idx_orgs_archived ON public.organizations (archived);
CREATE INDEX idx_orgs_name ON public.organizations (name) WHERE NOT archived;

CREATE TRIGGER trg_orgs_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── TABLE 2: contacts ─────────────────────────────────────────

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  full_name text NOT NULL,
  role text,
  email text,
  phone text,
  preferred_contact public.preferred_contact_method NOT NULL DEFAULT 'Email',
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_contacts_org_id ON public.contacts (org_id) WHERE NOT archived;
CREATE INDEX idx_contacts_email ON public.contacts (email) WHERE NOT archived AND email IS NOT NULL;
CREATE INDEX idx_contacts_archived ON public.contacts (archived);

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── TABLE 3: vilo_opportunities ───────────────────────────────

CREATE TABLE public.vilo_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts (id) ON DELETE SET NULL,

  company_name text NOT NULL,
  contact_name text,
  role text,
  email text,
  phone text,

  therapeutic_area text,
  opportunity_type public.opportunity_type,
  source public.lead_source,
  status public.vilo_stage NOT NULL DEFAULT 'Lead Identified',
  priority public.priority_level NOT NULL DEFAULT 'Medium',
  potential_value numeric(12, 2),
  notes text,

  last_contact_date date,
  next_followup_date date,

  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_vilo_status ON public.vilo_opportunities (status) WHERE NOT archived;
CREATE INDEX idx_vilo_priority ON public.vilo_opportunities (priority) WHERE NOT archived;
CREATE INDEX idx_vilo_followup ON public.vilo_opportunities (next_followup_date) WHERE NOT archived;
CREATE INDEX idx_vilo_org_id ON public.vilo_opportunities (org_id) WHERE NOT archived;
CREATE INDEX idx_vilo_archived ON public.vilo_opportunities (archived);

CREATE INDEX idx_vilo_overdue ON public.vilo_opportunities (next_followup_date)
  WHERE NOT archived
    AND status NOT IN ('Activated', 'Closed Lost', 'Nurture');

CREATE TRIGGER trg_vilo_updated_at
  BEFORE UPDATE ON public.vilo_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── TABLE 4: patient_leads ────────────────────────────────────

CREATE TABLE public.patient_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  full_name text NOT NULL,
  phone text NOT NULL,
  email text,

  preferred_language public.preferred_language NOT NULL DEFAULT 'Spanish',
  age_range public.age_range_value,
  gender public.gender_value,

  condition_or_study_interest text,
  source_campaign text,
  zip_code text,
  preferred_contact_channel public.contact_channel NOT NULL DEFAULT 'WhatsApp',

  current_stage public.vitalis_stage NOT NULL DEFAULT 'New Lead',
  next_action text,

  screen_fail_reason text,

  last_contact_date date,

  notes text,

  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT chk_screen_fail_reason CHECK (
    current_stage IS DISTINCT FROM 'Screen Fail'::public.vitalis_stage
    OR screen_fail_reason IS NOT NULL
  )
);

CREATE INDEX idx_leads_stage ON public.patient_leads (current_stage) WHERE NOT archived;
CREATE INDEX idx_leads_language ON public.patient_leads (preferred_language) WHERE NOT archived;
CREATE INDEX idx_leads_channel ON public.patient_leads (preferred_contact_channel) WHERE NOT archived;
CREATE INDEX idx_leads_source ON public.patient_leads (source_campaign) WHERE NOT archived;
CREATE INDEX idx_leads_last_contact ON public.patient_leads (last_contact_date) WHERE NOT archived;
CREATE INDEX idx_leads_archived ON public.patient_leads (archived);

CREATE INDEX idx_leads_created_today ON public.patient_leads (created_at)
  WHERE NOT archived AND current_stage = 'New Lead';

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.patient_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── TABLE 5: tasks ────────────────────────────────────────────

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  channel public.task_channel NOT NULL,
  priority public.priority_level NOT NULL DEFAULT 'Medium',
  due_date date NOT NULL,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,

  linked_vilo_id uuid REFERENCES public.vilo_opportunities (id) ON DELETE CASCADE,
  linked_vitalis_id uuid REFERENCES public.patient_leads (id) ON DELETE CASCADE,

  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT chk_task_single_link CHECK (
    NOT (linked_vilo_id IS NOT NULL AND linked_vitalis_id IS NOT NULL)
  ),
  CONSTRAINT chk_task_channel_link CHECK (
    (channel = 'vilo' AND linked_vitalis_id IS NULL)
    OR (channel = 'vitalis' AND linked_vilo_id IS NULL)
    OR (linked_vilo_id IS NULL AND linked_vitalis_id IS NULL)
  )
);

CREATE INDEX idx_tasks_due_date ON public.tasks (due_date) WHERE NOT done;
CREATE INDEX idx_tasks_channel ON public.tasks (channel) WHERE NOT done;
CREATE INDEX idx_tasks_linked_vilo ON public.tasks (linked_vilo_id) WHERE linked_vilo_id IS NOT NULL;
CREATE INDEX idx_tasks_linked_vitalis ON public.tasks (linked_vitalis_id) WHERE linked_vitalis_id IS NOT NULL;
CREATE INDEX idx_tasks_overdue ON public.tasks (due_date) WHERE NOT done AND due_date < (timezone('utc', now()))::date;

CREATE OR REPLACE FUNCTION public.set_task_done_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.done = true AND OLD.done = false THEN
    NEW.done_at := timezone('utc', now());
  ELSIF NEW.done = false THEN
    NEW.done_at := NULL;
  END IF;
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_done_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_done_at();

-- ── VIEWS (no ORDER BY — sort in application) ───────────────

CREATE OR REPLACE VIEW public.v_vilo_active AS
SELECT *
FROM public.vilo_opportunities
WHERE NOT archived
  AND status NOT IN ('Activated', 'Closed Lost');

CREATE OR REPLACE VIEW public.v_vilo_overdue AS
SELECT id, company_name, contact_name, status, priority, next_followup_date
FROM public.vilo_opportunities
WHERE NOT archived
  AND next_followup_date IS NOT NULL
  AND next_followup_date < (timezone('utc', now()))::date
  AND status NOT IN ('Activated', 'Closed Lost', 'Nurture');

CREATE OR REPLACE VIEW public.v_vitalis_active AS
SELECT *
FROM public.patient_leads
WHERE NOT archived
  AND current_stage NOT IN ('Enrolled', 'Screen Fail');

CREATE OR REPLACE VIEW public.v_tasks_overdue AS
SELECT *
FROM public.tasks
WHERE NOT done
  AND due_date < (timezone('utc', now()))::date;

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
   WHERE NOT archived AND current_stage = 'Scheduled') AS vitalis_scheduled,
  (SELECT count(*)::bigint
   FROM public.patient_leads
   WHERE NOT archived AND current_stage = 'Enrolled') AS vitalis_enrolled,
  (SELECT count(*)::bigint FROM public.tasks WHERE NOT done) AS tasks_pending,
  (SELECT count(*)::bigint FROM public.v_tasks_overdue) AS tasks_overdue;
