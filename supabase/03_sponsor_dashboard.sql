-- ============================================================
--  VILO CRM — Sponsor Dashboard (views + automation triggers)
--  Run in Supabase SQL Editor after 01_schema + 02_rls
-- ============================================================

CREATE OR REPLACE VIEW public.v_enrollment_engine_7d AS
WITH base AS (
  SELECT
    COUNT(*) AS total_leads,
    COUNT(*) FILTER (
      WHERE current_stage IN (
        'Prescreen Started',
        'Prequalified',
        'Scheduled',
        'No-show',
        'Enrolled',
        'Screen Fail'
      )
    ) AS prescreen_started,
    COUNT(*) FILTER (
      WHERE current_stage IN (
        'Prequalified',
        'Scheduled',
        'No-show',
        'Enrolled',
        'Screen Fail'
      )
    ) AS prequalified,
    COUNT(*) FILTER (WHERE current_stage = 'Enrolled') AS enrolled,
    COUNT(*) FILTER (WHERE current_stage = 'Scheduled') AS scheduled,
    COUNT(*) FILTER (WHERE current_stage = 'No-show') AS no_show,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (last_contact_date::timestamptz - created_at)) / 3600.0)::numeric,
      1
    ) FILTER (WHERE last_contact_date IS NOT NULL) AS avg_hours_to_contact
  FROM public.patient_leads
  WHERE NOT archived AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  total_leads,
  avg_hours_to_contact,
  CASE WHEN total_leads > 0 THEN ROUND((prescreen_started::numeric / total_leads) * 100, 1) ELSE 0 END AS prescreen_rate_pct,
  CASE WHEN prescreen_started > 0 THEN ROUND((prequalified::numeric / prescreen_started) * 100, 1) ELSE 0 END AS eligible_rate_pct,
  CASE WHEN total_leads > 0 THEN ROUND((enrolled::numeric / total_leads) * 100, 1) ELSE 0 END AS enrollment_rate_pct,
  CASE
    WHEN (scheduled + no_show) > 0 THEN ROUND((scheduled::numeric / (scheduled + no_show)) * 100, 1)
    ELSE 0
  END AS show_rate_pct,
  prescreen_started,
  prequalified,
  enrolled,
  scheduled,
  no_show
FROM base;

CREATE OR REPLACE VIEW public.v_execution_metrics AS
SELECT
  COUNT(*) FILTER (
    WHERE current_stage = 'Scheduled' AND NOT archived
      AND DATE_TRUNC('week', updated_at) = DATE_TRUNC('week', NOW())
  ) AS scheduled_this_week,
  COUNT(*) FILTER (
    WHERE current_stage = 'Enrolled' AND NOT archived
      AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', NOW())
  ) AS enrolled_this_month,
  CASE
    WHEN COUNT(*) FILTER (WHERE current_stage IN ('Scheduled', 'No-show') AND NOT archived) > 0 THEN
      ROUND(
        COUNT(*) FILTER (WHERE current_stage = 'No-show' AND NOT archived)::numeric
        / COUNT(*) FILTER (WHERE current_stage IN ('Scheduled', 'No-show') AND NOT archived) * 100,
        1
      )
    ELSE 0
  END AS no_show_rate_pct,
  COUNT(*) FILTER (
    WHERE NOT archived
      AND current_stage NOT IN ('Enrolled', 'Screen Fail', 'Nurture / Future Study')
      AND (last_contact_date IS NULL OR last_contact_date < (CURRENT_DATE - INTERVAL '2 days'))
  ) AS overdue_followups_count
FROM public.patient_leads;

CREATE OR REPLACE VIEW public.v_pipeline_by_stage AS
SELECT
  current_stage AS stage,
  COUNT(*) AS count,
  ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 1) AS pct_of_total
FROM public.patient_leads
WHERE NOT archived
GROUP BY current_stage
ORDER BY CASE current_stage
  WHEN 'New Lead' THEN 1
  WHEN 'Contact Attempted' THEN 2
  WHEN 'Responded' THEN 3
  WHEN 'Prescreen Started' THEN 4
  WHEN 'Prequalified' THEN 5
  WHEN 'Scheduled' THEN 6
  WHEN 'No-show' THEN 7
  WHEN 'Enrolled' THEN 8
  WHEN 'Screen Fail' THEN 9
  WHEN 'Nurture / Future Study' THEN 10
  ELSE 99
END;

CREATE OR REPLACE VIEW public.v_screen_fail_insights AS
SELECT
  COALESCE(NULLIF(TRIM(screen_fail_reason), ''), 'Not specified') AS reason,
  COUNT(*) AS count,
  ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 1) AS pct
FROM public.patient_leads
WHERE NOT archived AND current_stage = 'Screen Fail'
GROUP BY screen_fail_reason
ORDER BY count DESC
LIMIT 5;

