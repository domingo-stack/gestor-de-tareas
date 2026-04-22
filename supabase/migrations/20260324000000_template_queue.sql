-- Template queue system: enables batch submission to Meta (3 at a time)
-- to avoid saturating Meta's review queue.

ALTER TABLE comm_templates
  ADD COLUMN IF NOT EXISTS queue_batch integer,
  ADD COLUMN IF NOT EXISTS queue_priority integer;

-- Partial index for efficient queue queries
CREATE INDEX IF NOT EXISTS idx_comm_templates_queue
  ON comm_templates (queue_batch)
  WHERE queue_batch IS NOT NULL;
