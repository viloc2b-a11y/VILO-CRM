-- ============================================================
--  WhatsApp Cloud API — inbound (mensajes entrantes Meta)
--  Run after 20_hazlo_submissions_validator.sql + 01_schema (patient_leads).
--  Escritura: API route con SUPABASE_SERVICE_ROLE_KEY (bypass RLS).
--  Lectura: admins (is_app_admin) vía cliente autenticado.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text NOT NULL,
  wa_phone_number text NOT NULL,
  message_body text,
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'audio', 'document', 'button', 'quick_reply')),
  related_submission_id uuid REFERENCES public.submissions (id) ON DELETE SET NULL,
  related_patient_lead_id uuid REFERENCES public.patient_leads (id) ON DELETE SET NULL,
  intent_detected text,
  processed_status text NOT NULL DEFAULT 'pending'
    CHECK (processed_status IN ('pending', 'processed', 'ignored', 'failed')),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_inbound_messages_wa_message_id_key UNIQUE (wa_message_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_inbound_phone
  ON public.whatsapp_inbound_messages (wa_phone_number);

CREATE INDEX IF NOT EXISTS idx_wa_inbound_status_created
  ON public.whatsapp_inbound_messages (processed_status, created_at DESC);

COMMENT ON TABLE public.whatsapp_inbound_messages IS
  'Mensajes entrantes WhatsApp (Meta). intent_detected: ej. confirm_visit, pause_recovery, request_help, other.';

COMMENT ON COLUMN public.whatsapp_inbound_messages.wa_message_id IS
  'ID único del mensaje en Graph / webhook Meta.';

COMMENT ON COLUMN public.whatsapp_inbound_messages.related_patient_lead_id IS
  'Vitalis: patient_leads (no existe tabla patients en este esquema).';

-- Helper: solo dígitos (alineado a lib/whatsapp/client normalizeWhatsAppRecipient)
CREATE OR REPLACE FUNCTION public.normalize_phone(phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g');
$$;

COMMENT ON FUNCTION public.normalize_phone(text) IS
  'Quita no-dígitos; útil para matchear wa_phone_number con submissions.phone / patient_leads.';

ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.whatsapp_inbound_messages TO authenticated;

DROP POLICY IF EXISTS admin_read_wa_inbound ON public.whatsapp_inbound_messages;
CREATE POLICY admin_read_wa_inbound
  ON public.whatsapp_inbound_messages
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

COMMENT ON POLICY admin_read_wa_inbound ON public.whatsapp_inbound_messages IS
  'Solo rol admin en user_profiles; inserts vía service_role en API.';
