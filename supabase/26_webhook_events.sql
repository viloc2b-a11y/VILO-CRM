-- ============================================================
--  Idempotencia de webhooks (Stripe, Meta, …)
--  Run after 25_agent_control.sql (o cuando exista service role en API).
--  Solo el service_role escribe vía API; RLS sin políticas → anon/auth sin filas.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id text PRIMARY KEY,
  source text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  status text NOT NULL DEFAULT 'success',
  payload_preview text,
  CONSTRAINT webhook_events_source_check CHECK (source IN ('meta', 'stripe', 'square')),
  CONSTRAINT webhook_events_status_check CHECK (status IN ('success', 'ignored', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON public.webhook_events (processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source_date ON public.webhook_events (source, processed_at DESC);

COMMENT ON TABLE public.webhook_events IS
  'Dedup de entregas repetidas de webhooks (p. ej. Stripe event.id).';

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.webhook_events FROM PUBLIC;
GRANT ALL ON public.webhook_events TO service_role;
GRANT SELECT ON public.webhook_events TO authenticated;

DROP POLICY IF EXISTS admin_read_webhooks ON public.webhook_events;
CREATE POLICY admin_read_webhooks
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (public.is_app_admin());
