-- ============================================================
--  Agent control + execution audit (alineado a VILO CRM actual)
--  Run after 24_triage_agent.sql
--  Mapa master prompt → repo: tasks = action_items; audit = activity_log + esta tabla.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_automation_settings (
  agent_key text PRIMARY KEY,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.agent_automation_settings IS
  'Toggle ON/OFF por agente (cron y Edge Functions deben consultar antes de ejecutar).';

INSERT INTO public.agent_automation_settings (agent_key, label, enabled)
VALUES
  ('orchestrator', 'Orchestrator (tareas desde cambios CRM)', true),
  ('triage', 'Triage (priorización Action Center)', true),
  ('vitalis_scheduler', 'Vitalis Scheduler', true),
  ('hazlo_validator', 'Hazlo Validator', true),
  ('hazlo_recovery', 'Hazlo Payment Recovery', true),
  ('hazlo_growth', 'Hazlo Growth / upsell', true),
  ('nurture', 'Nurture (Vilo)', true),
  ('proposal', 'Proposal Agent (Vilo)', true),
  ('intake', 'Intake / duplicados (Vitalis)', true),
  ('qualifier', 'Qualifier prescreen (Vitalis)', true)
ON CONFLICT (agent_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.agent_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  trigger_event text NOT NULL,
  input_data jsonb,
  output_data jsonb,
  status text NOT NULL CHECK (status IN ('success', 'retry', 'failed')),
  execution_time_ms integer NOT NULL CHECK (execution_time_ms >= 0),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.agent_execution_logs IS
  'Auditoría de ejecuciones de agentes (idempotencia, reintentos, fallos).';

CREATE INDEX IF NOT EXISTS idx_agent_exec_agent_created
  ON public.agent_execution_logs (agent_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_exec_status_created
  ON public.agent_execution_logs (status, created_at DESC);

-- Pausar automatización en un registro concreto (orchestrator/Edge deben respetar en app/SQL).
CREATE TABLE IF NOT EXISTS public.record_automation_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  paused boolean NOT NULL DEFAULT true,
  reason text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT record_automation_overrides_unique UNIQUE (table_name, record_id)
);

CREATE INDEX IF NOT EXISTS idx_record_automation_paused
  ON public.record_automation_overrides (table_name, record_id)
  WHERE paused;

DROP TRIGGER IF EXISTS trg_record_automation_overrides_updated_at ON public.record_automation_overrides;
CREATE TRIGGER trg_record_automation_overrides_updated_at
  BEFORE UPDATE ON public.record_automation_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.record_automation_overrides IS
  'Override manual: pausar agentes para una fila (table_name + record_id).';

ALTER TABLE public.agent_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_automation_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_settings_admin_select ON public.agent_automation_settings;
CREATE POLICY agent_settings_admin_select
  ON public.agent_automation_settings FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS agent_settings_admin_update ON public.agent_automation_settings;
CREATE POLICY agent_settings_admin_update
  ON public.agent_automation_settings FOR UPDATE
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

GRANT SELECT, UPDATE ON public.agent_automation_settings TO authenticated;

DROP POLICY IF EXISTS agent_exec_admin_select ON public.agent_execution_logs;
CREATE POLICY agent_exec_admin_select
  ON public.agent_execution_logs FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

GRANT SELECT ON public.agent_execution_logs TO authenticated;

DROP POLICY IF EXISTS record_override_admin_all ON public.record_automation_overrides;
CREATE POLICY record_override_admin_all
  ON public.record_automation_overrides FOR ALL
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.record_automation_overrides TO authenticated;
