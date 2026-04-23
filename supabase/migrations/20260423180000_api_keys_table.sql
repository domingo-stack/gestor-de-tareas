-- Tabla api_keys para gestión de keys del API público del Gestor
CREATE TABLE IF NOT EXISTS api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  key_hash    text NOT NULL,
  key_prefix  text NOT NULL,              -- primeros 8 chars para identificar visualmente
  permissions text[] DEFAULT '{}',         -- ej: {'calendar:write','calendar:read'}
  created_by  uuid REFERENCES auth.users(id),
  last_used   timestamptz,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_active_idx ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_superadmin" ON api_keys
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
  );
