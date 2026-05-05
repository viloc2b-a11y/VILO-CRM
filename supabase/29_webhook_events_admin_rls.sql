-- ============================================================
--  webhook_events: índice source+fecha + RLS lectura admin
--  Run after 28_webhook_events_register_fn.sql (o 26 en greenfield ya incluye esto).
--  Ajuste respecto a snippets genéricos:
--  • user_profiles usa columna `role` (no `roles`); política vía is_app_admin().
--  • source/status son superconjunto (square, ignored) para APIs existentes.
-- ============================================================

DROP INDEX IF EXISTS public.idx_webhook_events_source;

CREATE INDEX IF NOT EXISTS idx_webhook_events_source_date
  ON public.webhook_events (source, processed_at DESC);

GRANT SELECT ON public.webhook_events TO authenticated;

DROP POLICY IF EXISTS admin_read_webhooks ON public.webhook_events;
CREATE POLICY admin_read_webhooks
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

COMMENT ON POLICY admin_read_webhooks ON public.webhook_events IS
  'Solo admins listan idempotencia webhooks; API con service_role sigue escribiendo sin RLS.';
