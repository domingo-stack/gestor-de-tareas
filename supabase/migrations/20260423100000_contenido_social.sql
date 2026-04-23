-- ============================================================
-- Módulo Contenido Social: tabla + permiso + RLS
-- Blog → Carruseles con IA (via califica.ai API + OpenRouter)
-- ============================================================

-- 1. Tabla content_generations
CREATE TABLE IF NOT EXISTS content_generations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id           uuid NOT NULL,
  blog_title        text NOT NULL,
  blog_slug         text NOT NULL,
  type              text NOT NULL DEFAULT 'carousel',
  model_used        text,
  config            jsonb,
  result            jsonb NOT NULL,
  status            text DEFAULT 'generated'
    CHECK (status IN ('generated','edited','exported','published')),
  edited_result     jsonb,
  tokens_used       int,
  cost_usd          numeric(10,6),
  processing_time_ms int,
  exported_at       timestamptz,
  published_at      timestamptz,
  published_to      text[],
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_generations_blog_idx ON content_generations(blog_id);
CREATE INDEX IF NOT EXISTS content_generations_status_idx ON content_generations(status);
CREATE INDEX IF NOT EXISTS content_generations_created_idx ON content_generations(created_at DESC);

-- 2. Permiso mod_contenido_social
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS mod_contenido_social boolean DEFAULT false;

-- 3. RLS
ALTER TABLE content_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_generations_auth" ON content_generations
  FOR ALL USING (auth.role() = 'authenticated');

-- 4. Actualizar RPC get_user_role_and_permissions para incluir mod_contenido_social
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'get_user_role_and_permissions'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE WARNING 'get_user_role_and_permissions no encontrada';
    RETURN;
  END IF;

  IF v_src LIKE '%mod_contenido_social%' THEN
    RAISE NOTICE 'mod_contenido_social ya existe en RPC, skip';
    RETURN;
  END IF;

  -- Agregar mod_contenido_social al SELECT de permisos
  v_src := replace(v_src, 'mod_crm', 'mod_crm, mod_contenido_social');

  EXECUTE v_src;
  RAISE NOTICE 'get_user_role_and_permissions: mod_contenido_social agregado';
END $$;
