-- =====================================================================
-- Multi-tenancy: organizaciones, departamentos, membresías e invitaciones
-- =====================================================================
-- Reemplaza el modelo single-tenant (user_roles global, profiles.department
-- como texto libre) por un modelo multi-tenant: cada empresa cliente es una
-- fila en `organizations`, y toda la data (sesiones, alertas, miembros,
-- departamentos) queda aislada por `org_id` vía RLS.
--
-- BREAKING CHANGE: elimina `public.user_roles`, `public.has_role(...)` y la
-- columna `public.profiles.department`. El código de la app debe migrar a
-- `organization_members` / `public.my_organizations()`.

-- ---------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------
CREATE TYPE public.org_role AS ENUM ('owner', 'hr', 'employee');

-- ---------------------------------------------------------------------
-- 2. organizations (el tenant)
-- ---------------------------------------------------------------------
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'trial',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 3. departments (catálogo propio de cada organización)
-- ---------------------------------------------------------------------
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE INDEX departments_org_id_idx ON public.departments(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 4. organization_members (usuario × organización: su rol y depto ahí)
-- ---------------------------------------------------------------------
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  role public.org_role NOT NULL DEFAULT 'employee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX organization_members_org_id_idx ON public.organization_members(org_id);
CREATE INDEX organization_members_user_id_idx ON public.organization_members(user_id);
GRANT SELECT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. organization_invites (invitaciones pendientes por correo)
-- ---------------------------------------------------------------------
CREATE TABLE public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.org_role NOT NULL DEFAULT 'employee',
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Evita dos invitaciones pendientes para el mismo correo en la misma org.
CREATE UNIQUE INDEX organization_invites_pending_email_idx
  ON public.organization_invites (org_id, lower(email))
  WHERE accepted_at IS NULL;
CREATE INDEX organization_invites_org_id_idx ON public.organization_invites(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invites TO authenticated;
GRANT ALL ON public.organization_invites TO service_role;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 6. Funciones de autorización (reemplazan a has_role)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND org_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org_id UUID, _role public.org_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND org_id = _org_id AND role = _role
  )
$$;

-- "admin" = puede ver el panel agregado de RR. HH. (owner u hr)
CREATE OR REPLACE FUNCTION public.has_org_admin_access(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND org_id = _org_id AND role IN ('owner', 'hr')
  )
$$;

-- Perfil visible si es el propio, o si quien mira es owner/hr de una org
-- donde el perfil observado también es miembro.
CREATE OR REPLACE FUNCTION public.can_view_profile(_viewer_id UUID, _target_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _viewer_id = _target_id OR EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members them ON them.org_id = me.org_id
    WHERE me.user_id = _viewer_id
      AND me.role IN ('owner', 'hr')
      AND them.user_id = _target_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_org_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_org_role(UUID, UUID, public.org_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_org_admin_access(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_profile(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(UUID, UUID, public.org_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_admin_access(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_profile(UUID, UUID) TO authenticated, service_role;

-- A qué organización(es) pertenece el usuario autenticado y con qué rol,
-- para que la app lo resuelva sin tener que hardcodear nada.
CREATE OR REPLACE FUNCTION public.my_organizations()
RETURNS TABLE (org_id UUID, role public.org_role, department_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT org_id, role, department_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_organizations() TO authenticated;

-- ---------------------------------------------------------------------
-- 7. Columna org_id en posture_sessions (posture_alerts hereda el org vía
--    session_id; no se denormaliza para que nunca quede desincronizado)
-- ---------------------------------------------------------------------
ALTER TABLE public.posture_sessions
  ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------
-- 8. Backfill: todo lo que ya existe pasa a una organización "legacy".
--    En un proyecto nuevo (sin usuarios todavía) este bloque no hace nada.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  default_org_id UUID;
  first_hr_user UUID;
BEGIN
  INSERT INTO public.organizations (name, slug, plan)
  VALUES ('Organización por defecto', 'default', 'trial')
  RETURNING id INTO default_org_id;

  -- El primer usuario que tenía rol 'hr' pasa a 'owner' de esa org;
  -- el resto de 'hr' se mantiene como 'hr'.
  SELECT ur.user_id INTO first_hr_user
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'hr'
  ORDER BY p.created_at ASC
  LIMIT 1;

  -- Un departamento por cada texto distinto ya usado en profiles.department.
  INSERT INTO public.departments (org_id, name)
  SELECT DISTINCT default_org_id, p.department
  FROM public.profiles p
  WHERE NULLIF(trim(p.department), '') IS NOT NULL
  ON CONFLICT (org_id, name) DO NOTHING;

  -- Una membresía por cada perfil existente.
  INSERT INTO public.organization_members (org_id, user_id, department_id, role)
  SELECT
    default_org_id,
    p.id,
    d.id,
    CASE
      WHEN p.id = first_hr_user THEN 'owner'::public.org_role
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'hr')
        THEN 'hr'::public.org_role
      ELSE 'employee'::public.org_role
    END
  FROM public.profiles p
  LEFT JOIN public.departments d
    ON d.org_id = default_org_id AND d.name = p.department
  ON CONFLICT (org_id, user_id) DO NOTHING;

  -- Las sesiones existentes quedan bajo la org por defecto.
  UPDATE public.posture_sessions SET org_id = default_org_id WHERE org_id IS NULL;
END $$;

ALTER TABLE public.posture_sessions ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX posture_sessions_org_id_idx ON public.posture_sessions(org_id);
CREATE INDEX posture_sessions_org_started_idx ON public.posture_sessions(org_id, started_at DESC);

-- ---------------------------------------------------------------------
-- 9. profiles: fuera `department` (texto libre) — ahora vive en
--    organization_members.department_id, porque el departamento es
--    contexto de la membresía, no de la identidad global del usuario.
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles DROP COLUMN department;

-- ---------------------------------------------------------------------
-- 10. Políticas RLS: fuera las basadas en has_role, dentro las de org
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own_or_hr" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "roles_select_own_or_hr" ON public.user_roles;
DROP POLICY IF EXISTS "sessions_select_own_or_hr" ON public.posture_sessions;
DROP POLICY IF EXISTS "sessions_insert_own" ON public.posture_sessions;
DROP POLICY IF EXISTS "sessions_update_own" ON public.posture_sessions;
DROP POLICY IF EXISTS "sessions_delete_own" ON public.posture_sessions;
DROP POLICY IF EXISTS "alerts_select_own_or_hr" ON public.posture_alerts;
DROP POLICY IF EXISTS "alerts_insert_own" ON public.posture_alerts;

-- profiles
CREATE POLICY "profiles_select_own_or_org_admin" ON public.profiles FOR SELECT TO authenticated
USING (public.can_view_profile(auth.uid(), id));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- organizations: visibles para sus miembros; solo el owner edita los datos
-- de la org. No hay política de INSERT para "authenticated" a propósito:
-- una organización solo se crea desde handle_new_user() (SECURITY DEFINER)
-- o desde el backend con service_role.
CREATE POLICY "organizations_select_member" ON public.organizations FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "organizations_update_owner" ON public.organizations FOR UPDATE TO authenticated
USING (public.has_org_role(auth.uid(), id, 'owner'))
WITH CHECK (public.has_org_role(auth.uid(), id, 'owner'));

-- departments: cualquier miembro las lee; solo owner/hr las administra.
CREATE POLICY "departments_select_member" ON public.departments FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "departments_write_admin" ON public.departments FOR ALL TO authenticated
USING (public.has_org_admin_access(auth.uid(), org_id))
WITH CHECK (public.has_org_admin_access(auth.uid(), org_id));

-- organization_members: cada quien ve su propia fila; owner/hr ven todo el
-- roster de su org. Solo el owner cambia roles o quita miembros. Sin
-- política de INSERT: las membresías nacen por invitación aceptada
-- (handle_new_user) o por una futura función administrativa en
-- SECURITY DEFINER — nunca por INSERT directo del cliente.
CREATE POLICY "members_select_self_or_admin" ON public.organization_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_org_admin_access(auth.uid(), org_id));
CREATE POLICY "members_update_owner" ON public.organization_members FOR UPDATE TO authenticated
USING (public.has_org_role(auth.uid(), org_id, 'owner'))
WITH CHECK (public.has_org_role(auth.uid(), org_id, 'owner'));
CREATE POLICY "members_delete_owner" ON public.organization_members FOR DELETE TO authenticated
USING (public.has_org_role(auth.uid(), org_id, 'owner'));

-- organization_invites: solo owner/hr de la org gestionan sus invitaciones.
CREATE POLICY "invites_all_admin" ON public.organization_invites FOR ALL TO authenticated
USING (public.has_org_admin_access(auth.uid(), org_id))
WITH CHECK (public.has_org_admin_access(auth.uid(), org_id));

-- posture_sessions
CREATE POLICY "sessions_select_own_or_org_admin" ON public.posture_sessions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_org_admin_access(auth.uid(), org_id));
CREATE POLICY "sessions_insert_own" ON public.posture_sessions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_org_member(auth.uid(), org_id));
CREATE POLICY "sessions_update_own" ON public.posture_sessions FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "sessions_delete_own" ON public.posture_sessions FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- posture_alerts (el org se resuelve vía su sesión, sin denormalizar)
CREATE POLICY "alerts_select_own_or_org_admin" ON public.posture_alerts FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.posture_sessions s
    WHERE s.id = posture_alerts.session_id
      AND public.has_org_admin_access(auth.uid(), s.org_id)
  )
);
CREATE POLICY "alerts_insert_own" ON public.posture_alerts FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 11. handle_new_user(): crea el perfil y une al usuario a una org —
--     por invitación aceptada, o creando una organización nueva (alta
--     self-serve, donde el usuario queda como owner).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_invite public.organization_invites%ROWTYPE;
  new_org_id UUID;
  new_org_name TEXT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, locale)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'locale', 'es')
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO pending_invite
  FROM public.organization_invites
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.organization_members (org_id, user_id, department_id, role)
    VALUES (pending_invite.org_id, NEW.id, pending_invite.department_id, pending_invite.role)
    ON CONFLICT (org_id, user_id) DO NOTHING;

    UPDATE public.organization_invites
    SET accepted_at = now()
    WHERE id = pending_invite.id;
  ELSE
    new_org_name := COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'organization_name'), ''),
      'Organización de ' || COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email)
    );

    INSERT INTO public.organizations (name, slug)
    VALUES (
      new_org_name,
      'org-' || substr(replace(NEW.id::text, '-', ''), 1, 12)
    )
    RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (new_org_id, NEW.id, 'owner');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 12. Limpieza: fuera el modelo global de roles
-- ---------------------------------------------------------------------
DROP TABLE public.user_roles;
DROP FUNCTION public.has_role(UUID, public.app_role);
DROP TYPE public.app_role;
