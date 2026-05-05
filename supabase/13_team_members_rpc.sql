-- ============================================================
--  VILO CRM — Lista de equipo para métricas (Action Center)
--  Run AFTER 05/06. El RLS de user_profiles no expone filas ajenas;
--  esta función SECURITY DEFINER devuelve compañeros con al menos una
--  UE en común con el usuario actual (solo activos).
-- ============================================================

CREATE OR REPLACE FUNCTION public.team_members_for_my_business_units()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    u.email::text AS email
  FROM public.user_profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE p.active
    AND coalesce(p.allowed_business_units, ARRAY[]::public.bu_enum[]) &&
        coalesce(
          (
            SELECT up.allowed_business_units
            FROM public.user_profiles up
            WHERE up.id = auth.uid()
          ),
          ARRAY[]::public.bu_enum[]
        );
$$;

COMMENT ON FUNCTION public.team_members_for_my_business_units IS
  'Perfiles activos con intersección de allowed_business_units respecto al caller. Email desde auth.users.';

REVOKE ALL ON FUNCTION public.team_members_for_my_business_units() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_members_for_my_business_units() TO authenticated;
