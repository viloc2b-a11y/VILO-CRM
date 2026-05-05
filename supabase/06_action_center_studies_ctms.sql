-- ============================================================
--  VILO CRM — Action items (Action Center), Studies, CTMS-lite
--  Run in Supabase SQL Editor AFTER 01 → 02 → 03 → 05
--
--  Design notes (aligned with project agreements):
--  • public.tasks remains the legacy operational task list; action_items is
--    the unified Action Center row (polymorphic record + BU + priority).
--    Migrate or sync in app logic when you retire tasks.
--  • HazloAsíYa is segregated via user_profiles.allowed_business_units.
--  • Studies + CTMS-lite are visible only to users with vilo_research or
--    vitalis in allowed_business_units (or admins), not Hazlo-only accounts.
--  • action_item_status: overdue is computed (due_date + status), not stored.
-- ============================================================

-- ── ENUMS (idempotent create) ─────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.bu_enum AS ENUM ('vilo_research', 'vitalis', 'hazloasiya');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.action_item_priority_enum AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.action_item_status_enum AS ENUM ('pending', 'in_progress', 'completed', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.action_item_record_enum AS ENUM (
    'opportunity',
    'patient',
    'user',
    'submission',
    'company',
    'contact',
    'campaign',
    'study',
    'study_site',
    'monitoring_visit',
    'protocol_deviation',
    'study_payment'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.study_lifecycle_enum AS ENUM ('planning', 'active', 'paused', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.site_activation_enum AS ENUM ('not_started', 'initiating', 'active', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.monitoring_visit_status_enum AS ENUM ('scheduled', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.protocol_deviation_status_enum AS ENUM ('open', 'under_review', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.study_payment_status_enum AS ENUM ('planned', 'invoiced', 'paid', 'void');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Profiles: BU access for RLS (Hazlo segregation) ──────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS allowed_business_units public.bu_enum[] NOT NULL
    DEFAULT ARRAY['vilo_research', 'vitalis']::public.bu_enum[];

COMMENT ON COLUMN public.user_profiles.allowed_business_units IS
  'BUs this user may see. Hazlo-only staff: ARRAY[hazloasiya]::bu_enum[]. Default: Vilo + Vitalis.';

-- ── Access helpers (SECURITY DEFINER; avoid RLS recursion) ──

CREATE OR REPLACE FUNCTION public.user_can_access_bu(p_bu public.bu_enum)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_app_admin()
  OR EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.active
      AND COALESCE(p.allowed_business_units, ARRAY[]::public.bu_enum[]) @> ARRAY[p_bu]::public.bu_enum[]
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_clinical_business_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_app_admin()
  OR EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.active
      AND COALESCE(p.allowed_business_units, ARRAY[]::public.bu_enum[])
        && ARRAY['vilo_research', 'vitalis']::public.bu_enum[]
  );
$$;

-- ── TABLE: studies (first-class; CTMS integration hooks) ─────

CREATE TABLE IF NOT EXISTS public.studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  protocol_identifier text,
  sponsor_display_name text,
  status public.study_lifecycle_enum NOT NULL DEFAULT 'planning',
  external_system text,
  external_id text,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_studies_status ON public.studies (status) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS idx_studies_external ON public.studies (external_system, external_id)
  WHERE external_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_studies_updated_at ON public.studies;
CREATE TRIGGER trg_studies_updated_at
  BEFORE UPDATE ON public.studies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Link existing CRM rows to studies (optional FKs)
ALTER TABLE public.vilo_opportunities
  ADD COLUMN IF NOT EXISTS study_id uuid REFERENCES public.studies (id) ON DELETE SET NULL;

ALTER TABLE public.patient_leads
  ADD COLUMN IF NOT EXISTS study_id uuid REFERENCES public.studies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vilo_study_id ON public.vilo_opportunities (study_id)
  WHERE study_id IS NOT NULL AND NOT archived;
CREATE INDEX IF NOT EXISTS idx_leads_study_id ON public.patient_leads (study_id)
  WHERE study_id IS NOT NULL AND NOT archived;

-- ── CTMS-lite (Vilo + Vitalis studies only) ──────────────────

CREATE TABLE IF NOT EXISTS public.study_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies (id) ON DELETE CASCADE,
  name text NOT NULL,
  site_number text,
  activation_status public.site_activation_enum NOT NULL DEFAULT 'not_started',
  activated_at timestamptz,
  external_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_study_sites_study ON public.study_sites (study_id);

DROP TRIGGER IF EXISTS trg_study_sites_updated_at ON public.study_sites;
CREATE TRIGGER trg_study_sites_updated_at
  BEFORE UPDATE ON public.study_sites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.study_monitoring_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_site_id uuid NOT NULL REFERENCES public.study_sites (id) ON DELETE CASCADE,
  visit_type text NOT NULL DEFAULT 'monitoring',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status public.monitoring_visit_status_enum NOT NULL DEFAULT 'scheduled',
  findings text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_monitoring_visits_site ON public.study_monitoring_visits (study_site_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_visits_scheduled ON public.study_monitoring_visits (scheduled_start)
  WHERE status = 'scheduled';

DROP TRIGGER IF EXISTS trg_study_monitoring_visits_updated_at ON public.study_monitoring_visits;
CREATE TRIGGER trg_study_monitoring_visits_updated_at
  BEFORE UPDATE ON public.study_monitoring_visits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.protocol_deviations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies (id) ON DELETE CASCADE,
  study_site_id uuid REFERENCES public.study_sites (id) ON DELETE SET NULL,
  summary text NOT NULL,
  detail text,
  status public.protocol_deviation_status_enum NOT NULL DEFAULT 'open',
  capa_notes text,
  detected_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  external_id text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_deviations_study ON public.protocol_deviations (study_id);
CREATE INDEX IF NOT EXISTS idx_deviations_status ON public.protocol_deviations (status);

DROP TRIGGER IF EXISTS trg_protocol_deviations_updated_at ON public.protocol_deviations;
CREATE TRIGGER trg_protocol_deviations_updated_at
  BEFORE UPDATE ON public.protocol_deviations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.study_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies (id) ON DELETE CASCADE,
  study_site_id uuid REFERENCES public.study_sites (id) ON DELETE SET NULL,
  description text NOT NULL,
  milestone_label text,
  amount_usd numeric(12, 2) NOT NULL,
  due_date date,
  paid_at timestamptz,
  status public.study_payment_status_enum NOT NULL DEFAULT 'planned',
  external_id text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_study_payments_study ON public.study_payments (study_id);
CREATE INDEX IF NOT EXISTS idx_study_payments_status ON public.study_payments (status);

DROP TRIGGER IF EXISTS trg_study_payments_updated_at ON public.study_payments;
CREATE TRIGGER trg_study_payments_updated_at
  BEFORE UPDATE ON public.study_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── TABLE: action_items (Action Center) ──────────────────────

CREATE TABLE IF NOT EXISTS public.action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit public.bu_enum NOT NULL,
  record_type public.action_item_record_enum NOT NULL,
  record_id uuid NOT NULL,
  title text NOT NULL,
  status public.action_item_status_enum NOT NULL DEFAULT 'pending',
  next_action text,
  due_date timestamptz,
  owner_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  priority public.action_item_priority_enum NOT NULL DEFAULT 'medium',
  value_usd numeric(12, 2),
  notes text,
  source text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON COLUMN public.action_items.source IS
  'Optional: orchestrator agent id, rule name, or "manual" for audit context.';

CREATE INDEX IF NOT EXISTS idx_action_items_owner ON public.action_items (owner_id)
  WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_action_items_bu_status ON public.action_items (business_unit, status);
CREATE INDEX IF NOT EXISTS idx_action_items_due ON public.action_items (due_date)
  WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_action_items_record ON public.action_items (record_type, record_id);

DROP TRIGGER IF EXISTS trg_action_items_updated_at ON public.action_items;
CREATE TRIGGER trg_action_items_updated_at
  BEFORE UPDATE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS: studies & CTMS-lite (clinical BU only) ─────────────

ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_monitoring_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocol_deviations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_all_studies ON public.studies;
CREATE POLICY clinical_all_studies
  ON public.studies FOR ALL
  TO authenticated
  USING (public.user_has_clinical_business_access())
  WITH CHECK (public.user_has_clinical_business_access());

DROP POLICY IF EXISTS clinical_all_study_sites ON public.study_sites;
CREATE POLICY clinical_all_study_sites
  ON public.study_sites FOR ALL
  TO authenticated
  USING (public.user_has_clinical_business_access())
  WITH CHECK (public.user_has_clinical_business_access());

DROP POLICY IF EXISTS clinical_all_monitoring_visits ON public.study_monitoring_visits;
CREATE POLICY clinical_all_monitoring_visits
  ON public.study_monitoring_visits FOR ALL
  TO authenticated
  USING (public.user_has_clinical_business_access())
  WITH CHECK (public.user_has_clinical_business_access());

DROP POLICY IF EXISTS clinical_all_protocol_deviations ON public.protocol_deviations;
CREATE POLICY clinical_all_protocol_deviations
  ON public.protocol_deviations FOR ALL
  TO authenticated
  USING (public.user_has_clinical_business_access())
  WITH CHECK (public.user_has_clinical_business_access());

DROP POLICY IF EXISTS clinical_all_study_payments ON public.study_payments;
CREATE POLICY clinical_all_study_payments
  ON public.study_payments FOR ALL
  TO authenticated
  USING (public.user_has_clinical_business_access())
  WITH CHECK (public.user_has_clinical_business_access());

-- ── RLS: action_items (per-BU; pool rows owner_id null allowed) ─

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_items_select ON public.action_items;
CREATE POLICY action_items_select
  ON public.action_items FOR SELECT
  TO authenticated
  USING (public.user_can_access_bu(business_unit));

DROP POLICY IF EXISTS action_items_insert ON public.action_items;
CREATE POLICY action_items_insert
  ON public.action_items FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_bu(business_unit));

DROP POLICY IF EXISTS action_items_update ON public.action_items;
CREATE POLICY action_items_update
  ON public.action_items FOR UPDATE
  TO authenticated
  USING (public.user_can_access_bu(business_unit))
  WITH CHECK (public.user_can_access_bu(business_unit));

DROP POLICY IF EXISTS action_items_delete ON public.action_items;
CREATE POLICY action_items_delete
  ON public.action_items FOR DELETE
  TO authenticated
  USING (public.user_can_access_bu(business_unit));

-- ── Grants ───────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.studies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_monitoring_visits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocol_deviations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_items TO authenticated;

GRANT USAGE ON TYPE public.bu_enum TO authenticated;
GRANT USAGE ON TYPE public.action_item_priority_enum TO authenticated;
GRANT USAGE ON TYPE public.action_item_status_enum TO authenticated;
GRANT USAGE ON TYPE public.action_item_record_enum TO authenticated;
GRANT USAGE ON TYPE public.study_lifecycle_enum TO authenticated;
GRANT USAGE ON TYPE public.site_activation_enum TO authenticated;
GRANT USAGE ON TYPE public.monitoring_visit_status_enum TO authenticated;
GRANT USAGE ON TYPE public.protocol_deviation_status_enum TO authenticated;
GRANT USAGE ON TYPE public.study_payment_status_enum TO authenticated;

-- ── Tighten legacy CRM tables: Hazlo-only users must not see Vilo/Vitalis PHI ─
-- Replaces flat "team_all_*" from 02_rls.sql. Users with only hazloasiya in
-- allowed_business_units lose SELECT/CRUD on these tables until Hazlo tables exist.

DROP POLICY IF EXISTS clinical_team_organizations ON public.organizations;
DROP POLICY IF EXISTS clinical_team_contacts ON public.contacts;
DROP POLICY IF EXISTS clinical_team_vilo ON public.vilo_opportunities;
DROP POLICY IF EXISTS clinical_team_leads ON public.patient_leads;
DROP POLICY IF EXISTS clinical_team_tasks ON public.tasks;

DROP POLICY IF EXISTS team_all_organizations ON public.organizations;
DROP POLICY IF EXISTS team_all_contacts ON public.contacts;
DROP POLICY IF EXISTS team_all_vilo ON public.vilo_opportunities;
DROP POLICY IF EXISTS team_all_leads ON public.patient_leads;
DROP POLICY IF EXISTS team_all_tasks ON public.tasks;

CREATE POLICY clinical_team_organizations
  ON public.organizations FOR ALL
  TO authenticated
  USING (public.is_app_admin() OR public.user_has_clinical_business_access())
  WITH CHECK (public.is_app_admin() OR public.user_has_clinical_business_access());

CREATE POLICY clinical_team_contacts
  ON public.contacts FOR ALL
  TO authenticated
  USING (public.is_app_admin() OR public.user_has_clinical_business_access())
  WITH CHECK (public.is_app_admin() OR public.user_has_clinical_business_access());

CREATE POLICY clinical_team_vilo
  ON public.vilo_opportunities FOR ALL
  TO authenticated
  USING (public.is_app_admin() OR public.user_has_clinical_business_access())
  WITH CHECK (public.is_app_admin() OR public.user_has_clinical_business_access());

CREATE POLICY clinical_team_leads
  ON public.patient_leads FOR ALL
  TO authenticated
  USING (public.is_app_admin() OR public.user_has_clinical_business_access())
  WITH CHECK (public.is_app_admin() OR public.user_has_clinical_business_access());

CREATE POLICY clinical_team_tasks
  ON public.tasks FOR ALL
  TO authenticated
  USING (public.is_app_admin() OR public.user_has_clinical_business_access())
  WITH CHECK (public.is_app_admin() OR public.user_has_clinical_business_access());
