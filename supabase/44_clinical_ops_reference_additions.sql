-- ============================================================
--  Vilo CRM — Clinical ops additions from project annexes
--  Run after 43_operational_crm_mvp.sql
--
--  Minimal CTMS-lite tables for the annex guidance:
--  - patient visits
--  - biospecimen chain of custody
--  - specimen shipments
--  - study invoices / revenue leakage tracking
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.patient_visit_status AS ENUM ('scheduled', 'completed', 'no_show', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.specimen_status AS ENUM ('planned', 'collected', 'processed', 'stored', 'shipped', 'received', 'lost', 'destroyed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.shipment_status AS ENUM ('draft', 'ready', 'in_transit', 'delivered', 'exception', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.patient_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid REFERENCES public.studies (id) ON DELETE SET NULL,
  patient_lead_id uuid REFERENCES public.patient_leads (id) ON DELETE SET NULL,
  visit_name text NOT NULL,
  scheduled_at timestamptz,
  completed_at timestamptz,
  status public.patient_visit_status NOT NULL DEFAULT 'scheduled',
  expected_revenue_usd numeric(12, 2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_patient_visits_study ON public.patient_visits (study_id);
CREATE INDEX IF NOT EXISTS idx_patient_visits_patient ON public.patient_visits (patient_lead_id);
CREATE INDEX IF NOT EXISTS idx_patient_visits_status_date ON public.patient_visits (status, scheduled_at);

DROP TRIGGER IF EXISTS trg_patient_visits_updated_at ON public.patient_visits;
CREATE TRIGGER trg_patient_visits_updated_at
  BEFORE UPDATE ON public.patient_visits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.specimens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid REFERENCES public.studies (id) ON DELETE SET NULL,
  patient_visit_id uuid REFERENCES public.patient_visits (id) ON DELETE SET NULL,
  patient_lead_id uuid REFERENCES public.patient_leads (id) ON DELETE SET NULL,
  accession_number text UNIQUE,
  specimen_type text NOT NULL,
  collected_at timestamptz,
  processed_at timestamptz,
  status public.specimen_status NOT NULL DEFAULT 'planned',
  current_location text,
  chain_of_custody jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_specimens_study ON public.specimens (study_id);
CREATE INDEX IF NOT EXISTS idx_specimens_visit ON public.specimens (patient_visit_id);
CREATE INDEX IF NOT EXISTS idx_specimens_status ON public.specimens (status);

DROP TRIGGER IF EXISTS trg_specimens_updated_at ON public.specimens;
CREATE TRIGGER trg_specimens_updated_at
  BEFORE UPDATE ON public.specimens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid REFERENCES public.studies (id) ON DELETE SET NULL,
  courier text,
  tracking_number text,
  destination_name text,
  destination_address text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  status public.shipment_status NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_shipments_study ON public.shipments (study_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON public.shipments (tracking_number) WHERE tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.shipments (status);

DROP TRIGGER IF EXISTS trg_shipments_updated_at ON public.shipments;
CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.shipment_specimens (
  shipment_id uuid NOT NULL REFERENCES public.shipments (id) ON DELETE CASCADE,
  specimen_id uuid NOT NULL REFERENCES public.specimens (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (shipment_id, specimen_id)
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid REFERENCES public.studies (id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  invoice_number text UNIQUE,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  amount_usd numeric(12, 2) NOT NULL DEFAULT 0,
  pass_through_costs_usd numeric(12, 2) NOT NULL DEFAULT 0,
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_invoices_study ON public.invoices (study_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices (organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON public.invoices (status, due_date);

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE VIEW public.v_revenue_leakage AS
SELECT
  i.id,
  i.study_id,
  i.organization_id,
  i.invoice_number,
  i.status,
  i.amount_usd,
  i.pass_through_costs_usd,
  (i.amount_usd - i.pass_through_costs_usd)::numeric(12, 2) AS gross_margin_usd,
  i.due_date,
  CASE
    WHEN i.status <> 'paid'::public.invoice_status
      AND i.due_date IS NOT NULL
      AND i.due_date < (timezone('utc', now()))::date
    THEN true
    ELSE false
  END AS is_overdue
FROM public.invoices i;

ALTER TABLE public.patient_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specimens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_specimens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_all_patient_visits ON public.patient_visits;
CREATE POLICY clinical_all_patient_visits
  ON public.patient_visits FOR ALL TO authenticated
  USING (public.user_has_clinical_business_access())
  WITH CHECK (public.user_has_clinical_business_access());

DROP POLICY IF EXISTS clinical_all_specimens ON public.specimens;
CREATE POLICY clinical_all_specimens
  ON public.specimens FOR ALL TO authenticated
  USING (public.user_has_clinical_business_access())
  WITH CHECK (public.user_has_clinical_business_access());

DROP POLICY IF EXISTS clinical_all_shipments ON public.shipments;
CREATE POLICY clinical_all_shipments
  ON public.shipments FOR ALL TO authenticated
  USING (public.user_has_clinical_business_access())
  WITH CHECK (public.user_has_clinical_business_access());

DROP POLICY IF EXISTS clinical_all_shipment_specimens ON public.shipment_specimens;
CREATE POLICY clinical_all_shipment_specimens
  ON public.shipment_specimens FOR ALL TO authenticated
  USING (public.user_has_clinical_business_access())
  WITH CHECK (public.user_has_clinical_business_access());

DROP POLICY IF EXISTS clinical_all_invoices ON public.invoices;
CREATE POLICY clinical_all_invoices
  ON public.invoices FOR ALL TO authenticated
  USING (public.user_has_clinical_business_access())
  WITH CHECK (public.user_has_clinical_business_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_visits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.specimens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_specimens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT ON public.v_revenue_leakage TO authenticated;