CREATE OR REPLACE VIEW public.v_tasks_alert_panel AS
SELECT
  t.id,
  t.title,
  t.channel,
  t.priority,
  t.due_date,
  t.linked_vilo_id,
  t.linked_vitalis_id,
  (CURRENT_DATE - t.due_date) AS days_overdue,
  vo.company_name AS vilo_company,
  pl.full_name AS vitalis_name,
  pl.phone AS vitalis_phone
FROM public.tasks t
LEFT JOIN public.vilo_opportunities vo ON t.linked_vilo_id = vo.id
LEFT JOIN public.patient_leads pl ON t.linked_vitalis_id = pl.id
WHERE NOT t.done
ORDER BY CASE t.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, t.due_date ASC;

CREATE OR REPLACE VIEW public.v_weekly_sponsor_report AS
WITH weekly AS (
  SELECT
    COUNT(*) AS leads_this_week,
    COUNT(*) FILTER (WHERE current_stage = 'Enrolled') AS enrolled_this_week,
    COUNT(*) FILTER (
      WHERE current_stage IN (
        'Prescreen Started',
        'Prequalified',
        'Scheduled',
        'Enrolled',
        'Screen Fail',
        'No-show'
      )
    ) AS prescreened_this_week,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (last_contact_date::timestamptz - created_at)) / 3600.0)
      FILTER (WHERE last_contact_date IS NOT NULL)::numeric,
      1
    ) AS avg_hours_to_contact
  FROM public.patient_leads
  WHERE NOT archived AND created_at >= DATE_TRUNC('week', NOW())
),
top_indication AS (
  SELECT condition_or_study_interest AS indication, COUNT(*) AS n
  FROM public.patient_leads
  WHERE
    NOT archived
    AND created_at >= DATE_TRUNC('week', NOW())
    AND condition_or_study_interest IS NOT NULL
  GROUP BY condition_or_study_interest
  ORDER BY n DESC
  LIMIT 1
)
SELECT
  DATE_TRUNC('week', NOW())::date AS week_of,
  w.leads_this_week,
  w.enrolled_this_week,
  CASE
    WHEN w.leads_this_week > 0 THEN ROUND(w.enrolled_this_week::numeric / w.leads_this_week * 100, 1)
    ELSE 0
  END AS enrollment_rate_pct,
  CASE
    WHEN w.prescreened_this_week > 0 THEN ROUND(w.enrolled_this_week::numeric / w.prescreened_this_week * 100, 1)
    ELSE 0
  END AS conversion_rate_pct,
  w.avg_hours_to_contact,
  ti.indication AS top_indication,
  ti.n AS top_indication_leads
FROM weekly w
LEFT JOIN top_indication ti ON true;

CREATE OR REPLACE VIEW public.v_leads_by_source_30d AS
SELECT
  COALESCE(source_campaign, 'unknown') AS source,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE current_stage = 'Enrolled') AS enrolled,
  ROUND(
    COUNT(*) FILTER (WHERE current_stage = 'Enrolled')::numeric / NULLIF(COUNT(*), 0) * 100,
    1
  ) AS enrollment_rate_pct
FROM public.patient_leads
WHERE NOT archived AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY source_campaign
ORDER BY total DESC;

-- ── Automation: new Vitalis lead → task ─────────────────────

CREATE OR REPLACE FUNCTION public.fn_auto_task_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.tasks (title, channel, priority, due_date, done, linked_vitalis_id, linked_vilo_id)
  VALUES (
    'Contact new lead — ' || NEW.full_name,
    'vitalis',
    'High',
    CURRENT_DATE,
    false,
    NEW.id,
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_lead_task ON public.patient_leads;
CREATE TRIGGER trg_new_lead_task
  AFTER INSERT ON public.patient_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_task_new_lead();

-- ── Automation: Vilo feasibility sent → follow-up task ───────

CREATE OR REPLACE FUNCTION public.fn_auto_task_feasibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'Feasibility Sent' AND OLD.status IS DISTINCT FROM 'Feasibility Sent' THEN
    INSERT INTO public.tasks (title, channel, priority, due_date, done, linked_vilo_id, linked_vitalis_id)
    VALUES (
      'Follow up feasibility — ' || NEW.company_name,
      'vilo',
      'High',
      (CURRENT_DATE + INTERVAL '3 days')::date,
      false,
      NEW.id,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feasibility_task ON public.vilo_opportunities;
CREATE TRIGGER trg_feasibility_task
  AFTER UPDATE ON public.vilo_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_task_feasibility();

-- ── Grants (authenticated CRM reads; service_role bypasses RLS) ─

GRANT SELECT ON public.v_enrollment_engine_7d TO authenticated;
GRANT SELECT ON public.v_execution_metrics TO authenticated;
GRANT SELECT ON public.v_pipeline_by_stage TO authenticated;
GRANT SELECT ON public.v_screen_fail_insights TO authenticated;
GRANT SELECT ON public.v_tasks_alert_panel TO authenticated;
GRANT SELECT ON public.v_weekly_sponsor_report TO authenticated;
GRANT SELECT ON public.v_leads_by_source_30d TO authenticated;
