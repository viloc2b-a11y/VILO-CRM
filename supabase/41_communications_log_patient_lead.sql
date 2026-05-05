-- ============================================================
--  communications_log — Vitalis B2C (patient_lead_id + SMS)
--  Ejecutar después de 39_communications_log.sql y 01 (patient_leads).
--  Amplía canales y RLS: filas Vitalis vs B2B mutuamente excluyentes.
-- ============================================================

ALTER TABLE public.communications_log
  ADD COLUMN IF NOT EXISTS patient_lead_id uuid REFERENCES public.patient_leads (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.communications_log.patient_lead_id IS
  'Vitalis: patient_leads.id. Debe ser NULL en filas B2B (contact/org/opportunity).';

CREATE INDEX IF NOT EXISTS idx_comm_patient_lead_timeline
  ON public.communications_log (patient_lead_id, created_at DESC)
  WHERE patient_lead_id IS NOT NULL;

ALTER TABLE public.communications_log DROP CONSTRAINT IF EXISTS communications_log_channel_check;
ALTER TABLE public.communications_log ADD CONSTRAINT communications_log_channel_check CHECK (
  channel IN ('email', 'linkedin', 'call', 'meeting', 'whatsapp', 'other', 'sms')
);

DROP POLICY IF EXISTS communications_log_select_vilo ON public.communications_log;
DROP POLICY IF EXISTS communications_log_insert_vilo ON public.communications_log;

CREATE POLICY communications_log_select ON public.communications_log
  FOR SELECT
  TO authenticated
  USING (
    (
      patient_lead_id IS NOT NULL
      AND public.user_can_access_bu('vitalis'::public.bu_enum)
    )
    OR
    (
      patient_lead_id IS NULL
      AND public.user_can_access_bu('vilo_research'::public.bu_enum)
      AND (
        contact_id IS NOT NULL
        OR org_id IS NOT NULL
        OR opportunity_id IS NOT NULL
      )
    )
  );

CREATE POLICY communications_log_insert ON public.communications_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      patient_lead_id IS NOT NULL
      AND contact_id IS NULL
      AND org_id IS NULL
      AND opportunity_id IS NULL
      AND public.user_can_access_bu('vitalis'::public.bu_enum)
    )
    OR
    (
      patient_lead_id IS NULL
      AND public.user_can_access_bu('vilo_research'::public.bu_enum)
      AND (
        contact_id IS NOT NULL
        OR org_id IS NOT NULL
        OR opportunity_id IS NOT NULL
      )
    )
  );
