-- ============================================================
--  VILO CRM — Soporte Nurture Agent (emails + anti-duplicado)
--  Run after 01 (vilo_opportunities) y 05 (activity_log).
--
--  Reglas de negocio viven en Edge Function `nurture-agent`; aquí solo
--  estado mínimo y auditoría. Stages reales: public.vilo_stage (no
--  "Contacted" ni "Budget negotiation" literales del brief).
-- ============================================================

ALTER TABLE public.vilo_opportunities
  ADD COLUMN IF NOT EXISTS nurture_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS nurture_rules_fired jsonb NOT NULL DEFAULT '{}'::jsonb;
  -- nurture_rules_fired: { "intro_lead_identified": "2026-05-01T12:00:00Z", ... }

COMMENT ON COLUMN public.vilo_opportunities.nurture_last_sent_at IS
  'Último envío automático nurture (cualquier regla).';
COMMENT ON COLUMN public.vilo_opportunities.nurture_rules_fired IS
  'Clave de regla → ISO timestamp del último envío de esa regla (evita spam).';

CREATE OR REPLACE FUNCTION public.clear_nurture_rules_on_stage_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.nurture_rules_fired := '{}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vilo_clear_nurture_on_stage ON public.vilo_opportunities;
CREATE TRIGGER trg_vilo_clear_nurture_on_stage
  BEFORE UPDATE OF status ON public.vilo_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_nurture_rules_on_stage_change();

CREATE TABLE IF NOT EXISTS public.nurture_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.vilo_opportunities (id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  to_email text,
  subject text,
  resend_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_nurture_events_opp ON public.nurture_email_events (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_nurture_events_created ON public.nurture_email_events (created_at DESC);

ALTER TABLE public.nurture_email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nurture_events_admin_read ON public.nurture_email_events;
CREATE POLICY nurture_events_admin_read
  ON public.nurture_email_events FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

COMMENT ON TABLE public.nurture_email_events IS
  'Auditoría de envíos del Nurture Agent (Edge Function).';

GRANT SELECT ON public.nurture_email_events TO authenticated;
