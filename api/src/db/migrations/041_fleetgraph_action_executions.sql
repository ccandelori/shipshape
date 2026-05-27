-- Migration 041: FleetGraph action execution audit
--
-- Resume can create visible Ship writes. Store execution results durably so
-- retries with the same idempotency key can return without double-executing.

CREATE TABLE IF NOT EXISTS fleetgraph_action_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES fleetgraph_findings(id) ON DELETE CASCADE,
  action_candidate_id UUID NOT NULL REFERENCES fleetgraph_action_candidates(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fleetgraph_action_executions_idempotency_key_not_blank_check CHECK (
    idempotency_key IS NULL OR length(btrim(idempotency_key)) > 0
  ),
  CONSTRAINT fleetgraph_action_executions_result_object_check CHECK (
    jsonb_typeof(result) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_action_executions_finding_id
  ON fleetgraph_action_executions(finding_id);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_action_executions_action_candidate_id
  ON fleetgraph_action_executions(action_candidate_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleetgraph_action_executions_idempotency_key
  ON fleetgraph_action_executions(action_candidate_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
