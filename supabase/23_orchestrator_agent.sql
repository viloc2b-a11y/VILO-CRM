-- ============================================================
--  Orchestrator Agent — tareas Action Center adicionales
--  (source orchestrator:*; no reemplaza trigger:sync:*)
--  Run after 22_hazlo_growth_agent.sql
-- ============================================================

ALTER TABLE public.vilo_opportunities
  ADD COLUMN IF NOT EXISTS expected_close_date date;

COMMENT ON COLUMN public.vilo_opportunities.expected_close_date IS
  'Fecha objetivo de cierre; Orchestrator acelera si cae en los próximos 7 días.';

CREATE TABLE IF NOT EXISTS public.orchestrator_settings (
  key text PRIMARY KEY,
  value_numeric numeric,
  value_text text,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

INSERT INTO public.orchestrator_settings (key, value_numeric)
VALUES ('cpl_alert_threshold', 75)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.orchestrator_settings IS
  'Umbrales Orchestrator; cpl_alert_threshold = coste por lead máximo antes de alerta.';

ALTER TABLE public.orchestrator_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orchestrator_settings_select ON public.orchestrator_settings;
CREATE POLICY orchestrator_settings_select
  ON public.orchestrator_settings FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.orchestrator_settings TO authenticated;

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cost_per_lead numeric(12, 4),
  platform text,
  external_id text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_cpl
  ON public.marketing_campaigns (cost_per_lead)
  WHERE NOT archived AND cost_per_lead IS NOT NULL;

COMMENT ON TABLE public.marketing_campaigns IS
  'Campañas paid — Orchestrator alerta si cost_per_lead supera umbral.';

DROP TRIGGER IF EXISTS trg_marketing_campaigns_updated_at ON public.marketing_campaigns;
CREATE TRIGGER trg_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_campaigns_all ON public.marketing_campaigns;
CREATE POLICY marketing_campaigns_all
  ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.user_can_access_bu('vilo_research'::public.bu_enum))
  WITH CHECK (public.user_can_access_bu('vilo_research'::public.bu_enum));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;

-- Próximo martes 10:00 en zona; evita sábado/domingo (desplaza a lunes 10:00).
CREATE OR REPLACE FUNCTION public.orchestrator_suggested_due_at(p_tz text DEFAULT 'America/Mexico_City')
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  t_local timestamp without time zone;
  target_date date;
  isodow int;
  add_days int;
BEGIN
  t_local := (timezone('utc', now()) AT TIME ZONE p_tz);
  target_date := t_local::date;
  isodow := EXTRACT(ISODOW FROM target_date::timestamp without time zone)::int;

  IF isodow = 2 AND EXTRACT(HOUR FROM t_local) < 10 THEN
    RETURN (target_date::timestamp without time zone + interval '10 hours') AT TIME ZONE p_tz;
  END IF;

  add_days := (9 - isodow) % 7;
  IF add_days = 0 THEN
    add_days := 7;
  END IF;

  target_date := (target_date + make_interval(days => add_days))::date;

  WHILE EXTRACT(ISODOW FROM target_date::timestamp without time zone)::int IN (6, 7) LOOP
    target_date := target_date + 1;
  END LOOP;

  RETURN (target_date::timestamp without time zone + interval '10 hours') AT TIME ZONE p_tz;
END;
$$;

COMMENT ON FUNCTION public.orchestrator_suggested_due_at IS
  'Smart scheduling MVP: siguiente martes 10:00 local; fines de semana → lunes. Festivos: ampliar en app.';

CREATE OR REPLACE FUNCTION public.orchestrator_action_open_exists(p_record_id uuid, p_source text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.action_items ai
    WHERE ai.record_id = p_record_id
      AND ai.source = p_source
      AND ai.status IN ('pending'::public.action_item_status_enum, 'in_progress'::public.action_item_status_enum)
  );
$$;

CREATE OR REPLACE FUNCTION public.orchestrator_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due timestamptz;
  v_thresh numeric;
  v_close date;
  v_meta boolean;
