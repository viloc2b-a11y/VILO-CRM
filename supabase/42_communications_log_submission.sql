-- ============================================================
--  communications_log — HazloAsíYa (submission_id)
--  Ejecutar después de 41_communications_log_patient_lead.sql
--  y 20 (submissions). RLS: filas Hazlo mutuamente excluyentes
--  con Vitalis / Vilo (una sola FK de contexto por fila).
-- ============================================================

ALTER TABLE public.communications_log
  ADD COLUMN IF NOT EXISTS submission_id uuid REFERENCES public.submissions (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.communications_log.submission_id IS
  'HazloAsíYa: submissions.id. NULL en filas Vitalis / Vilo.';

CREATE INDEX IF NOT EXISTS idx_comm_submission_timeline
  ON public.communications_log (submission_id, created_at DESC)
  WHERE submission_id IS NOT NULL;

DROP POLICY IF EXISTS communications_log_select ON public.communications_log;
DROP POLICY IF EXISTS communications_log_insert ON public.communications_log;

CREATE POLICY communications_log_select ON public.communications_log
  FOR SELECT
  TO authenticated
  USING (
    (
      submission_id IS NOT NULL
      AND public.user_can_access_bu('hazloasiya'::public.bu_enum)
    )
    OR
    (
      patient_lead_id IS NOT NULL
      AND submission_id IS NULL
      AND public.user_can_access_bu('vitalis'::public.bu_enum)
    )
    OR
    (
      patient_lead_id IS NULL
      AND submission_id IS NULL
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
      submission_id IS NOT NULL
      AND patient_lead_id IS NULL
      AND contact_id IS NULL
      AND org_id IS NULL
      AND opportunity_id IS NULL
      AND public.user_can_access_bu('hazloasiya'::public.bu_enum)
    )
    OR
    (
      patient_lead_id IS NOT NULL
      AND submission_id IS NULL
      AND contact_id IS NULL
      AND org_id IS NULL
      AND opportunity_id IS NULL
      AND public.user_can_access_bu('vitalis'::public.bu_enum)
    )
    OR
    (
      patient_lead_id IS NULL
      AND submission_id IS NULL
      AND public.user_can_access_bu('vilo_research'::public.bu_enum)
      AND (
        contact_id IS NOT NULL
        OR org_id IS NOT NULL
        OR opportunity_id IS NOT NULL
      )
    )
  );
