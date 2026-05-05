-- ============================================================
--  webhook_events: Square/source, payload_preview, RPC, índice
--  Run after 27_hazlo_square.sql (o tras 26 si no usás 27).
--  Idempotente en tablas ya creadas.
-- ============================================================

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS payload_preview text;

COMMENT ON COLUMN public.webhook_events.payload_preview IS
  'Primeros 200 caracteres del payload (auditoría ligera).';

ALTER TABLE public.webhook_events DROP CONSTRAINT IF EXISTS webhook_events_source_check;
ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_source_check
  CHECK (source IN ('meta', 'stripe', 'square'));

ALTER TABLE public.webhook_events DROP CONSTRAINT IF EXISTS webhook_events_status_check;
ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_status_check
  CHECK (status IN ('success', 'ignored', 'failed', 'skipped'));

DROP INDEX IF EXISTS public.idx_webhook_events_source;
CREATE INDEX IF NOT EXISTS idx_webhook_events_source_date ON public.webhook_events (source, processed_at DESC);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.webhook_events TO authenticated;
DROP POLICY IF EXISTS admin_read_webhooks ON public.webhook_events;
CREATE POLICY admin_read_webhooks
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

CREATE OR REPLACE FUNCTION public.register_webhook_event(
  p_id text,
  p_source text,
  p_status text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source NOT IN ('meta', 'stripe', 'square') THEN
    RAISE EXCEPTION 'register_webhook_event: invalid source %', p_source;
  END IF;

  INSERT INTO public.webhook_events (id, source, status, payload_preview)
  VALUES (
    p_id,
    p_source,
    p_status,
    left(COALESCE(p_payload::text, ''), 200)
  )
  ON CONFLICT (id) DO UPDATE
    SET status = EXCLUDED.status,
        processed_at = timezone('utc', now());
END;
$$;

COMMENT ON FUNCTION public.register_webhook_event(text, text, text, jsonb) IS
  'Idempotencia: inserta webhook_events o actualiza status + processed_at si id ya existe.';

GRANT EXECUTE ON FUNCTION public.register_webhook_event(text, text, text, jsonb) TO service_role;
