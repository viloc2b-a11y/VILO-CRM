-- ============================================================
--  VILO CRM — Qualifier Agent (prescreening / puntuación)
--  Run after 17. Etapas: New Lead | Responded → invite → Prescreen Started
--  → webhook → Prequalified | Screen Fail (+ screen_fail_reason).
-- ============================================================

ALTER TABLE public.patient_leads
  ADD COLUMN IF NOT EXISTS prescreen_template_id text,
  ADD COLUMN IF NOT EXISTS prescreen_score numeric(5, 2),
  ADD COLUMN IF NOT EXISTS prescreen_exclusions jsonb,
  ADD COLUMN IF NOT EXISTS prescreen_invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS prescreen_completed_at timestamptz;

COMMENT ON COLUMN public.patient_leads.prescreen_template_id IS
  'diabetes | oncology | cardiovascular | default — ver lib/vitalis/qualifier-templates.ts';
COMMENT ON COLUMN public.patient_leads.prescreen_score IS
  '0–100 tras evaluar respuestas del cuestionario (webhook).';
COMMENT ON COLUMN public.patient_leads.prescreen_exclusions IS
  'Lista de motivos de exclusión (JSON).';
