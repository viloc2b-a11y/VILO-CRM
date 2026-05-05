-- ============================================================
--  HazloAsíYa — Growth Agent (upsells cruzados, +7 días post PDF)
--  Run after 21_hazlo_payment_recovery.sql
-- ============================================================

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS pdf_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_birth_year integer,
  ADD COLUMN IF NOT EXISTS mailing_state text,
  ADD COLUMN IF NOT EXISTS growth_channel_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS growth_state jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.submissions.pdf_delivered_at IS 'Marca entrega PDF; Growth Agent corre cuando pasan 7 días y completion_status = PDF delivered.';
COMMENT ON COLUMN public.submissions.mailing_state IS 'Estado US (2 letras), ej. CA, TX — scoring programas.';
COMMENT ON COLUMN public.submissions.growth_channel_stats IS 'email_open_rate, whatsapp_response_rate (0–1) para elegir canal.';
COMMENT ON COLUMN public.submissions.growth_state IS 'Growth Agent: campañas enviadas, score, UTM, follow-up.';

CREATE INDEX IF NOT EXISTS idx_submissions_growth_eligible
  ON public.submissions (completion_status, pdf_delivered_at)
  WHERE NOT archived AND completion_status = 'PDF delivered' AND pdf_delivered_at IS NOT NULL;

-- ── Action Center: PDF delivered + Growth ─────────────────────

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
      OR OLD.pdf_delivered_at IS DISTINCT FROM NEW.pdf_delivered_at
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
      WHEN NEW.completion_status = 'Canceled' THEN 'Expediente cancelado (pago no recuperado) — archivo y encuesta'
      WHEN NEW.completion_status = 'Paid' OR NEW.payment_status = 'paid' THEN 'Entregar PDF + upsell (pago confirmado)'
      WHEN NEW.completion_status = 'PDF delivered' THEN 'PDF entregado — Growth Agent (upsell +7 días) y seguimiento'
      WHEN NEW.completion_status = 'Missing documents' THEN 'Solicitar correcciones documentales (ver validation_report)'
      WHEN NEW.completion_status = 'Ready for review' THEN 'Revisión humana del expediente validado'
      WHEN NEW.completion_status = 'Funnel completed' THEN 'Validación documental en cola o en curso'
      WHEN NEW.payment_status = 'failed' THEN 'Recovery Agent: secuencia día 0–7 para recuperar pago'
      WHEN NEW.completion_status = 'Payment attempted' AND NEW.payment_status = 'failed' THEN 'Recovery Agent: secuencia día 0–7 para recuperar pago'
      ELSE 'Revisar avance de trámite HazloAsíYa'
    END;
    v_priority := CASE
      WHEN NEW.completion_status = 'Canceled' THEN 'low'::public.action_item_priority_enum
      WHEN NEW.completion_status = 'Missing documents' THEN 'high'::public.action_item_priority_enum
      WHEN NEW.payment_status = 'failed' AND NEW.completion_status IS DISTINCT FROM 'Canceled' THEN 'high'::public.action_item_priority_enum
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
  AFTER INSERT OR UPDATE OF completion_status, payment_status, pdf_delivered_at ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_action_items_from_crm();
