-- Migration 047: Add secret_snapshot to webhook_deliveries for replay with original signing secret (per Plugforge plan + architecture.md webhook contract)
-- Supports secret rotation safety: deliveries record the secret used at sign time; replays use snapshot.
-- Follows "migrations only" rule; no edit to schema.sql.

BEGIN;

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS secret_snapshot TEXT;

-- No backfill for historical rows (pre-047 replays will fallback to current sub secret in deliverer/replay path).
-- New deliveries from real deliverer will populate it.

COMMIT;
