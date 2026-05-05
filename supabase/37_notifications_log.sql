-- ============================================================
--  VILO CRM — notifications_log (auditoría + anti-spam / análisis)
--  Run after 05_auth_rbac_activity.sql (is_app_admin), 36 opcional.
--
--  Ajustes vs. snippet genérico:
--  • user_profiles.role (texto), no roles[]; RLS admin = is_app_admin().
--  • Privilegios como webhook_events: service_role ALL, authenticated SELECT+RLS.
--  • La limpieza de filas >30d no es una política RLS; usá pg_cron o job externo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'both'
    CONSTRAINT notifications_log_channel_check CHECK (channel IN ('email', 'slack', 'both')),
  recipient text,
  subject text,
  template_key text NOT NULL
    CONSTRAINT notifications_log_template_key_check CHECK (
      template_key IN (
        'critical_task_overdue',
        'report_generated',
        'payment_recovery_failed'
      )
    ),
  status text NOT NULL DEFAULT 'queued'
    CONSTRAINT notifications_log_status_check CHECK (status IN ('queued', 'sent', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_notifications_log_template_task
  ON public.notifications_log (template_key, ((payload->>'task_id')));

CREATE INDEX IF NOT EXISTS idx_notifications_log_created
  ON public.notifications_log (created_at DESC);

COMMENT ON TABLE public.notifications_log IS
  'Historial de notificaciones enviadas o fallidas; lectura solo admins. Escritura vía service_role en API.';

ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notifications_log FROM PUBLIC;
GRANT ALL ON public.notifications_log TO service_role;
GRANT SELECT ON public.notifications_log TO authenticated;

DROP POLICY IF EXISTS admin_read_notifications_log ON public.notifications_log;
CREATE POLICY admin_read_notifications_log
  ON public.notifications_log FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

COMMENT ON POLICY admin_read_notifications_log ON public.notifications_log IS
  'Solo is_app_admin(); inserts/updates vía service_role sin políticas adicionales.';

-- Limpieza: ejemplo con pg_cron (comentado; activar en Supabase si aplica):
-- SELECT cron.schedule('notif_log_retention', '0 4 * * *',
--   $$DELETE FROM public.notifications_log WHERE created_at < timezone('utc', now()) - interval '30 days'$$);
