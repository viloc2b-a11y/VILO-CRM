-- =============================================================================
-- REFERENCIA GREENFIELD — NO APLICAR sobre la base VILO CRM actual
-- =============================================================================
-- Este script define un modelo alternativo (companies/opportunities/patients/
-- tasks polimórfico, hazlo_users, audit_logs, agent_status distinto).
--
-- En VILO ya existen, entre otras:
--   • public.bu_enum (no bu_type), public.organizations (no companies),
--     public.vilo_opportunities, public.patient_leads, public.action_items,
--     public.submissions (esquema distinto: sin FK a hazlo_users),
--     public.activity_log, public.agent_execution_logs (25_agent_control.sql),
--     public.priority_level y public.vilo_stage con valores distintos.
--
-- Ejecutar este archivo en el proyecto actual provocaría errores de tipos
-- duplicados y tablas/colisiones. Úsalo solo como blueprint en una BD nueva
-- o como guía de migración diseñada explícitamente.
-- =============================================================================

-- 1. ENUMS & CORE
CREATE TYPE bu_type AS ENUM ('vilo_research', 'vitalis', 'hazloasiya');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'overdue', 'canceled');
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE agent_status AS ENUM ('queued', 'running', 'success', 'failed', 'retrying');

-- 2. BUSINESS UNITS
CREATE TABLE business_units (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  code bu_type NOT NULL UNIQUE,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused'))
);

-- 3. TASKS (Polimórfico + Agente tracking)
CREATE TABLE tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  status task_status DEFAULT 'pending',
  priority priority_level DEFAULT 'medium',
  due_date timestamptz NOT NULL,
  assigned_to uuid REFERENCES auth.users (id),
  related_id uuid NOT NULL,
  related_type text NOT NULL CHECK (related_type IN (
    'company', 'contact', 'opportunity', 'patient', 'campaign', 'hazlo_user', 'submission'
  )),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by_agent boolean DEFAULT false,
  agent_trigger text,
  business_unit bu_type NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tasks_polymorphic ON tasks (related_type, related_id);
CREATE INDEX idx_tasks_execution ON tasks (business_unit, status, priority, due_date);

-- 4. VILO RESEARCH
CREATE TYPE vilo_stage AS ENUM (
  'Lead identified',
  'Contacted',
  'Responded',
  'Intro call',
  'Feasibility sent',
  'Budget negotiation',
  'Contracting',
  'Active',
  'Closed won',
  'Closed lost',
  'Nurture'
);

CREATE TABLE companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  website text,
  therapeutic_areas text[],
  priority priority_level DEFAULT 'medium',
  status text DEFAULT 'prospect',
  business_unit bu_type NOT NULL DEFAULT 'vilo_research',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE contacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  linkedin text,
  company_id uuid REFERENCES companies (id),
  relationship_strength smallint CHECK (relationship_strength BETWEEN 1 AND 5),
  last_touch timestamptz,
  next_follow_up timestamptz,
  business_unit bu_type NOT NULL DEFAULT 'vilo_research'
);

CREATE TABLE opportunities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies (id),
  contact_id uuid REFERENCES contacts (id),
  type text,
  stage vilo_stage DEFAULT 'Lead identified',
  estimated_value numeric(12, 2),
  probability smallint CHECK (probability BETWEEN 0 AND 100),
  expected_close_date date,
  next_agent_action text,
  business_unit bu_type NOT NULL DEFAULT 'vilo_research',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. VITALIS
CREATE TABLE patients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text,
  phone text,
  email text,
  language text DEFAULT 'es',
  condition_interest text,
  source text,
  consent_flags jsonb DEFAULT '{"contact": false, "data": false}'::jsonb,
  status text DEFAULT 'New lead',
  eligibility_score smallint,
  prescreen_status text,
  next_contact_channel text,
  assigned_navigator uuid REFERENCES auth.users (id),
  business_unit bu_type NOT NULL DEFAULT 'vitalis',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  condition text,
  platform text,
  cost numeric(10, 2),
  leads_generated int DEFAULT 0,
  qualified_leads int DEFAULT 0,
  scheduled_visits int DEFAULT 0,
  completed_visits int DEFAULT 0,
  business_unit bu_type NOT NULL DEFAULT 'vitalis'
);

-- 6. HAZLOASÍYA
CREATE TABLE hazlo_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text,
  email text,
  phone text,
  language text DEFAULT 'es',
  funnel_used text,
  state text,
  account_status text DEFAULT 'active',
  paid_plan text,
  last_activity timestamptz,
  business_unit bu_type NOT NULL DEFAULT 'hazloasiya'
);

CREATE TABLE submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES hazlo_users (id),
  funnel_type text NOT NULL,
  completion_status text,
  validation_status text DEFAULT 'pending',
  missing_docs jsonb DEFAULT '[]'::jsonb,
  payment_status text DEFAULT 'pending',
  payment_recovery_attempts int DEFAULT 0,
  pdf_generated boolean DEFAULT false,
  business_unit bu_type NOT NULL DEFAULT 'hazloasiya',
  created_at timestamptz DEFAULT now()
);

-- 7. AUDIT & AGENT LOGS
CREATE TABLE audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id uuid,
  table_name text,
  -- Debe coincidir con TG_OP ('INSERT' | 'UPDATE' | 'DELETE')
  change_type text CHECK (change_type IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  user_id uuid REFERENCES auth.users (id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE agent_execution_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name text NOT NULL,
  trigger_event text,
  input_data jsonb,
  output_data jsonb,
  status agent_status DEFAULT 'queued',
  execution_time_ms int,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 8. RLS (ejemplo mínimo — en producción usar helpers tipo user_can_access_bu)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_tasks_select" ON tasks FOR SELECT TO authenticated
  USING (assigned_to IS NULL OR assigned_to = auth.uid());

-- 9. TRIGGER DE AUDITORÍA (corregido: INSERT no tiene OLD; change_type alineado a TG_OP)
CREATE OR REPLACE FUNCTION audit_task_changes() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (record_id, table_name, change_type, old_values, new_values, user_id)
    VALUES (OLD.id, 'tasks', 'DELETE', to_jsonb(OLD), NULL, auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (record_id, table_name, change_type, old_values, new_values, user_id)
    VALUES (NEW.id, 'tasks', 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (record_id, table_name, change_type, old_values, new_values, user_id)
    VALUES (NEW.id, 'tasks', 'INSERT', NULL, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tasks ON tasks;
CREATE TRIGGER trg_audit_tasks
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION audit_task_changes();
