-- ============================================================
--  VILO CRM — Sincronización Action Center desde tablas CRM
--  Run AFTER 07_v_action_center_scale.sql
--
--  • NO relaja RLS con “allow_all_authenticated”: eso rompería la
--    segregación por BU (Hazlo vs clínico). Los INSERT/DELETE aquí usan
--    SECURITY DEFINER y el rol propietario de la función (p. ej. postgres
--    en Supabase) opera fuera de RLS.
--  • Tablas reales: vilo_opportunities, patient_leads (no opportunities/patients).
--  • Reemplaza el trigger puntual de Negociación de 07 por un flujo único
--    que mantiene UNA fila auto por (record_type, record_id) con source
--    trigger:sync:* (al cambiar etapa se borra la anterior y se inserta la nueva).
--  • Hazlo submissions: cuando exista tabla pública (p. ej. hazlo_submissions),
--    añadí trigger + rama en la función (ver comentario al final).
-- ============================================================

ALTER TABLE public.action_items
  ALTER COLUMN owner_id SET DEFAULT NULL;

-- Quitar trigger de solo-Negociación de 07 (evita duplicar con este flujo)
DROP TRIGGER IF EXISTS trg_vilo_negotiation_action_item ON public.vilo_opportunities;
DROP FUNCTION IF EXISTS public.trg_vilo_negotiation_action_item();

-- ── Función central (TG_TABLE_NAME = tabla origen) ───────────

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

COMMENT ON FUNCTION public.sync_action_items_from_crm IS
  'Mantiene un action_item auto por oportunidad o lead al insertar o al cambiar etapa. No usar política RLS permisiva; esta función es SECURITY DEFINER.';

DROP TRIGGER IF EXISTS trg_vilo_opportunities_action_center ON public.vilo_opportunities;
CREATE TRIGGER trg_vilo_opportunities_action_center
  AFTER INSERT OR UPDATE OF status ON public.vilo_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_action_items_from_crm();

DROP TRIGGER IF EXISTS trg_patient_leads_action_center ON public.patient_leads;
CREATE TRIGGER trg_patient_leads_action_center
  AFTER INSERT OR UPDATE OF current_stage ON public.patient_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_action_items_from_crm();

-- ── HazloAsíYa (cuando exista tabla) ──────────────────────────
-- Ejemplo: crear tabla hazlo_submissions con id uuid PK y columnas alineadas
-- a tu modelo; luego:
--
-- DROP TRIGGER IF EXISTS trg_hazlo_submissions_action_center ON public.hazlo_submissions;
-- CREATE TRIGGER trg_hazlo_submissions_action_center
--   AFTER INSERT OR UPDATE OF completion_status, payment_status ON public.hazlo_submissions
--   FOR EACH ROW
--   EXECUTE FUNCTION public.sync_action_items_from_crm();
--
-- Y en sync_action_items_from_crm añadir ELSIF TG_TABLE_NAME = 'hazlo_submissions'
-- con v_bu := 'hazloasiya', v_record := 'submission', y lógica IF para pago fallido
-- (no uses WHEN ... AND ... dentro de un CASE simple; usar IF anidados).