BEGIN
  v_due := public.orchestrator_suggested_due_at('America/Mexico_City');
  SELECT s.value_numeric INTO v_thresh
  FROM public.orchestrator_settings s
  WHERE s.key = 'cpl_alert_threshold';
  v_thresh := coalesce(v_thresh, 75);

  IF TG_TABLE_NAME = 'vilo_opportunities' THEN
    IF TG_OP = 'INSERT' AND NOT NEW.archived THEN
      IF NOT public.orchestrator_action_open_exists(NEW.id, 'orchestrator:vilo:first_contact') THEN
        INSERT INTO public.action_items (
          business_unit, record_type, record_id, title, status, next_action, due_date,
          priority, notes, source
        ) VALUES (
          'vilo_research',
          'opportunity',
          NEW.id,
          'Primer contacto — ' || NEW.company_name,
          'pending',
          'Establecer primer contacto y calificar necesidad',
          v_due,
          'medium'::public.action_item_priority_enum,
          'Orchestrator | due sugerido martes 10:00 (smart scheduling)',
          'orchestrator:vilo:first_contact'
        );
      END IF;
    END IF;

    IF NEW.status = 'Negotiation'::public.vilo_stage
      AND NOT NEW.archived
      AND (
        TG_OP = 'INSERT'
        OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
      )
    THEN
      IF NOT public.orchestrator_action_open_exists(NEW.id, 'orchestrator:vilo:contract_review') THEN
        INSERT INTO public.action_items (
          business_unit, record_type, record_id, title, status, next_action, due_date,
          priority, notes, source
        ) VALUES (
          'vilo_research',
          'opportunity',
          NEW.id,
          'Revisar contrato — ' || NEW.company_name,
          'pending',
          'Revisión legal / comercial (etapa Negociación / Contracting)',
          timezone('utc', now()) + interval '24 hours',
          'high'::public.action_item_priority_enum,
          'Orchestrator: stage = Negotiation (Contracting en brief)',
          'orchestrator:vilo:contract_review'
        );
      END IF;
    END IF;

    v_close := coalesce(NEW.expected_close_date, NEW.next_followup_date);
    IF v_close IS NOT NULL
      AND v_close <= ((timezone('utc', now()))::date + 7)
      AND v_close >= (timezone('utc', now()))::date
      AND NEW.status NOT IN ('Activated'::public.vilo_stage, 'Closed Lost'::public.vilo_stage, 'Nurture'::public.vilo_stage)
      AND NOT NEW.archived
    THEN
      IF NOT public.orchestrator_action_open_exists(NEW.id, 'orchestrator:vilo:accelerate_close') THEN
        INSERT INTO public.action_items (
          business_unit, record_type, record_id, title, status, next_action, due_date,
          priority, notes, source
        ) VALUES (
          'vilo_research',
          'opportunity',
          NEW.id,
          'Acelerar cierre — ' || NEW.company_name,
          'pending',
          'Cierre previsto en ≤7 días: priorizar seguimiento y bloqueos',
          timezone('utc', now()) + interval '4 hours',
          'critical'::public.action_item_priority_enum,
          'Orchestrator: expected_close / next_followup en ventana 7d',
          'orchestrator:vilo:accelerate_close'
        );
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'patient_leads' THEN
    IF TG_OP = 'INSERT' AND NOT NEW.archived THEN
      v_meta :=
        coalesce(lower(NEW.intake_attribution::text), '') LIKE '%meta%'
        OR coalesce(lower(NEW.source_campaign), '') LIKE '%meta%'
        OR coalesce(NEW.intake_attribution->>'source_channel', '') ILIKE '%meta%'
        OR coalesce(NEW.intake_attribution->>'utm_source', '') ILIKE '%facebook%';
      IF v_meta THEN
        IF NOT public.orchestrator_action_open_exists(NEW.id, 'orchestrator:vitalis:meta_2h') THEN
          INSERT INTO public.action_items (
            business_unit, record_type, record_id, title, status, next_action, due_date,
            priority, notes, source
          ) VALUES (
            'vitalis',
            'patient',
            NEW.id,
            'Contactar en <2h — ' || NEW.full_name,
            'pending',
            'Lead Meta: contacto rápido (WhatsApp / llamada)',
            timezone('utc', now()) + interval '2 hours',
            'high'::public.action_item_priority_enum,
            'Orchestrator: INSERT con fuente Meta',
            'orchestrator:vitalis:meta_2h'
          );
        END IF;
      END IF;
    END IF;

    IF NEW.current_stage = 'Prequalified'::public.vitalis_stage
      AND NOT NEW.archived
      AND (
        TG_OP = 'INSERT'
        OR (TG_OP = 'UPDATE' AND OLD.current_stage IS DISTINCT FROM NEW.current_stage)
      )
    THEN
      IF NOT public.orchestrator_action_open_exists(NEW.id, 'orchestrator:vitalis:schedule_visit') THEN
        INSERT INTO public.action_items (
          business_unit, record_type, record_id, title, status, next_action, due_date,
          priority, notes, source
        ) VALUES (
          'vitalis',
          'patient',
          NEW.id,
          'Agendar visita — ' || NEW.full_name,
          'pending',
          'Paciente pre-calificado: coordinar cita / sitio',
          v_due,
          'medium'::public.action_item_priority_enum,
          'Orchestrator: etapa Prequalified (Prescreen qualified)',
          'orchestrator:vitalis:schedule_visit'
        );
      END IF;
    END IF;

    IF NEW.current_stage = 'No-show'::public.vitalis_stage
      AND NOT NEW.archived
      AND (
        TG_OP = 'INSERT'
        OR (TG_OP = 'UPDATE' AND OLD.current_stage IS DISTINCT FROM NEW.current_stage)
      )
    THEN
      IF NOT public.orchestrator_action_open_exists(NEW.id, 'orchestrator:vitalis:no_show_retry') THEN
        INSERT INTO public.action_items (
          business_unit, record_type, record_id, title, status, next_action, due_date,
          priority, notes, source
        ) VALUES (
          'vitalis',
          'patient',
          NEW.id,
          'Reintentar contacto — ' || NEW.full_name,
          'pending',
          'No-show: segundo intento de contacto',
          v_due,
          'medium'::public.action_item_priority_enum,
          'Orchestrator: etapa No-show',
          'orchestrator:vitalis:no_show_retry'
        );
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'submissions' THEN
    IF NEW.payment_status = 'failed'
      AND NOT NEW.archived
      AND (
        TG_OP = 'INSERT'
        OR (TG_OP = 'UPDATE' AND coalesce(OLD.payment_status, '') IS DISTINCT FROM coalesce(NEW.payment_status, ''))
      )
    THEN
      IF NOT public.orchestrator_action_open_exists(NEW.id, 'orchestrator:hazlo:resolve_payment') THEN
        INSERT INTO public.action_items (
          business_unit, record_type, record_id, title, status, next_action, due_date,
          priority, notes, source
        ) VALUES (
          'hazloasiya',
          'submission',
          NEW.id,
          'Resolver pago — ' || NEW.name,
          'pending',
          'Pago fallido: Recovery Agent + revisión manual',
          timezone('utc', now()) + interval '12 hours',
          'high'::public.action_item_priority_enum,
          'Orchestrator: payment_status = failed',
          'orchestrator:hazlo:resolve_payment'
        );
      END IF;
    END IF;

    IF NEW.completion_status = 'Missing documents'
      AND NOT NEW.archived
      AND (
        TG_OP = 'INSERT'
        OR (TG_OP = 'UPDATE' AND OLD.completion_status IS DISTINCT FROM NEW.completion_status)
      )
    THEN
      IF NOT public.orchestrator_action_open_exists(NEW.id, 'orchestrator:hazlo:docs_followup') THEN
        INSERT INTO public.action_items (
          business_unit, record_type, record_id, title, status, next_action, due_date,
          priority, notes, source
        ) VALUES (
          'hazloasiya',
          'submission',
          NEW.id,
          'Seguimiento docs — ' || NEW.name,
          'pending',
          'Documentación incompleta: checklist al cliente',
          v_due,
          'medium'::public.action_item_priority_enum,
          'Orchestrator: Missing documents',
          'orchestrator:hazlo:docs_followup'
        );
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'marketing_campaigns' THEN
    IF NEW.cost_per_lead IS NOT NULL
      AND NEW.cost_per_lead > v_thresh
      AND NOT NEW.archived
      AND (
        TG_OP = 'INSERT'
        OR (TG_OP = 'UPDATE' AND coalesce(OLD.cost_per_lead, 0) IS DISTINCT FROM coalesce(NEW.cost_per_lead, 0))
      )
    THEN
      IF NOT public.orchestrator_action_open_exists(NEW.id, 'orchestrator:campaign:optimize_cpl') THEN
        INSERT INTO public.action_items (
          business_unit, record_type, record_id, title, status, next_action, due_date,
          priority, notes, source
        ) VALUES (
          'vilo_research',
          'campaign',
          NEW.id,
          'Optimizar campaña — ' || NEW.name,
          'pending',
          'CPL por encima del umbral: revisar creativos, audiencia y puja',
          timezone('utc', now()) + interval '24 hours',
          'high'::public.action_item_priority_enum,
          'Orchestrator: cost_per_lead > ' || v_thresh::text,
          'orchestrator:campaign:optimize_cpl'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.orchestrator_on_change IS
  'Dispara tareas orchestrator:* en cambios CRM (además de sync_action_items).';

DROP TRIGGER IF EXISTS trg_orchestrator_vilo ON public.vilo_opportunities;
CREATE TRIGGER trg_orchestrator_vilo
  AFTER INSERT OR UPDATE OF status, next_followup_date, expected_close_date ON public.vilo_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.orchestrator_on_change();

DROP TRIGGER IF EXISTS trg_orchestrator_patients ON public.patient_leads;
CREATE TRIGGER trg_orchestrator_patients
  AFTER INSERT OR UPDATE OF current_stage, intake_attribution, source_campaign ON public.patient_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.orchestrator_on_change();

DROP TRIGGER IF EXISTS trg_orchestrator_submissions ON public.submissions;
CREATE TRIGGER trg_orchestrator_submissions
  AFTER INSERT OR UPDATE OF payment_status, completion_status ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.orchestrator_on_change();

DROP TRIGGER IF EXISTS trg_orchestrator_campaigns ON public.marketing_campaigns;
CREATE TRIGGER trg_orchestrator_campaigns
  AFTER INSERT OR UPDATE OF cost_per_lead ON public.marketing_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.orchestrator_on_change();

-- RPC: workload balancing (consumo desde API con service role)
CREATE OR REPLACE FUNCTION public.orchestrator_owners_over_task_limit(p_limit integer DEFAULT 10)
RETURNS TABLE (owner_id uuid, open_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ai.owner_id, count(*)::bigint AS open_count
  FROM public.action_items ai
  WHERE ai.status IN ('pending'::public.action_item_status_enum, 'in_progress'::public.action_item_status_enum)
    AND ai.owner_id IS NOT NULL
  GROUP BY ai.owner_id
  HAVING count(*) > p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.orchestrator_owners_over_task_limit(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.orchestrator_suggested_due_at(text) TO authenticated;
