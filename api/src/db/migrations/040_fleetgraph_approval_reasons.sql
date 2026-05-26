-- Migration 040: FleetGraph approval rejection reasons
--
-- Rejection is a terminal decision, so the actor's reason belongs on the
-- durable approval audit row rather than in the finding payload.

ALTER TABLE fleetgraph_approvals
  ADD COLUMN IF NOT EXISTS reason TEXT;

UPDATE fleetgraph_approvals
SET reason = 'Rejection reason was not captured before migration 040.'
WHERE decision = 'rejected'
  AND (reason IS NULL OR length(btrim(reason)) = 0);

ALTER TABLE fleetgraph_approvals
  DROP CONSTRAINT IF EXISTS fleetgraph_approvals_rejected_reason_check;

ALTER TABLE fleetgraph_approvals
  ADD CONSTRAINT fleetgraph_approvals_rejected_reason_check CHECK (
    decision <> 'rejected'
    OR (reason IS NOT NULL AND length(btrim(reason)) > 0)
  );
