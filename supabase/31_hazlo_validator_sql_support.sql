-- ============================================================
--  HazloAsíYa — Validator: columnas de apoyo + tarea baja confianza
--  Run after 30_hazlo_square_extras_and_metrics.sql (o tras 20+ si no usás 30).
--
--  Reemplaza el SQL genérico del chat que refería hazlo_users, business_unit,
--  validation_status, agent_trigger, etc. (no existen en este repo).
-- ============================================================

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS validation_confidence numeric(4, 3),
  ADD COLUMN IF NOT EXISTS validation_errors text[],
  ADD COLUMN IF NOT EXISTS extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.submissions.validation_confidence IS
  '0–1 agregado del Validator (p. ej. media quality_scores/100); ver lib/hazlo/validator/run.ts.';
COMMENT ON COLUMN public.submissions.validation_errors IS
  'Mensajes cortos derivados de validation_report.issues (denormalizado para SQL/triggers).';
COMMENT ON COLUMN public.submissions.extracted_data IS
  'Opcional: recorte denormalizado de extracciones; el informe canónico sigue en validation_report.';

ALTER TABLE public.submissions
  DROP CONSTRAINT IF EXISTS submissions_validation_confidence_range;

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_validation_confidence_range
  CHECK (validation_confidence IS NULL OR (validation_confidence >= 0 AND validation_confidence <= 1));

-- ── Tarea Action Center: confianza baja (< 0.85) ─────────────
--  No duplicar si ya hay tarea borderline (needs_human_review la crea el TS).

CREATE OR REPLACE FUNCTION public.trg_hazlo_validation_low_confidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overall text;
  v_next text;
  v_pri public.action_item_priority_enum;
  v_title text;
BEGIN
  IF NEW.validation_confidence IS NULL OR NEW.validation_confidence >= 0.85 THEN
    RETURN NEW;
  END IF;

  IF NEW.validation_report IS NOT NULL
     AND jsonb_typeof(NEW.validation_report) = 'object'
     AND NEW.validation_report ? 'overall' THEN
    v_overall := NEW.validation_report->>'overall';
    IF v_overall = 'needs_human_review' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.action_items ai
    WHERE ai.record_type = 'submission'
      AND ai.record_id = NEW.id
      AND ai.source = 'hazlo:validator:low_confidence'
      AND ai.status IN ('pending', 'in_progress')
  ) THEN
    RETURN NEW;
  END IF;

  v_pri :=
    CASE
      WHEN NEW.validation_confidence < 0.5 THEN 'critical'::public.action_item_priority_enum
      ELSE 'high'::public.action_item_priority_enum
    END;

  v_next := 'Verificar documentos y validation_report';
  IF NEW.validation_errors IS NOT NULL AND cardinality(NEW.validation_errors) > 0 THEN
    v_next := v_next || ': ' || array_to_string(NEW.validation_errors, '; ');
  END IF;

  v_title := 'Revisar validación (baja confianza) — ' || COALESCE(NEW.name, 'Usuario')
    || ' — ' || LEFT(NEW.id::text, 8);

  INSERT INTO public.action_items (
    business_unit,
    record_type,
    record_id,
    title,
    status,
    next_action,
    due_date,
    priority,
    source,
    notes
  ) VALUES (
    'hazloasiya',
    'submission',
    NEW.id,
    v_title,
    'pending',
    v_next,
    timezone('utc', now()) + interval '4 hours',
    v_pri,
    'hazlo:validator:low_confidence',
    'Validator SQL — confidence ' || NEW.validation_confidence::text
      || COALESCE(' | errors: ' || array_to_string(NEW.validation_errors, ' | '), '')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_validation_low_confidence ON public.submissions;
CREATE TRIGGER trg_submissions_validation_low_confidence
  AFTER UPDATE OF validation_confidence, validation_errors
  ON public.submissions
  FOR EACH ROW
  WHEN (NEW.validation_confidence IS NOT NULL AND NEW.validation_confidence < 0.85)
  EXECUTE FUNCTION public.trg_hazlo_validation_low_confidence();

COMMENT ON FUNCTION public.trg_hazlo_validation_low_confidence IS
  'Inserta action_item si validation_confidence < 0.85 (salvo needs_human_review / duplicado).';

-- ── Vista: cola de revisión por confianza ───────────────────

CREATE OR REPLACE VIEW public.v_hazlo_review_queue
WITH (security_invoker = true)
AS
SELECT
  s.id,
  s.funnel_type,
  s.completion_status,
  s.validation_confidence,
  s.validation_errors,
  s.validation_report,
  s.validation_ran_at,
  s.name AS contact_name,
  s.email AS contact_email,
  s.phone AS contact_phone,
  s.created_at,
  (
    SELECT count(*)::bigint
    FROM jsonb_object_keys(
      CASE
        WHEN s.document_paths IS NOT NULL
          AND jsonb_typeof(s.document_paths) = 'object' THEN s.document_paths
        ELSE '{}'::jsonb
      END
    ) AS _k
  ) AS document_key_count
FROM public.submissions s
WHERE NOT s.archived
  AND s.validation_confidence IS NOT NULL
  AND s.validation_confidence < 0.85
ORDER BY s.validation_confidence ASC NULLS LAST, s.created_at DESC;

COMMENT ON VIEW public.v_hazlo_review_queue IS
  'Expedientes Hazlo con confianza de validación < 0.85 (RLS vía security_invoker en submissions).';

GRANT SELECT ON public.v_hazlo_review_queue TO authenticated;
GRANT SELECT ON public.v_hazlo_review_queue TO service_role;

-- ── RPC: marcar revisión manual en validation_report ────────

CREATE OR REPLACE FUNCTION public.mark_submission_reviewed(
  p_submission_id uuid,
  p_approved boolean,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.id = p_submission_id
      AND NOT s.archived
      AND (
        s.user_id = v_uid
        OR public.user_can_access_bu('hazloasiya'::public.bu_enum)
      )
  ) THEN
    RAISE EXCEPTION 'submission_not_found_or_forbidden';
  END IF;

  UPDATE public.submissions
  SET
    validation_report =
      jsonb_set(
        COALESCE(validation_report, '{}'::jsonb),
        '{manual_review}',
        jsonb_build_object(
          'reviewed_at', timezone('utc', now()),
          'reviewer_id', v_uid,
          'notes', p_notes,
          'approved', p_approved
        ),
        true
      ),
    needs_manual_review = NOT p_approved,
    updated_at = timezone('utc', now())
  WHERE id = p_submission_id;

  UPDATE public.action_items
  SET
    status = 'completed'::public.action_item_status_enum,
    notes = trim(
      both ' | '
      FROM concat_ws(
        ' | ',
        NULLIF(trim(both FROM notes), ''),
        'Revisado manualmente: ' || COALESCE(p_notes, '(sin notas)')
      )
    ),
    updated_at = timezone('utc', now())
  WHERE record_type = 'submission'
    AND record_id = p_submission_id
    AND status = 'pending'::public.action_item_status_enum
    AND source IN (
      'hazlo:validator:low_confidence',
      'hazlo:validator:borderline'
    );
END;
$$;

COMMENT ON FUNCTION public.mark_submission_reviewed IS
  'Merge manual_review en validation_report; cierra tareas validator low_confidence/borderline.';

GRANT EXECUTE ON FUNCTION public.mark_submission_reviewed(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_submission_reviewed(uuid, boolean, text) TO service_role;
