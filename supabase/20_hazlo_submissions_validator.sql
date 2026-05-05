-- ============================================================
--  HazloAsíYa — submissions + Validator Agent (schema)
--  Run after 19_vitalis_scheduler.sql
--
--  Trigger negocio: completion_status = 'Funnel completed'
--  Post-validación: 'Ready for review' | 'Missing documents'
-- ============================================================

CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  funnel_type text NOT NULL CHECK (funnel_type IN ('snap_medicaid', 'daca_itin')),
  completion_status text NOT NULL DEFAULT 'in_progress',
  payment_status text,
  residence_address text,
  /** Rutas en bucket `hazlo-docs`: { "id_document": "userId/subId/file.pdf", ... } */
  document_paths jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_report jsonb,
  validation_ran_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_submissions_completion
  ON public.submissions (completion_status)
  WHERE NOT archived;
CREATE INDEX IF NOT EXISTS idx_submissions_funnel ON public.submissions (funnel_type) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS idx_submissions_user ON public.submissions (user_id) WHERE NOT archived;

COMMENT ON TABLE public.submissions IS 'HazloAsíYa — expedientes; validador automático vía API /api/hazlo/validator/tick';
COMMENT ON COLUMN public.submissions.validation_report IS 'JSON informe Validator Agent (issues, quality_scores, overall).';

DROP TRIGGER IF EXISTS trg_submissions_updated_at ON public.submissions;
CREATE TRIGGER trg_submissions_updated_at
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS submissions_select ON public.submissions;
CREATE POLICY submissions_select
  ON public.submissions FOR SELECT TO authenticated
  USING (
    NOT archived
    AND (
      user_id = auth.uid()
      OR public.user_can_access_bu('hazloasiya'::public.bu_enum)
    )
  );

DROP POLICY IF EXISTS submissions_insert ON public.submissions;
CREATE POLICY submissions_insert
  ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS submissions_update ON public.submissions;
CREATE POLICY submissions_update
  ON public.submissions FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_can_access_bu('hazloasiya'::public.bu_enum)
  );

DROP POLICY IF EXISTS submissions_delete ON public.submissions;
CREATE POLICY submissions_delete
  ON public.submissions FOR DELETE TO authenticated
  USING (public.user_can_access_bu('hazloasiya'::public.bu_enum));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO service_role;

-- ── Storage: bucket privado para PDF/imágenes ─────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('hazlo-docs', 'hazlo-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS hazlo_docs_select ON storage.objects;
CREATE POLICY hazlo_docs_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'hazlo-docs'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.user_can_access_bu('hazloasiya'::public.bu_enum)
    )
  );

DROP POLICY IF EXISTS hazlo_docs_insert ON storage.objects;
CREATE POLICY hazlo_docs_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hazlo-docs'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS hazlo_docs_update ON storage.objects;
CREATE POLICY hazlo_docs_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hazlo-docs'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.user_can_access_bu('hazloasiya'::public.bu_enum)
    )
  );

DROP POLICY IF EXISTS hazlo_docs_delete ON storage.objects;
CREATE POLICY hazlo_docs_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'hazlo-docs'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.user_can_access_bu('hazloasiya'::public.bu_enum)
    )
  );

-- ── Action Center sync: extender función (copia lógica de 08) ──

CREATE OR REPLACE FUNCTION public.sync_action_items_from_crm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bu public.bu_enum;
  v_record public.action_item_record_enum;
  v_next text;
  v_value numeric(12, 2);
  v_priority public.action_item_priority_enum;
  v_title text;
  v_source text;
  v_should boolean;
