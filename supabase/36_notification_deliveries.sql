-- ============================================================
--  VILO CRM — Dedupe de alertas unificadas (Email + Slack)
--  Run after service role / RLS baseline. Solo service_role en app.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT notification_deliveries_key_len CHECK (char_length(idempotency_key) <= 512),
  CONSTRAINT notification_deliveries_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created
  ON public.notification_deliveries (created_at DESC);

COMMENT ON TABLE public.notification_deliveries IS
  'Claves idempotentes para el bus unificado Resend + Slack (anti-spam). INSERT único por key; sin políticas RLS para rol authenticated.';

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Sin políticas: anon/authenticated no leen ni escriben; service_role bypass RLS.
