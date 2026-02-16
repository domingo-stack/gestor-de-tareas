-- ============================================================
-- MIGRACIÓN: Multi-Tenant → Organización Única con Roles/Permisos
-- Ejecutar en Supabase SQL Editor paso a paso
-- ============================================================

-- ============================================================
-- FASE 0A: Tabla org_settings (singleton)
-- ============================================================

CREATE TABLE IF NOT EXISTS org_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Califica',
  domain TEXT NOT NULL DEFAULT 'califica.ai',
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO org_settings (name, domain) VALUES ('Califica', 'califica.ai')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden leer org_settings"
  ON org_settings FOR SELECT
  USING (true);

CREATE POLICY "Solo superadmin puede modificar org_settings"
  ON org_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- ============================================================
-- FASE 0B: Tabla user_permissions
-- ============================================================

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mod_tareas BOOLEAN NOT NULL DEFAULT true,
  mod_calendario BOOLEAN NOT NULL DEFAULT false,
  mod_revenue BOOLEAN NOT NULL DEFAULT false,
  mod_finanzas BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios leen sus propios permisos"
  ON user_permissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Superadmin lee todos los permisos"
  ON user_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

CREATE POLICY "Superadmin modifica permisos"
  ON user_permissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

CREATE POLICY "Superadmin inserta permisos"
  ON user_permissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Permitir que el service role (triggers/edge functions) inserte permisos
CREATE POLICY "Service role inserta permisos"
  ON user_permissions FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- FASE 0C: Actualizar profiles existentes
-- ============================================================

-- Convertir roles Dueño → superadmin
UPDATE profiles SET role = 'superadmin' WHERE role = 'Dueño';

-- Asignar member a usuarios con @califica.ai que no tienen rol definido o son miembros
UPDATE profiles
SET role = 'member'
WHERE role IS NULL OR role NOT IN ('superadmin')
  AND id IN (
    SELECT id FROM auth.users WHERE email LIKE '%@califica.ai'
  );

-- Asignar invitado al resto
UPDATE profiles
SET role = 'invitado'
WHERE role IS NULL OR role NOT IN ('superadmin', 'member');

-- Crear permisos default para todos los usuarios existentes
INSERT INTO user_permissions (user_id, mod_tareas, mod_calendario, mod_revenue, mod_finanzas)
SELECT
  p.id,
  true, -- todos tienen tareas
  CASE WHEN p.role IN ('superadmin', 'member') THEN true ELSE false END,
  CASE WHEN p.role = 'superadmin' THEN true ELSE false END,
  CASE WHEN p.role = 'superadmin' THEN true ELSE false END
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM user_permissions up WHERE up.user_id = p.id
);

-- ============================================================
-- FASE 0D: Nuevas RPCs
-- ============================================================

-- RPC: get_user_role_and_permissions (reemplaza get_user_role_and_team_info)
CREATE OR REPLACE FUNCTION get_user_role_and_permissions()
RETURNS TABLE (
  role TEXT,
  mod_tareas BOOLEAN,
  mod_calendario BOOLEAN,
  mod_revenue BOOLEAN,
  mod_finanzas BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT p.role INTO v_role FROM profiles p WHERE p.id = auth.uid();

  -- Superadmin siempre tiene todos los permisos
  IF v_role = 'superadmin' THEN
    RETURN QUERY SELECT
      v_role,
      true::boolean,
      true::boolean,
      true::boolean,
      true::boolean;
  ELSE
    RETURN QUERY SELECT
      v_role,
      COALESCE(up.mod_tareas, false),
      COALESCE(up.mod_calendario, false),
      COALESCE(up.mod_revenue, false),
      COALESCE(up.mod_finanzas, false)
    FROM user_permissions up
    WHERE up.user_id = auth.uid();
  END IF;
END;
$$;

-- RPC: get_all_members (reemplaza get_team_members y get_team_members_by_active_team)
CREATE OR REPLACE FUNCTION get_all_members()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS user_id,
    u.email::TEXT,
    p.role::TEXT
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role IS NOT NULL
  ORDER BY u.email;
END;
$$;

-- RPC: get_all_users_admin (panel admin, solo superadmin)
CREATE OR REPLACE FUNCTION get_all_users_admin()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  mod_tareas BOOLEAN,
  mod_calendario BOOLEAN,
  mod_revenue BOOLEAN,
  mod_finanzas BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificar que sea superadmin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND profiles.role = 'superadmin') THEN
    RAISE EXCEPTION 'No tienes permisos para esta acción';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    u.email::TEXT,
    p.role::TEXT,
    COALESCE(up.mod_tareas, false),
    COALESCE(up.mod_calendario, false),
    COALESCE(up.mod_revenue, false),
    COALESCE(up.mod_finanzas, false),
    u.created_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN user_permissions up ON up.user_id = p.id
  WHERE p.role IS NOT NULL
  ORDER BY u.email;
END;
$$;

