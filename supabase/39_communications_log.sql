-- ============================================================
--  VILO RESEARCH — communications_log & tracking (timeline B2B)
--  Run in Supabase SQL Editor AFTER:
--    • 01_schema.sql (contacts, organizations, vilo_opportunities)
--    • 06_action_center_studies_ctms.sql (bu_enum, user_can_access_bu)
--
--  Ajustes vs. snippet genérico:
--    • companies → organizations (org_id)
--    • opportunities → vilo_opportunities (opportunity_id)
--    • RLS vía user_can_access_bu('vilo_research') (incluye admin)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.communications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts (id) ON DELETE SET NULL,
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.vilo_opportunities (id) ON DELETE SET NULL,
  channel text NOT NULL
    CHECK (channel IN ('email', 'linkedin', 'call', 'meeting', 'whatsapp', 'other')),
  direction text NOT NULL
    CHECK (direction IN ('outbound', 'inbound', 'internal')),
  type text,
  subject text,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.communications_log IS
  'Registro de comunicaciones B2B (email, LinkedIn, llamadas, etc.) para timeline y último touch.';
COMMENT ON COLUMN public.communications_log.type IS
  'Ej.: intro, follow_up, proposal, reply, note, meeting (texto libre).';
COMMENT ON COLUMN public.communications_log.metadata IS
  'Ej.: thread_id, opens, clicks, replied, url, template_key, notes.';

CREATE INDEX IF NOT EXISTS idx_comm_contact_timeline
  ON public.communications_log (contact_id, created_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_org_timeline
  ON public.communications_log (org_id, created_at DESC)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_opportunity_timeline
  ON public.communications_log (opportunity_id, created_at DESC)
  WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_created_at ON public.communications_log (created_at DESC);

-- ── RLS (mismo patrón que action_items clinical BU) ───────────

ALTER TABLE public.communications_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communications_log_select_vilo ON public.communications_log;
CREATE POLICY communications_log_select_vilo
  ON public.communications_log FOR SELECT
  TO authenticated
  USING (public.user_can_access_bu('vilo_research'::public.bu_enum));

DROP POLICY IF EXISTS communications_log_insert_vilo ON public.communications_log;
CREATE POLICY communications_log_insert_vilo
  ON public.communications_log FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_bu('vilo_research'::public.bu_enum));

-- ── Vista: último evento por contacto (timeline / cadencia) ──

CREATE OR REPLACE VIEW public.v_contact_last_touch
WITH (security_invoker = true) AS
SELECT DISTINCT ON (cl.contact_id)
  cl.contact_id,
  cl.channel,
  cl.direction,
  cl.type,
  cl.subject,
  cl.created_at AS last_touch,
  cl.metadata
FROM public.communications_log cl
WHERE cl.contact_id IS NOT NULL
ORDER BY cl.contact_id, cl.created_at DESC;

COMMENT ON VIEW public.v_contact_last_touch IS
  'Última fila de communications_log por contact_id; respeta RLS del caller.';

GRANT SELECT ON public.v_contact_last_touch TO authenticated;

GRANT SELECT, INSERT ON public.communications_log TO authenticated;