BEGIN
  v_should := false;
  IF TG_OP = 'INSERT' THEN
    v_should := true;
  ELSIF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'vilo_opportunities' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_should := true;
    ELSIF TG_TABLE_NAME = 'patient_leads' AND OLD.current_stage IS DISTINCT FROM NEW.current_stage THEN
      v_should := true;
    ELSIF TG_TABLE_NAME = 'submissions' AND (
      OLD.completion_status IS DISTINCT FROM NEW.completion_status
      OR COALESCE(OLD.payment_status, '') IS DISTINCT FROM COALESCE(NEW.payment_status, '')
    ) THEN
      v_should := true;
    END IF;
  END IF;

  IF NOT v_should THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'vilo_opportunities' THEN
    v_bu := 'vilo_research';
    v_record := 'opportunity';
    v_value := NEW.potential_value;
    v_title := 'Oportunidad: ' || NEW.company_name;
    v_source := 'trigger:sync:vilo_opportunity';
    v_next := CASE NEW.status::text
      WHEN 'Lead Identified' THEN 'Enviar intro + agendar llamada de descubrimiento'
      WHEN 'Outreach Sent' THEN 'Follow-up si no hay respuesta (3 días)'
      WHEN 'Response Received' THEN 'Coordinar introducción / intro call'
      WHEN 'Intro Call Pending' THEN 'Cerrar agenda de intro call'
      WHEN 'Feasibility Sent' THEN 'Revisar viabilidad y ajustar alcance'
      WHEN 'Negotiation' THEN 'Revisar contrato — coordinar legal y firma'
      WHEN 'Activated' THEN 'Kickoff operativo con sitio / sponsor'
      WHEN 'Closed Lost' THEN 'Archivar oportunidad y registrar causa'
      WHEN 'Nurture' THEN 'Reactivar en nurturing / campaña'
      ELSE 'Actualizar siguiente paso comercial'
    END;
    v_priority := CASE
      WHEN NEW.status IN (
        'Negotiation'::public.vilo_stage,
        'Closed Lost'::public.vilo_stage
      ) THEN 'high'::public.action_item_priority_enum
      ELSE 'medium'::public.action_item_priority_enum
    END;

  ELSIF TG_TABLE_NAME = 'patient_leads' THEN
    v_bu := 'vitalis';
    v_record := 'patient';
    v_value := NULL;
    v_title := 'Paciente: ' || NEW.full_name;
    v_source := 'trigger:sync:patient_lead';
    v_next := CASE NEW.current_stage::text
      WHEN 'New Lead' THEN 'Contactar en <2h (WhatsApp o llamada)'
      WHEN 'Contact Attempted' THEN 'Reintentar contacto con mejor canal'
      WHEN 'Responded' THEN 'Iniciar prescreening / cuestionario'
      WHEN 'Prescreen Started' THEN 'Completar elegibilidad y documentar'
      WHEN 'Prequalified' THEN 'Agendar visita y confirmar documentos'
      WHEN 'Scheduled' THEN 'Confirmar 24h antes + enviar recordatorio'
      WHEN 'Visit Confirmed' THEN 'Visita confirmada: recordatorios 24h / 2h automáticos'
      WHEN 'No-show' THEN 'Reintentar contacto (máximo 2 intentos)'
      WHEN 'Enrolled' THEN 'Seguimiento de visitas del protocolo'
      WHEN 'Screen Fail' THEN 'Archivar lead + comunicar resultado al canal origen'
      WHEN 'Patient Lost' THEN 'Lead perdido tras no-show: revisar si reactivar en 7 días'
      WHEN 'Nurture / Future Study' THEN 'Mantener en nurturing para futuros estudios'
      ELSE 'Actualizar seguimiento Vitalis'
    END;
    v_priority := CASE
      WHEN NEW.current_stage IN (
        'No-show'::public.vitalis_stage,
        'Screen Fail'::public.vitalis_stage,
        'Patient Lost'::public.vitalis_stage
      ) THEN 'high'::public.action_item_priority_enum
      ELSE 'medium'::public.action_item_priority_enum
    END;

  ELSIF TG_TABLE_NAME = 'submissions' THEN
    v_bu := 'hazloasiya';
    v_record := 'submission';
    v_value := NULL;
    v_title := 'Trámite: ' || COALESCE(NEW.name, 'Usuario') || ' — ' || COALESCE(NEW.funnel_type, '');
    v_source := 'trigger:sync:hazlo_submission';
    v_next := CASE
      WHEN NEW.completion_status = 'Missing documents' THEN 'Solicitar correcciones documentales (ver validation_report)'
      WHEN NEW.completion_status = 'Ready for review' THEN 'Revisión humana del expediente validado'
      WHEN NEW.completion_status = 'Funnel completed' THEN 'Validación documental en cola o en curso'
      WHEN NEW.completion_status = 'Paid' THEN 'Entregar PDF + upsell'
      WHEN NEW.completion_status = 'Payment attempted' AND NEW.payment_status = 'failed' THEN 'Resolver fallo de pago'
      ELSE 'Revisar avance de trámite HazloAsíYa'
    END;
    v_priority := CASE
      WHEN NEW.completion_status = 'Missing documents' THEN 'high'::public.action_item_priority_enum
      WHEN NEW.completion_status = 'Payment attempted' AND NEW.payment_status = 'failed' THEN 'high'::public.action_item_priority_enum
      ELSE 'medium'::public.action_item_priority_enum
    END;

  ELSE
    RETURN NEW;
  END IF;

  DELETE FROM public.action_items ai
  WHERE ai.record_id = NEW.id
    AND ai.record_type = v_record
    AND ai.source IS NOT NULL
    AND ai.source LIKE v_source || '%';

  INSERT INTO public.action_items (
    business_unit,
    record_type,
    record_id,
    title,
    status,
    next_action,
    due_date,
    owner_id,
    priority,
    value_usd,
    notes,
    source
  ) VALUES (
    v_bu,
    v_record,
    NEW.id,
    v_title,
    'pending'::public.action_item_status_enum,
    v_next,
    timezone('utc', now()) + interval '24 hours',
    NULL,
    v_priority,
    v_value,
    'Auto-generado | tabla: ' || TG_TABLE_NAME || ' | op: ' || TG_OP,
    v_source || ':' || TG_OP
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_action_center ON public.submissions;
CREATE TRIGGER trg_submissions_action_center
  AFTER INSERT OR UPDATE OF completion_status, payment_status ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_action_items_from_crm();
