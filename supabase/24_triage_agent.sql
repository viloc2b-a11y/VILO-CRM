-- ============================================================
--  Triage Agent — estado de ejecución (cron Action Center)
--  Run after 23_orchestrator_agent.sql
--  Lógica de scoring y priorización en app: lib/triage/run.ts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.triage_agent_state (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  last_triage_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00+00',
  last_critical_backlog_alert_at timestamptz
);

INSERT INTO public.triage_agent_state (id, last_triage_at)
VALUES ('default', '1970-01-01T00:00:00+00')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.triage_agent_state IS
  'Triage Agent 11: última corrida y anti-spam de alertas a managers.';

ALTER TABLE public.triage_agent_state ENABLE ROW LEVEL SECURITY;

-- Sin políticas: solo service_role (API cron) actualiza vía service key.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.triage_agent_state TO service_role;
