-- Migration 039: FleetGraph durable outcomes
--
-- FleetGraph findings are agent outcomes, not Ship documents. They live in
-- dedicated tables while remaining anchored to workspaces and document scope.

CREATE TABLE IF NOT EXISTS fleetgraph_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scoped_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  detector_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  evidence JSONB NOT NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'open',
  material_change_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,

  CONSTRAINT fleetgraph_findings_detector_type_check CHECK (
    detector_type IN (
      'at_risk_week',
      'stale_blocker',
      'missing_standup',
      'planless_week',
      'scope_creep',
      'ownership_unclear'
    )
  ),
  CONSTRAINT fleetgraph_findings_severity_check CHECK (
    severity IN ('low', 'medium', 'high', 'critical')
  ),
  CONSTRAINT fleetgraph_findings_lifecycle_state_check CHECK (
    lifecycle_state IN (
      'open',
      'pending_review',
      'approved',
      'executed',
      'rejected',
      'dismissed',
      'snoozed',
      'expired'
    )
  ),
  CONSTRAINT fleetgraph_findings_evidence_non_empty_check CHECK (
    jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0
  ),
  CONSTRAINT fleetgraph_findings_material_change_key_not_blank_check CHECK (
    length(btrim(material_change_key)) > 0
  )
);

CREATE TABLE IF NOT EXISTS fleetgraph_action_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES fleetgraph_findings(id) ON DELETE CASCADE,
  target_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  role_reason TEXT NOT NULL,
  urgency TEXT NOT NULL,
  evidence JSONB NOT NULL,
  recommended_action TEXT NOT NULL,
  approval_level TEXT NOT NULL,
  reversibility TEXT NOT NULL,

  CONSTRAINT fleetgraph_action_candidates_role_reason_not_blank_check CHECK (
    length(btrim(role_reason)) > 0
  ),
  CONSTRAINT fleetgraph_action_candidates_urgency_check CHECK (
    urgency IN ('low', 'medium', 'high', 'critical')
  ),
  CONSTRAINT fleetgraph_action_candidates_evidence_non_empty_check CHECK (
    jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0
  ),
  CONSTRAINT fleetgraph_action_candidates_recommended_action_not_blank_check CHECK (
    length(btrim(recommended_action)) > 0
  ),
  CONSTRAINT fleetgraph_action_candidates_approval_level_check CHECK (
    approval_level IN ('none', 'notify_only', 'approval_required')
  ),
  CONSTRAINT fleetgraph_action_candidates_reversibility_check CHECK (
    reversibility IN ('reversible', 'partially_reversible', 'irreversible')
  )
);

CREATE TABLE IF NOT EXISTS fleetgraph_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES fleetgraph_findings(id) ON DELETE CASCADE,
  action_candidate_id UUID REFERENCES fleetgraph_action_candidates(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL,
  edited_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fleetgraph_approvals_decision_check CHECK (
    decision IN ('approved', 'rejected', 'edited')
  )
);

CREATE TABLE IF NOT EXISTS fleetgraph_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES fleetgraph_findings(id) ON DELETE CASCADE,
  suppression_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fleetgraph_suppressions_suppression_type_check CHECK (
    suppression_type IN ('dismissed', 'snoozed')
  ),
  CONSTRAINT fleetgraph_suppressions_reason_not_blank_check CHECK (
    length(btrim(reason)) > 0
  ),
  CONSTRAINT fleetgraph_suppressions_snooze_expires_at_check CHECK (
    suppression_type <> 'snoozed' OR expires_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS fleetgraph_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  detector TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost_usd NUMERIC(12, 6) NOT NULL,
  trace_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fleetgraph_usage_run_id_not_blank_check CHECK (
    length(btrim(run_id)) > 0
  ),
  CONSTRAINT fleetgraph_usage_trigger_check CHECK (
    trigger IN ('proactive', 'ondemand', 'resume')
  ),
  CONSTRAINT fleetgraph_usage_detector_check CHECK (
    detector IN (
      'at_risk_week',
      'stale_blocker',
      'missing_standup',
      'planless_week',
      'scope_creep',
      'ownership_unclear'
    )
  ),
  CONSTRAINT fleetgraph_usage_model_name_not_blank_check CHECK (
    length(btrim(model_name)) > 0
  ),
  CONSTRAINT fleetgraph_usage_input_tokens_nonnegative_check CHECK (
    input_tokens >= 0
  ),
  CONSTRAINT fleetgraph_usage_output_tokens_nonnegative_check CHECK (
    output_tokens >= 0
  ),
  CONSTRAINT fleetgraph_usage_estimated_cost_nonnegative_check CHECK (
    estimated_cost_usd >= 0
  ),
  CONSTRAINT fleetgraph_usage_trace_metadata_object_check CHECK (
    jsonb_typeof(trace_metadata) = 'object'
  )
);

CREATE OR REPLACE FUNCTION set_fleetgraph_findings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_fleetgraph_findings_updated_at ON fleetgraph_findings;
CREATE TRIGGER set_fleetgraph_findings_updated_at
BEFORE UPDATE ON fleetgraph_findings
FOR EACH ROW
EXECUTE FUNCTION set_fleetgraph_findings_updated_at();

CREATE INDEX IF NOT EXISTS idx_fleetgraph_findings_workspace_id
  ON fleetgraph_findings(workspace_id);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_findings_scoped_document_id
  ON fleetgraph_findings(scoped_document_id);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_findings_lifecycle_state
  ON fleetgraph_findings(lifecycle_state);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_findings_material_change_key
  ON fleetgraph_findings(material_change_key);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_findings_expires_at
  ON fleetgraph_findings(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fleetgraph_action_candidates_finding_id
  ON fleetgraph_action_candidates(finding_id);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_action_candidates_target_document_id
  ON fleetgraph_action_candidates(target_document_id);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_approvals_finding_id
  ON fleetgraph_approvals(finding_id);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_approvals_action_candidate_id
  ON fleetgraph_approvals(action_candidate_id)
  WHERE action_candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fleetgraph_suppressions_finding_id
  ON fleetgraph_suppressions(finding_id);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_suppressions_expires_at
  ON fleetgraph_suppressions(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fleetgraph_usage_workspace_id
  ON fleetgraph_usage(workspace_id);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_usage_run_id
  ON fleetgraph_usage(run_id);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_usage_created_at
  ON fleetgraph_usage(created_at DESC);