-- RPC: update_user_role (solo superadmin)
CREATE OR REPLACE FUNCTION update_user_role(
  target_user_id UUID,
  new_role TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificar que sea superadmin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin') THEN
    RAISE EXCEPTION 'No tienes permisos para esta acción';
  END IF;

  -- Validar el nuevo rol
  IF new_role NOT IN ('superadmin', 'member', 'invitado') THEN
    RAISE EXCEPTION 'Rol inválido: %', new_role;
  END IF;

  -- No permitir cambiarse el rol a sí mismo
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes cambiar tu propio rol';
  END IF;

  UPDATE profiles SET role = new_role WHERE id = target_user_id;

  -- Si el nuevo rol es superadmin, dar todos los permisos
  IF new_role = 'superadmin' THEN
    UPDATE user_permissions
    SET mod_tareas = true, mod_calendario = true, mod_revenue = true, mod_finanzas = true,
        updated_at = now()
    WHERE user_permissions.user_id = target_user_id;
  END IF;

  RETURN 'Rol actualizado exitosamente';
END;
$$;

-- RPC: update_user_module_permission (solo superadmin)
CREATE OR REPLACE FUNCTION update_user_module_permission(
  target_user_id UUID,
  module_name TEXT,
  enabled BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificar que sea superadmin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin') THEN
    RAISE EXCEPTION 'No tienes permisos para esta acción';
  END IF;

  -- Validar el nombre del módulo
  IF module_name NOT IN ('mod_tareas', 'mod_calendario', 'mod_revenue', 'mod_finanzas') THEN
    RAISE EXCEPTION 'Módulo inválido: %', module_name;
  END IF;

  -- Actualizar el permiso dinámicamente
  EXECUTE format(
    'UPDATE user_permissions SET %I = $1, updated_at = now() WHERE user_id = $2',
    module_name
  ) USING enabled, target_user_id;

  RETURN 'Permiso actualizado';
END;
$$;

-- RPC: add_member (reemplaza add_member_to_active_team)
CREATE OR REPLACE FUNCTION add_member(
  member_email TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_domain TEXT;
  v_org_domain TEXT;
  v_new_role TEXT;
BEGIN
  -- Verificar que sea superadmin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin') THEN
    RAISE EXCEPTION 'No tienes permisos para esta acción';
  END IF;

  -- Buscar usuario por email
  SELECT id INTO v_user_id FROM auth.users WHERE email = member_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró un usuario con ese email. Debe registrarse primero.';
  END IF;

  -- Verificar si ya tiene rol
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND role IS NOT NULL) THEN
    RAISE EXCEPTION 'Este usuario ya es miembro de la organización.';
  END IF;

  -- Auto-detectar rol por dominio
  SELECT domain INTO v_org_domain FROM org_settings WHERE id = 1;
  v_domain := split_part(member_email, '@', 2);

  IF v_domain = v_org_domain THEN
    v_new_role := 'member';
  ELSE
    v_new_role := 'invitado';
  END IF;

  -- Asignar rol
  UPDATE profiles SET role = v_new_role WHERE id = v_user_id;

  -- Crear permisos default
  INSERT INTO user_permissions (user_id, mod_tareas, mod_calendario, mod_revenue, mod_finanzas)
  VALUES (
    v_user_id,
    true,
    CASE WHEN v_new_role = 'member' THEN true ELSE false END,
    false,
    false
  )
  ON CONFLICT (user_id) DO UPDATE SET
    mod_tareas = true,
    mod_calendario = CASE WHEN v_new_role = 'member' THEN true ELSE false END,
    updated_at = now();

  RETURN format('Usuario %s añadido como %s', member_email, v_new_role);
END;
$$;

-- RPC: remove_member (reemplaza remove_team_member)
CREATE OR REPLACE FUNCTION remove_member(
  member_id_to_remove UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificar que sea superadmin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin') THEN
    RAISE EXCEPTION 'No tienes permisos para esta acción';
  END IF;

  -- No permitir eliminarse a sí mismo
  IF member_id_to_remove = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminarte a ti mismo';
  END IF;

  -- Nullificar rol
  UPDATE profiles SET role = NULL WHERE id = member_id_to_remove;

  -- Eliminar permisos
  DELETE FROM user_permissions WHERE user_id = member_id_to_remove;

  RETURN 'Miembro eliminado exitosamente';
END;
$$;

-- ============================================================
-- FASE 0G: Hacer columnas team_id nullable
-- ============================================================

-- Nota: Estos ALTER solo funcionan si las columnas existen y tienen NOT NULL.
-- Si ya son nullable, estos comandos son seguros (no fallan).
DO $$
BEGIN
  -- tasks.team_id
  BEGIN
    ALTER TABLE tasks ALTER COLUMN team_id DROP NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'tasks.team_id ya es nullable o no existe';
  END;

  -- projects.team_id
  BEGIN
    ALTER TABLE projects ALTER COLUMN team_id DROP NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'projects.team_id ya es nullable o no existe';
  END;

  -- invitations.team_id
  BEGIN
    ALTER TABLE invitations ALTER COLUMN team_id DROP NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'invitations.team_id ya es nullable o no existe';
  END;

  -- profiles.active_team_id
  BEGIN
    ALTER TABLE profiles ALTER COLUMN active_team_id DROP NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'profiles.active_team_id ya es nullable o no existe';
  END;
END;
$$;

-- ============================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================
-- Verificación: Ejecutar estas queries para confirmar:
-- SELECT * FROM get_user_role_and_permissions();
-- SELECT * FROM get_all_members();
-- SELECT * FROM org_settings;
-- SELECT * FROM user_permissions LIMIT 5;
