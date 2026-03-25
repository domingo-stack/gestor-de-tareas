-- Actualizar RPCs de permisos para incluir todos los módulos
-- (faltaban mod_customer_success, mod_comunicaciones, mod_marketing)

-- 1. Actualizar get_all_users_admin para devolver todos los módulos
DROP FUNCTION IF EXISTS get_all_users_admin();
CREATE OR REPLACE FUNCTION get_all_users_admin()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  mod_tareas BOOLEAN,
  mod_calendario BOOLEAN,
  mod_revenue BOOLEAN,
  mod_finanzas BOOLEAN,
  mod_producto BOOLEAN,
  mod_customer_success BOOLEAN,
  mod_comunicaciones BOOLEAN,
  mod_marketing BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND profiles.role = 'superadmin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    u.email::TEXT,
    p.role,
    COALESCE(up.mod_tareas, false),
    COALESCE(up.mod_calendario, false),
    COALESCE(up.mod_revenue, false),
    COALESCE(up.mod_finanzas, false),
    COALESCE(up.mod_producto, false),
    COALESCE(up.mod_customer_success, false),
    COALESCE(up.mod_comunicaciones, false),
    COALESCE(up.mod_marketing, false),
    u.created_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN user_permissions up ON up.user_id = p.id
  WHERE p.role IS NOT NULL
  ORDER BY u.created_at DESC;
END;
$$;

-- 2. Actualizar update_user_module_permission para soportar todos los módulos

DROP FUNCTION IF EXISTS update_user_module_permission(UUID, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION update_user_module_permission(
  target_user_id UUID,
  module_name TEXT,
  enabled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND profiles.role = 'superadmin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Ensure user_permissions row exists
  INSERT INTO user_permissions (user_id)
  VALUES (target_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF module_name = 'mod_tareas' THEN
    UPDATE user_permissions SET mod_tareas = enabled WHERE user_id = target_user_id;
  ELSIF module_name = 'mod_calendario' THEN
    UPDATE user_permissions SET mod_calendario = enabled WHERE user_id = target_user_id;
  ELSIF module_name = 'mod_revenue' THEN
    UPDATE user_permissions SET mod_revenue = enabled WHERE user_id = target_user_id;
  ELSIF module_name = 'mod_finanzas' THEN
    UPDATE user_permissions SET mod_finanzas = enabled WHERE user_id = target_user_id;
  ELSIF module_name = 'mod_producto' THEN
    UPDATE user_permissions SET mod_producto = enabled WHERE user_id = target_user_id;
  ELSIF module_name = 'mod_customer_success' THEN
    UPDATE user_permissions SET mod_customer_success = enabled WHERE user_id = target_user_id;
  ELSIF module_name = 'mod_comunicaciones' THEN
    UPDATE user_permissions SET mod_comunicaciones = enabled WHERE user_id = target_user_id;
  ELSIF module_name = 'mod_marketing' THEN
    UPDATE user_permissions SET mod_marketing = enabled WHERE user_id = target_user_id;
  ELSE
    RAISE EXCEPTION 'Módulo no válido: %', module_name;
  END IF;
END;
$$;
