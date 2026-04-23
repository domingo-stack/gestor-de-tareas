-- Tabla content_generations (sin el DO block que falló antes)
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

ALTER TABLE content_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_generations_auth" ON content_generations
  FOR ALL USING (auth.role() = 'authenticated');
