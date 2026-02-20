-- =============================================
-- Módulo de Producto: Dual-Track Agile
-- =============================================

-- 1. Tabla product_initiatives
CREATE TABLE IF NOT EXISTS product_initiatives (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  problem_statement TEXT,
  item_type TEXT NOT NULL CHECK (item_type IN ('experiment', 'feature', 'tech_debt', 'bug')) DEFAULT 'feature',
  phase TEXT NOT NULL CHECK (phase IN ('backlog', 'discovery', 'delivery', 'finalized')) DEFAULT 'backlog',
  status TEXT NOT NULL CHECK (status IN ('pending', 'design', 'running', 'analyzing', 'paused', 'completed')) DEFAULT 'pending',
  owner_id UUID REFERENCES auth.users(id),
  -- RICE scoring
  rice_reach NUMERIC DEFAULT 0,
  rice_impact NUMERIC DEFAULT 0,
  rice_confidence NUMERIC DEFAULT 0,
  rice_effort NUMERIC DEFAULT 1,
  rice_score NUMERIC GENERATED ALWAYS AS (
    CASE WHEN rice_effort > 0 THEN (rice_reach * rice_impact * rice_confidence) / rice_effort ELSE 0 END
  ) STORED,
  -- Experiment data (JSON for flexibility)
  experiment_data JSONB DEFAULT '{}'::jsonb,
  -- Relationships
  project_id INT REFERENCES projects(id) ON DELETE SET NULL,
  parent_id INT REFERENCES product_initiatives(id) ON DELETE SET NULL,
  -- Period (for roadmap placement)
  period_type TEXT CHECK (period_type IN ('week', 'month')),
  period_value TEXT,
  -- Tags
  tags TEXT[] DEFAULT '{}',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for common queries
CREATE INDEX idx_initiatives_phase ON product_initiatives(phase);
CREATE INDEX idx_initiatives_owner ON product_initiatives(owner_id);
CREATE INDEX idx_initiatives_project ON product_initiatives(project_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_initiative_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_initiative_updated_at
  BEFORE UPDATE ON product_initiatives
  FOR EACH ROW
  EXECUTE FUNCTION update_initiative_updated_at();

-- 2. RLS policies
ALTER TABLE product_initiatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view initiatives"
  ON product_initiatives FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert initiatives"
  ON product_initiatives FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Owner or superadmin can update initiatives"
  ON product_initiatives FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

CREATE POLICY "Superadmin can delete initiatives"
  ON product_initiatives FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- 3. Agregar permiso mod_producto a user_permissions
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS mod_producto BOOLEAN DEFAULT false;

-- 4. DROP + recrear RPC get_user_role_and_permissions (cambio de return type requiere DROP)
DROP FUNCTION IF EXISTS get_user_role_and_permissions();
CREATE OR REPLACE FUNCTION get_user_role_and_permissions()
RETURNS TABLE (
  role TEXT,
  mod_tareas BOOLEAN,
  mod_calendario BOOLEAN,
  mod_revenue BOOLEAN,
  mod_finanzas BOOLEAN,
  mod_producto BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.role,
    COALESCE(up.mod_tareas, false),
    COALESCE(up.mod_calendario, false),
    COALESCE(up.mod_revenue, false),
    COALESCE(up.mod_finanzas, false),
    COALESCE(up.mod_producto, false)
  FROM profiles p
  LEFT JOIN user_permissions up ON up.user_id = p.id
  WHERE p.id = auth.uid();
END;
$$;

-- 5. DROP + recrear RPC get_all_users_admin
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
    u.created_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN user_permissions up ON up.user_id = p.id
  WHERE p.role IS NOT NULL
  ORDER BY u.created_at DESC;
END;
$$;

-- 6. DROP + recrear RPC update_user_module_permission
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
  ELSE
    RAISE EXCEPTION 'Módulo no válido: %', module_name;
  END IF;
END;
$$;

-- 7. DROP + recrear RPC update_user_role
DROP FUNCTION IF EXISTS update_user_role(UUID, TEXT);
CREATE OR REPLACE FUNCTION update_user_role(
  target_user_id UUID,
  new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND profiles.role = 'superadmin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE profiles SET role = new_role WHERE id = target_user_id;

  INSERT INTO user_permissions (user_id, mod_tareas, mod_calendario, mod_revenue, mod_finanzas, mod_producto)
  VALUES (target_user_id, true, new_role = 'member', false, false, new_role = 'member')
  ON CONFLICT (user_id) DO UPDATE SET
    mod_tareas = true,
    mod_calendario = (new_role = 'member'),
    mod_revenue = false,
    mod_finanzas = false,
    mod_producto = (new_role = 'member');
END;
$$;
