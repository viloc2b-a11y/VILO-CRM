-- ============================================================
--  VILO CRM — action_items.assigned_to + RLS delegación
--  Run AFTER 06–08 (y 07 vistas). NO existe public.profiles: usar
--  user_can_access_bu(business_unit) desde user_profiles.
--
--  SELECT: acceso por UE, propietario, o delegado (assigned_to).
--  UPDATE: admin; o fila en pool (owner y assigned null) con acceso UE;
--          o quien es owner_id o assigned_to (p. ej. delegación cross-UE).
-- ============================================================

-- v_action_center usa SELECT * congelado al CREATE VIEW: recrear vistas.
DROP VIEW IF EXISTS public.v_action_center_metrics;
DROP VIEW IF EXISTS public.v_action_center;

ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.action_items.assigned_to IS
  'Usuario delegado (puede ver/actuar según RLS aunque la fila no sea suya por owner_id).';

CREATE INDEX IF NOT EXISTS idx_action_items_assigned_to ON public.action_items (assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE VIEW public.v_action_center
WITH (security_invoker = true)
AS
SELECT *
FROM public.action_items;

COMMENT ON VIEW public.v_action_center IS
  'Action Center source. MVP: mirrors action_items. Scale: UNION ALL normalized rows from tasks, opportunities, patient_leads, hazlo_*, etc., with identical column set.';

CREATE VIEW public.v_action_center_metrics
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) FILTER (
    WHERE priority = 'critical'::public.action_item_priority_enum
      AND status = ANY (
        ARRAY[
          'pending'::public.action_item_status_enum,
          'in_progress'::public.action_item_status_enum
        ]
      )
  )::bigint AS critical,
  COALESCE(
    SUM(value_usd) FILTER (WHERE status = 'pending'::public.action_item_status_enum),
    0::numeric
  ) AS pipeline_value
FROM public.action_items;

COMMENT ON VIEW public.v_action_center_metrics IS
  'Counts/sums only rows visible to the current user (RLS on action_items).';

GRANT SELECT ON public.v_action_center TO authenticated;
GRANT SELECT ON public.v_action_center_metrics TO authenticated;

-- Nombres de políticas experimentales / snippet ajeno
DROP POLICY IF EXISTS "view_assigned_or_bu" ON public.action_items;
DROP POLICY IF EXISTS "view_by_bu_or_assign" ON public.action_items;
DROP POLICY IF EXISTS "update_task_access" ON public.action_items;
DROP POLICY IF EXISTS "update_task_access_v2" ON public.action_items;

-- Políticas canónicas (06)
DROP POLICY IF EXISTS action_items_select ON public.action_items;
CREATE POLICY action_items_select
  ON public.action_items FOR SELECT
  TO authenticated
  USING (
    public.user_can_access_bu(business_unit)
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
  );

DROP POLICY IF EXISTS action_items_update ON public.action_items;
CREATE POLICY action_items_update
  ON public.action_items FOR UPDATE
  TO authenticated
  USING (
    public.is_app_admin()
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
    OR (
      owner_id IS NULL
      AND assigned_to IS NULL
      AND public.user_can_access_bu(business_unit)
    )
  )
  WITH CHECK (
    public.is_app_admin()
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
    OR public.user_can_access_bu(business_unit)
  );

-- INSERT / DELETE sin cambios de forma (acceso por UE)
DROP POLICY IF EXISTS action_items_insert ON public.action_items;
CREATE POLICY action_items_insert
  ON public.action_items FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_bu(business_unit));

DROP POLICY IF EXISTS action_items_delete ON public.action_items;
CREATE POLICY action_items_delete
  ON public.action_items FOR DELETE
  TO authenticated
  USING (public.user_can_access_bu(business_unit));
