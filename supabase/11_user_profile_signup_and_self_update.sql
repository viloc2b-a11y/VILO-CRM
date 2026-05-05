-- ============================================================
--  VILO CRM — Perfil al signup + actualización propia segura
--  Run AFTER 06_action_center_studies_ctms.sql (y idealmente 05).
--
--  NO crear public.profiles: ya existe public.user_profiles con rol,
--  allowed_business_units[] (Hazlo segregado) y RLS en action_items vía
--  user_can_access_bu(). Sustituir eso por una sola business_unit en
--  perfil + políticas solo-owner rompería:
--    • filas sync con owner_id NULL (08_sync_action_items_crm.sql)
--    • usuarios con acceso a más de una UE
--
--  Este archivo incorpora la intención del snippet (email, nombre, BU
--  inicial en signup, self_update) sobre user_profiles.
-- ============================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.user_profiles.email IS
  'Copia al alta desde auth.users; conveniencia de listados. La fuente de verdad sigue siendo auth.';

-- Impide que un usuario no admin se asigne rol admin, active=false o otras UEs.
CREATE OR REPLACE FUNCTION public.enforce_user_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.id IS NOT DISTINCT FROM auth.uid()
     AND NOT public.is_app_admin() THEN
    IF new.role IS DISTINCT FROM old.role
       OR new.active IS DISTINCT FROM old.active
       OR new.allowed_business_units IS DISTINCT FROM old.allowed_business_units THEN
      RAISE EXCEPTION 'Solo un administrador puede cambiar rol, UEs permitidas o estado activo';
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_self_update_guard ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_self_update_guard
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_profile_self_update();

DROP POLICY IF EXISTS "users_update_own_profile" ON public.user_profiles;
CREATE POLICY "users_update_own_profile"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Alta: nombre, email, rol; allowed_business_units desde raw_user_meta_data.business_unit si viene.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bu text;
  v_units public.bu_enum[];
BEGIN
  v_bu := new.raw_user_meta_data->>'business_unit';
  IF v_bu IN ('vilo_research', 'vitalis', 'hazloasiya') THEN
    v_units := ARRAY[v_bu::public.bu_enum];
  ELSE
    v_units := ARRAY['vilo_research', 'vitalis']::public.bu_enum[];
  END IF;

  INSERT INTO public.user_profiles (id, email, full_name, role, allowed_business_units)
  VALUES (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    coalesce(nullif(trim(new.raw_user_meta_data->>'role'), ''), 'coordinator'),
    v_units
  );
  RETURN new;
END;
$$;

-- Mantiene el nombre del trigger de 05_auth_rbac_activity.sql
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
