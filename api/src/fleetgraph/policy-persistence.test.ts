import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import {
  persistPendingAction,
  FleetGraphPendingActionPersistenceError,
  type FleetGraphPendingActionFinding,
} from './policy.js';
import type { ActionCandidate } from './types.js';

type IdRow = {
  id: string;
};

type FindingLifecycleRow = {
  lifecycle_state: string;
};

type CandidateRow = {
  finding_id: string;
  target_document_id: string;
  owner_user_id: string | null;
  role_reason: string;
  urgency: string;
  evidence: unknown;
  recommended_action: string;
  approval_level: string;
  reversibility: string;
};

type CountRow = {
  count: string;
};

describe('FleetGraph pending action persistence', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let findingSequence = 0;
  let workspaceId = '';
  let ownerUserId = '';
  let targetDocumentId = '';

  beforeAll(async () => {
    const workspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`FleetGraph Policy ${testRunId}`]
    );
    workspaceId = workspaceResult.rows[0]!.id;

    const ownerResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Policy Owner') RETURNING id`,
      [`fleetgraph-policy-${testRunId}@test.local`]
    );
    ownerUserId = ownerResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspaceId, ownerUserId]
    );

    const documentResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'FleetGraph Policy Week', 'workspace', $2, '{}'::jsonb)
       RETURNING id`,
      [workspaceId, ownerUserId]
    );
    targetDocumentId = documentResult.rows[0]!.id;
  });

  afterAll(async () => {
    if (workspaceId) {
      await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    }

    if (ownerUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [ownerUserId]);
    }
  });

  it('inserts an action candidate and transitions finding lifecycle in one transaction', async () => {
    const client = await pool.connect();
    const finding = await createFinding('open');
    const pendingFinding: FleetGraphPendingActionFinding = {
      id: finding.id,
      workspaceId,
      expectedLifecycleState: 'open',
    };

    try {
      const actionCandidateId = await persistPendingAction(
        client,
        pendingFinding,
        createActionCandidate()
      );

      const candidateResult = await pool.query<CandidateRow>(
        `SELECT finding_id, target_document_id, owner_user_id, role_reason, urgency,
                evidence, recommended_action, approval_level, reversibility
         FROM fleetgraph_action_candidates
         WHERE id = $1`,
        [actionCandidateId]
      );
      expect(candidateResult.rows[0]).toEqual({
        finding_id: finding.id,
        target_document_id: targetDocumentId,
        owner_user_id: ownerUserId,
        role_reason: 'Week owner is responsible for resolving at-risk Week blockers.',
        urgency: 'high',
        evidence: [{
          sourceType: 'issue',
          sourceDocumentId: targetDocumentId,
          quote: 'Launch approval blocked',
          observedAt: '2026-05-26T05:00:00.000Z',
        }],
        recommended_action: JSON.stringify({
          kind: 'draft_comment',
          title: 'Ask for blocker update',
          body: 'Please post the current blocker owner and next step before standup.',
        }),
        approval_level: 'approval_required',
        reversibility: 'reversible',
      });

      const lifecycleResult = await pool.query<FindingLifecycleRow>(
        `SELECT lifecycle_state
         FROM fleetgraph_findings
         WHERE id = $1`,
        [finding.id]
      );
      expect(lifecycleResult.rows[0]!.lifecycle_state).toBe('pending_review');
    } finally {
      client.release();
    }
  });

  it('rolls back candidate insertion when the lifecycle transition is invalid', async () => {
    const client = await pool.connect();
    const finding = await createFinding('open');
    const pendingFinding: FleetGraphPendingActionFinding = {
      id: finding.id,
      workspaceId,
      expectedLifecycleState: 'dismissed',
    };

    try {
      await expect(persistPendingAction(
        client,
        pendingFinding,
        createActionCandidate()
      )).rejects.toThrow(FleetGraphPendingActionPersistenceError);

      const candidateCountResult = await pool.query<CountRow>(
        `SELECT COUNT(*)::text AS count
         FROM fleetgraph_action_candidates
         WHERE finding_id = $1`,
        [finding.id]
      );
      expect(candidateCountResult.rows[0]!.count).toBe('0');

      const lifecycleResult = await pool.query<FindingLifecycleRow>(
        `SELECT lifecycle_state
         FROM fleetgraph_findings
         WHERE id = $1`,
        [finding.id]
      );
      expect(lifecycleResult.rows[0]!.lifecycle_state).toBe('open');
    } finally {
      client.release();
    }
  });

  async function createFinding(lifecycleState: string): Promise<IdRow> {
    const result = await pool.query<IdRow>(
      `INSERT INTO fleetgraph_findings (
         workspace_id, scoped_document_id, detector_type, severity, evidence,
         recipient_user_id, lifecycle_state, material_change_key
       )
       VALUES (
         $1, $2, 'at_risk_week', 'high',
         '[{"sourceType":"issue","quote":"Launch approval blocked"}]'::jsonb,
         $3, $4, $5
       )
       RETURNING id`,
      [workspaceId, targetDocumentId, ownerUserId, lifecycleState, `v1:policy-${testRunId}-${findingSequence}`]
    );
    findingSequence += 1;

    return result.rows[0]!;
  }

  function createActionCandidate(): ActionCandidate {
    return {
      targetDocumentId,
      ownerUserId,
      roleReason: 'Week owner is responsible for resolving at-risk Week blockers.',
      urgency: 'high',
      evidence: [{
        sourceType: 'issue',
        sourceDocumentId: targetDocumentId,
        quote: 'Launch approval blocked',
        observedAt: '2026-05-26T05:00:00.000Z',
      }],
      recommendedAction: {
        kind: 'draft_comment',
        title: 'Ask for blocker update',
        body: 'Please post the current blocker owner and next step before standup.',
      },
      approvalLevel: 'approval_required',
      reversibility: 'reversible',
    };
  }
});
