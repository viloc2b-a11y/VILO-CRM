-- ============================================================
--  HazloAsíYa — columnas Square + webhook_events.source
--  Run after 26_webhook_events.sql
-- ============================================================

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS square_payment_id text,
  ADD COLUMN IF NOT EXISTS square_customer_id text,
  ADD COLUMN IF NOT EXISTS square_last_error_code text,
  ADD COLUMN IF NOT EXISTS square_last_error_message text;

COMMENT ON COLUMN public.submissions.square_payment_id IS
  'Square Payments API payment.id; usar reference_id en el pago = UUID de submissions.';

CREATE INDEX IF NOT EXISTS idx_submissions_square_payment
  ON public.submissions (square_payment_id)
  WHERE square_payment_id IS NOT NULL;

-- webhook_events.source / índice / RPC: ver 28_webhook_events_register_fn.sql
