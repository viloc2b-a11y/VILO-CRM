-- ============================================================
--  VILO CRM — Row Level Security (RLS)
--  Strategy: small internal team, single tenant
--  All authenticated users = full CRUD access
--  No public access to any table
-- ============================================================

-- ── ENABLE RLS ON ALL TABLES ──────────────────────────────────

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vilo_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- ── POLICY: authenticated users = full access ─────────────────
-- For a small internal team (3–10 people), role-based
-- column restrictions add complexity without real value now.
-- All team members get full CRUD. Revisit when team > 15.

CREATE POLICY team_all_organizations
  ON public.organizations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY team_all_contacts
  ON public.contacts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY team_all_vilo
  ON public.vilo_opportunities FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY team_all_leads
  ON public.patient_leads FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY team_all_tasks
  ON public.tasks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── BLOCK ALL ANON / PUBLIC ACCESS ───────────────────────────
-- No anon key should ever touch clinical or B2B data.
-- Enforce at the Supabase dashboard: disable anon key or
-- keep policies as they are (no policy = no access for anon).

-- ── OPTIONAL: FUTURE ROLE SEPARATION ─────────────────────────
-- When you add coordinators vs managers vs admins, use this
-- pattern as a starting point:
--
-- CREATE POLICY coordinators_no_delete_opportunities
--   ON public.vilo_opportunities FOR DELETE
--   TO authenticated
--   USING (
--     (SELECT raw_user_meta_data->>'role' FROM auth.users
--      WHERE id = auth.uid()) = 'admin'
--   );
--
-- For now, keep it flat. Add role metadata to auth.users
-- via Supabase Auth user metadata when the team needs it.

-- ── IMPORTANT: service_role BYPASSES RLS ─────────────────────
-- Your backend API routes using the service_role key skip RLS.
-- Use service_role ONLY server-side (e.g., Next.js API routes).
-- Never expose service_role to the browser/client.
-- Client-side always uses the anon key + JWT from session.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vilo_opportunities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;

GRANT SELECT ON public.v_vilo_active TO authenticated;
GRANT SELECT ON public.v_vilo_overdue TO authenticated;
GRANT SELECT ON public.v_vitalis_active TO authenticated;
GRANT SELECT ON public.v_tasks_overdue TO authenticated;
GRANT SELECT ON public.v_dashboard_metrics TO authenticated;

GRANT USAGE ON TYPE public.org_type TO authenticated;
GRANT USAGE ON TYPE public.priority_level TO authenticated;
GRANT USAGE ON TYPE public.vilo_stage TO authenticated;
GRANT USAGE ON TYPE public.opportunity_type TO authenticated;
GRANT USAGE ON TYPE public.lead_source TO authenticated;
GRANT USAGE ON TYPE public.vitalis_stage TO authenticated;
GRANT USAGE ON TYPE public.preferred_language TO authenticated;
GRANT USAGE ON TYPE public.contact_channel TO authenticated;
GRANT USAGE ON TYPE public.gender_value TO authenticated;
GRANT USAGE ON TYPE public.age_range_value TO authenticated;
GRANT USAGE ON TYPE public.task_channel TO authenticated;
GRANT USAGE ON TYPE public.preferred_contact_method TO authenticated;
