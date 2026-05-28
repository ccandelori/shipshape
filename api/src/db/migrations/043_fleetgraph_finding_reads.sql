-- FleetGraph per-finding read state
-- Tracks which actionable findings each user has actually viewed.

CREATE TABLE IF NOT EXISTS fleetgraph_finding_reads (
  finding_id UUID NOT NULL REFERENCES fleetgraph_findings(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (finding_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_finding_reads_workspace_user
  ON fleetgraph_finding_reads(workspace_id, user_id);

CREATE OR REPLACE FUNCTION set_fleetgraph_finding_reads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_fleetgraph_finding_reads_updated_at ON fleetgraph_finding_reads;
CREATE TRIGGER set_fleetgraph_finding_reads_updated_at
BEFORE UPDATE ON fleetgraph_finding_reads
FOR EACH ROW
EXECUTE FUNCTION set_fleetgraph_finding_reads_updated_at();

INSERT INTO fleetgraph_finding_reads (finding_id, workspace_id, user_id, read_at)
SELECT
  finding.id,
  inbox_read.workspace_id,
  inbox_read.user_id,
  inbox_read.last_opened_at
FROM fleetgraph_inbox_reads inbox_read
INNER JOIN fleetgraph_findings finding
  ON finding.workspace_id = inbox_read.workspace_id
 AND finding.created_at <= inbox_read.last_opened_at
ON CONFLICT (finding_id, user_id)
DO NOTHING;
