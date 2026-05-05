-- ============================================================
--  VILO CRM — Backfill único de action_items (idempotente)
--  Run ONCE after 06 (action_items existe). Seguro re-ejecutar:
--  no inserta si ya hay fila para el mismo record_id + record_type.
--
--  Tablas reales: vilo_opportunities, patient_leads (no opportunities/patients).
--  Enums: public.bu_enum, public.action_item_record_enum, etc.
--  Hazlo: solo corre el bloque DO si existe public.submissions con las
--  columnas esperadas (ajustá nombres si tu esquema difiere).
-- ============================================================

-- ── 1. Oportunidades (Vilo Research) ────────────────────────

INSERT INTO public.action_items (
  business_unit,
  record_type,
  record_id,
  title,
  next_action,
  due_date,
  priority,
  value_usd,
  notes,
  status,
  source
)
SELECT
  'vilo_research'::public.bu_enum,
  'opportunity'::public.action_item_record_enum,
  o.id,
  o.company_name || ' — ' || COALESCE(o.opportunity_type::text, 'Partnership'),
  CASE o.status::text
    WHEN 'Lead Identified' THEN 'Primer contacto / agendar call'
    WHEN 'Outreach Sent' THEN 'Follow-up si no hay respuesta'
    WHEN 'Response Received' THEN 'Coordinar intro call'
    WHEN 'Intro Call Pending' THEN 'Cerrar agenda de intro call'
    WHEN 'Feasibility Sent' THEN 'Seguimiento viabilidad'
    WHEN 'Negotiation' THEN 'Revisar contrato y cerrar firma'
    WHEN 'Activated' THEN 'Kickoff operativo'
    WHEN 'Nurture' THEN 'Reactivar en nurturing'
    ELSE 'Actualizar siguiente paso comercial'
  END,
  timezone('utc', now()) + interval '24 hours',
  CASE
    WHEN o.status IN (
      'Negotiation'::public.vilo_stage,
      'Activated'::public.vilo_stage
    ) THEN 'high'::public.action_item_priority_enum
    ELSE 'medium'::public.action_item_priority_enum
  END,
  o.potential_value,
  'Migración automática',
  'pending'::public.action_item_status_enum,
  'migration:backfill:vilo'
FROM public.vilo_opportunities o
LEFT JOIN public.action_items a
  ON a.record_id = o.id
 AND a.record_type = 'opportunity'::public.action_item_record_enum
WHERE a.id IS NULL
  AND NOT o.archived
  AND o.status IS DISTINCT FROM 'Closed Lost'::public.vilo_stage;

-- ── 2. Pacientes / leads (Vitalis) ───────────────────────────

INSERT INTO public.action_items (
  business_unit,
  record_type,
  record_id,
  title,
  next_action,
  due_date,
  priority,
  value_usd,
  notes,
  status,
  source
)
SELECT
  'vitalis'::public.bu_enum,
  'patient'::public.action_item_record_enum,
  p.id,
  p.full_name || ' (' || COALESCE(p.condition_or_study_interest, '—') || ')',
  CASE p.current_stage::text
    WHEN 'New Lead' THEN 'Contactar en <2h'
    WHEN 'Contact Attempted' THEN 'Reintentar contacto'
    WHEN 'Responded' THEN 'Iniciar prescreening'
    WHEN 'Prescreen Started' THEN 'Completar prescreening'
    WHEN 'Prequalified' THEN 'Agendar visita y confirmar docs'
    WHEN 'Scheduled' THEN 'Confirmar visita'
    WHEN 'No-show' THEN 'Reintentar contacto (máx 2)'
    WHEN 'Enrolled' THEN 'Seguimiento de visitas'
    WHEN 'Screen Fail' THEN 'Archivar y notificar canal origen'
    WHEN 'Nurture / Future Study' THEN 'Mantener en nurturing'
    ELSE 'Actualizar estado'
  END,
  timezone('utc', now()) + interval '12 hours',
  CASE
    WHEN p.current_stage IN (
      'New Lead'::public.vitalis_stage,
      'Scheduled'::public.vitalis_stage,
      'No-show'::public.vitalis_stage
    ) THEN 'high'::public.action_item_priority_enum
    ELSE 'medium'::public.action_item_priority_enum
  END,
  NULL::numeric(12, 2),
  'Migración automática',
  'pending'::public.action_item_status_enum,
  'migration:backfill:vitalis'
FROM public.patient_leads p
LEFT JOIN public.action_items a
  ON a.record_id = p.id
 AND a.record_type = 'patient'::public.action_item_record_enum
WHERE a.id IS NULL
  AND NOT p.archived;

-- ── 3. HazloAsíYa (solo si existe public.submissions) ─────────
--     Ajustá nombres de columnas al crear la tabla real.

DO $hazlo$
BEGIN
  IF to_regclass('public.submissions') IS NULL THEN
    RAISE NOTICE 'Backfill Hazlo omitido: no existe public.submissions.';
  ELSE
  INSERT INTO public.action_items (
    business_unit,
    record_type,
    record_id,
    title,
    next_action,
    due_date,
    priority,
    value_usd,
    notes,
    status,
    source
  )
  SELECT
    'hazloasiya'::public.bu_enum,
    'submission'::public.action_item_record_enum,
    s.id,
    COALESCE(s.name, 'Usuario') || ' — ' || COALESCE(s.funnel_type::text, 'trámite'),
    CASE
      WHEN s.completion_status::text = 'Missing documents' THEN 'Solicitar documentos faltantes'
      WHEN s.completion_status::text = 'Payment attempted' AND s.payment_status::text = 'failed' THEN 'Resolver fallo de pago'
      WHEN s.completion_status::text = 'Paid' THEN 'Entregar PDF + upsell'
      ELSE 'Revisar avance de trámite'
    END,
    timezone('utc', now()) + interval '24 hours',
    CASE
      WHEN s.completion_status::text = 'Payment attempted' AND s.payment_status::text = 'failed' THEN 'high'::public.action_item_priority_enum
      ELSE 'medium'::public.action_item_priority_enum
    END,
    NULL::numeric(12, 2),
    'Migración automática',
    'pending'::public.action_item_status_enum,
    'migration:backfill:hazlo'
  FROM public.submissions s
  LEFT JOIN public.action_items a
    ON a.record_id = s.id
   AND a.record_type = 'submission'::public.action_item_record_enum
  WHERE a.id IS NULL;

  RAISE NOTICE 'Backfill Hazlo: completado (revisá NOTICE si 0 filas esperadas).';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Backfill Hazlo: error (¿columnas id, name, funnel_type, completion_status, payment_status?). %', SQLERRM;
END
$hazlo$;

-- ── Verificación ─────────────────────────────────────────────

SELECT count(*)::bigint AS registros_migracion
FROM public.action_items
WHERE notes = 'Migración automática';
