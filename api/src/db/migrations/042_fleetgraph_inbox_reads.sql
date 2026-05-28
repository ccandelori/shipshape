-- FleetGraph per-user inbox read watermarks
-- Tracks the last time a user opened the FleetGraph inbox in a workspace so
-- notification badges can show findings created since that moment.

CREATE TABLE IF NOT EXISTS fleetgraph_inbox_reads (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_inbox_reads_user_id
  ON fleetgraph_inbox_reads(user_id);

CREATE OR REPLACE FUNCTION set_fleetgraph_inbox_reads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_fleetgraph_inbox_reads_updated_at ON fleetgraph_inbox_reads;
CREATE TRIGGER set_fleetgraph_inbox_reads_updated_at
BEFORE UPDATE ON fleetgraph_inbox_reads
FOR EACH ROW
EXECUTE FUNCTION set_fleetgraph_inbox_reads_updated_at();
