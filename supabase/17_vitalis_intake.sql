-- ============================================================
--  VILO CRM — Vitalis Intake Agent (dedup + consent + atribución)
--  Run after 01 (patient_leads). Tabla real: patient_leads (no "patients").
-- ============================================================

ALTER TABLE public.patient_leads
  ADD COLUMN IF NOT EXISTS consent_to_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intake_attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_intake_at timestamptz;

COMMENT ON COLUMN public.patient_leads.consent_to_contact IS
  'Consentimiento explícito (form / opt-in); no sustituye bases legales locales.';
COMMENT ON COLUMN public.patient_leads.intake_attribution IS
  'UTM, referral_code, canal raw (Meta/WhatsApp/web). Merge en re-intake.';
COMMENT ON COLUMN public.patient_leads.last_intake_at IS
  'Último toque del Intake Agent (nuevo evento o duplicado).';

ALTER TABLE public.patient_leads
  ADD COLUMN IF NOT EXISTS phone_normalized text
  GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) STORED;

ALTER TABLE public.patient_leads
  ADD COLUMN IF NOT EXISTS email_normalized text
  GENERATED ALWAYS AS (
    CASE
      WHEN nullif(trim(coalesce(email, '')), '') IS NULL THEN NULL
      ELSE lower(trim(coalesce(email, '')))
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_leads_phone_normalized ON public.patient_leads (phone_normalized)
  WHERE NOT archived AND length(coalesce(phone_normalized, '')) > 0;

CREATE INDEX IF NOT EXISTS idx_leads_email_normalized ON public.patient_leads (email_normalized)
  WHERE NOT archived AND email_normalized IS NOT NULL;
