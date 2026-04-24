ALTER TABLE comm_templates ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS comm_templates_archived_idx ON comm_templates(archived_at);
