import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pool } from '../../db/client.js';
import type { WeekContext } from '../context.js';
import {
  createAtRiskWeekInitialState,
  outputNode,
  AtRiskWeekBroadcastError,
  AtRiskWeekPersistenceError,
  type AtRiskWeekGraphInput,
  type AtRiskWeekGraphState,
  type AtRiskWeekOutputNodeDependencies,
  type AtRiskWeekReasoningOutput,
} from './at-risk-week.js';

type IdRow = {
  id: string;
};

type FindingRow = {
  workspace_id: string;
  scoped_document_id: string;
  detector_type: string;
  severity: string;
  evidence: unknown;
  recipient_user_id: string | null;
  lifecycle_state: string;
  material_change_key: string;
};

type CountRow = {
  count: string;
};

type AtRiskReasoningOutput = Extract<AtRiskWeekReasoningOutput, { isAtRisk: true }>;

type ActionCandidateRow = {
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

describe('FleetGraph at-risk Week output persistence', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const requestedAt = '2026-05-26T05:00:00.000Z';
  const completedAt = '2026-05-26T05:03:00.000Z';
  const materialChangeKey = `v1:persistence-${testRunId}`;
  let workspaceId = '';
  let ownerUserId = '';
  let scopedDocId = '';

  beforeAll(async () => {
    const workspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`FleetGraph Persistence ${testRunId}`]
    );
    workspaceId = workspaceResult.rows[0]!.id;

    const ownerResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Persistence Owner') RETURNING id`,
      [`fleetgraph-persistence-${testRunId}@test.local`]
    );
    ownerUserId = ownerResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspaceId, ownerUserId]
    );

    const weekResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'FleetGraph Persistence Week', 'workspace', $2::uuid,
               jsonb_build_object('owner_id', $2::text))
       RETURNING id`,
      [workspaceId, ownerUserId]
    );
    scopedDocId = weekResult.rows[0]!.id;
  });

  afterAll(async () => {
    if (workspaceId) {
      await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    }

    if (ownerUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [ownerUserId]);
    }
  });

  it('persists a finding-only output and broadcasts the recipient invalidation event', async () => {
    const client = await pool.connect();
    const broadcastToUser = vi.fn();
    const state = createOutputReadyState({
      workspaceId,
      scopedDocId,
      ownerUserId,
      requestedAt,
      materialChangeKey,
      policyKind: 'finding_only',
    });
    const dependencies: AtRiskWeekOutputNodeDependencies = {
      client,
      broadcastToUser,
      now: () => completedAt,
    };

    try {
      const outputState = await outputNode(state, dependencies);

      expect(outputState.status).toBe('completed');
      expect(outputState.activeNode).toBe(null);
      expect(outputState.completedNodes).toEqual([
        'scope',
        'context',
        'guard',
        'preFilter',
        'reason',
        'policy',
        'output',
      ]);
      expect(outputState.persistence).toEqual({
        findingId: expect.any(String),
        actionCandidateId: null,
        broadcastEvent: 'fleetgraph:finding_created',
      });

      const findingResult = await pool.query<FindingRow>(
        `SELECT workspace_id, scoped_document_id, detector_type, severity, evidence,
                recipient_user_id, lifecycle_state, material_change_key
         FROM fleetgraph_findings
         WHERE id = $1`,
        [outputState.persistence!.findingId]
      );

      expect(findingResult.rows[0]).toEqual({
        workspace_id: workspaceId,
        scoped_document_id: scopedDocId,
        detector_type: 'at_risk_week',
        severity: 'high',
        evidence: [{
          sourceType: 'issue',
          sourceDocumentId: scopedDocId,
          quote: 'Launch approval blocked',
          observedAt: '2026-05-26T05:00:00.000Z',
        }],
        recipient_user_id: ownerUserId,
        lifecycle_state: 'open',
        material_change_key: materialChangeKey,
      });
      expect(broadcastToUser).toHaveBeenCalledWith(ownerUserId, 'fleetgraph:finding_created', {
        workspaceId,
        scopedDocumentId: scopedDocId,
        findingId: outputState.persistence!.findingId,
        actionCandidateId: null,
        detectorType: 'at_risk_week',
        severity: 'high',
        lifecycleState: 'open',
      });
    } finally {
      client.release();
    }
  });

  it('persists an approval-gated action candidate with pending review lifecycle', async () => {
    const client = await pool.connect();
    const broadcastToUser = vi.fn();
    const state = createOutputReadyState({
      workspaceId,
      scopedDocId,
      ownerUserId,
      requestedAt,
      materialChangeKey: `${materialChangeKey}:candidate`,
      policyKind: 'action_candidate',
    });
    const dependencies: AtRiskWeekOutputNodeDependencies = {
      client,
      broadcastToUser,
      now: () => completedAt,
    };

    try {
      const outputState = await outputNode(state, dependencies);

      expect(outputState.persistence).toEqual({
        findingId: expect.any(String),
        actionCandidateId: expect.any(String),
        broadcastEvent: 'fleetgraph:finding_created',
      });

      const findingResult = await pool.query<FindingRow>(
        `SELECT workspace_id, scoped_document_id, detector_type, severity, evidence,
                recipient_user_id, lifecycle_state, material_change_key
         FROM fleetgraph_findings
         WHERE id = $1`,
        [outputState.persistence!.findingId]
      );
      expect(findingResult.rows[0]).toMatchObject({
        workspace_id: workspaceId,
        scoped_document_id: scopedDocId,
        lifecycle_state: 'pending_review',
        material_change_key: `${materialChangeKey}:candidate`,
      });

      const candidateResult = await pool.query<ActionCandidateRow>(
        `SELECT finding_id, target_document_id, owner_user_id, role_reason, urgency,
                evidence, recommended_action, approval_level, reversibility
         FROM fleetgraph_action_candidates
         WHERE id = $1`,
        [outputState.persistence!.actionCandidateId]
      );
      expect(candidateResult.rows[0]).toEqual({
        finding_id: outputState.persistence!.findingId,
        target_document_id: scopedDocId,
        owner_user_id: ownerUserId,
        role_reason: 'Week owner is responsible for resolving at-risk Week blockers.',
        urgency: 'high',
        evidence: [{
          sourceType: 'issue',
          sourceDocumentId: scopedDocId,
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
      expect(broadcastToUser).toHaveBeenCalledWith(ownerUserId, 'fleetgraph:finding_created', {
        workspaceId,
        scopedDocumentId: scopedDocId,
        findingId: outputState.persistence!.findingId,
        actionCandidateId: outputState.persistence!.actionCandidateId,
        detectorType: 'at_risk_week',
        severity: 'high',
        lifecycleState: 'pending_review',
      });
    } finally {
      client.release();
    }
  });

  it('rolls back finding creation and skips broadcast when action candidate persistence fails', async () => {
    const client = await pool.connect();
    const broadcastToUser = vi.fn();
    const failedMaterialChangeKey = `${materialChangeKey}:candidate-failure`;
    const state = createOutputReadyState({
      workspaceId,
      scopedDocId,
      ownerUserId,
      requestedAt,
      materialChangeKey: failedMaterialChangeKey,
      policyKind: 'action_candidate',
    });
    const missingDocumentId = '99999999-9999-4999-8999-999999999999';
    const failedState: AtRiskWeekGraphState = {
      ...state,
      policy: {
        ...state.policy!,
        actionCandidate: {
          ...state.policy!.actionCandidate!,
          targetDocumentId: missingDocumentId,
        },
      },
    };
    const dependencies: AtRiskWeekOutputNodeDependencies = {
      client,
      broadcastToUser,
      now: () => completedAt,
    };

    try {
      await expect(outputNode(failedState, dependencies)).rejects.toThrow(AtRiskWeekPersistenceError);
      const findingCountResult = await pool.query<CountRow>(
        `SELECT COUNT(*)::text AS count
         FROM fleetgraph_findings
         WHERE workspace_id = $1
           AND material_change_key = $2`,
        [workspaceId, failedMaterialChangeKey]
      );

      expect(findingCountResult.rows[0]!.count).toBe('0');
      expect(broadcastToUser).not.toHaveBeenCalled();
    } finally {
      client.release();
    }
  });

  it('surfaces broadcast failures with persisted finding context', async () => {
    expect.assertions(6);

    const client = await pool.connect();
    const failedMaterialChangeKey = `${materialChangeKey}:broadcast-failure`;
    const state = createOutputReadyState({
      workspaceId,
      scopedDocId,
      ownerUserId,
      requestedAt,
      materialChangeKey: failedMaterialChangeKey,
      policyKind: 'finding_only',
    });
    const dependencies: AtRiskWeekOutputNodeDependencies = {
      client,
      broadcastToUser: vi.fn(() => {
        throw new Error('events socket unavailable');
      }),
      now: () => completedAt,
    };

    try {
      await outputNode(state, dependencies);
    } catch (error) {
      expect(error).toBeInstanceOf(AtRiskWeekBroadcastError);
      const broadcastError = error as AtRiskWeekBroadcastError;
      expect(broadcastError.message).toContain('events socket unavailable');
      expect(broadcastError.workspaceId).toBe(workspaceId);
      expect(broadcastError.scopedDocId).toBe(scopedDocId);
      expect(broadcastError.findingId).toEqual(expect.any(String));

      const findingCountResult = await pool.query<CountRow>(
        `SELECT COUNT(*)::text AS count
         FROM fleetgraph_findings
         WHERE id = $1`,
        [broadcastError.findingId]
      );
      expect(findingCountResult.rows[0]!.count).toBe('1');
    } finally {
      client.release();
    }
  });
});

type OutputPolicyKind = 'finding_only' | 'action_candidate';

type OutputReadyStateInput = {
  workspaceId: string;
  scopedDocId: string;
  ownerUserId: string;
  requestedAt: string;
  materialChangeKey: string;
  policyKind: OutputPolicyKind;
};

function createOutputReadyState(input: OutputReadyStateInput): AtRiskWeekGraphState {
  const graphInput: AtRiskWeekGraphInput = {
    workspaceId: input.workspaceId,
    scopedDocId: input.scopedDocId,
    runId: '33333333-3333-4333-8333-333333333333',
    triggerSource: 'poll',
    requestedAt: input.requestedAt,
  };
  const initialState = createAtRiskWeekInitialState(graphInput);
  const reasoning = createReasoningOutput(input.scopedDocId, input.policyKind);

  return {
    ...initialState,
    activeNode: 'output',
    completedNodes: ['scope', 'context', 'guard', 'preFilter', 'reason', 'policy'],
    scope: {
      ...initialState.scope,
      materialChangeKey: input.materialChangeKey,
    },
    context: createWeekContext(input),
    guard: {
      shouldRun: true,
      reason: `run_material_changed_no_suppression:${input.materialChangeKey}`,
      materialChangeKey: input.materialChangeKey,
    },
    preFilter: {
      shouldReason: true,
      reason: 'candidate_risk',
      evidenceSummary: ['High-priority blocked issue: Launch approval blocked'],
    },
    reasoning,
    policy: createPolicyDecision(input, reasoning),
    trace: {
      ...initialState.trace,
      materialChangeKey: input.materialChangeKey,
    },
  };
}

function createReasoningOutput(scopedDocId: string, policyKind: OutputPolicyKind): AtRiskWeekReasoningOutput {
  return {
    isAtRisk: true,
    severity: 'high',
    evidence: [{
      sourceType: 'issue',
      sourceDocumentId: scopedDocId,
      quote: 'Launch approval blocked',
      observedAt: '2026-05-26T05:00:00.000Z',
    }],
    recommendedAction: createRecommendedAction(policyKind),
    rationale: 'The Week has a blocked high-priority launch approval issue.',
  };
}

function createRecommendedAction(policyKind: OutputPolicyKind): AtRiskReasoningOutput['recommendedAction'] {
  if (policyKind === 'finding_only') {
    return {
      kind: 'notify',
      title: 'Review Week risk',
      body: 'Review the blocked launch approval before standup.',
    };
  }

  return {
    kind: 'draft_comment',
    title: 'Ask for blocker update',
    body: 'Please post the current blocker owner and next step before standup.',
  };
}

function createPolicyDecision(
  input: OutputReadyStateInput,
  reasoning: AtRiskWeekReasoningOutput
): AtRiskWeekGraphState['policy'] {
  if (!reasoning.isAtRisk) {
    throw new Error('Persistence test requires at-risk reasoning');
  }

  if (input.policyKind === 'finding_only') {
    return {
      lifecycleState: 'open',
      approvalLevel: 'notify_only',
      reversibility: 'reversible',
      actionCandidate: null,
    };
  }

  return {
    lifecycleState: 'pending_review',
    approvalLevel: 'approval_required',
    reversibility: 'reversible',
    actionCandidate: {
      targetDocumentId: input.scopedDocId,
      ownerUserId: input.ownerUserId,
      roleReason: 'Week owner is responsible for resolving at-risk Week blockers.',
      urgency: reasoning.severity,
      evidence: reasoning.evidence,
      recommendedAction: reasoning.recommendedAction,
      approvalLevel: 'approval_required',
      reversibility: 'reversible',
    },
  };
}

function createWeekContext(input: OutputReadyStateInput): WeekContext {
  return {
    week: {
      id: input.scopedDocId,
      workspaceId: input.workspaceId,
      documentType: 'sprint',
      title: 'FleetGraph Persistence Week',
      content: {},
      parentId: null,
      properties: {
        owner_id: input.ownerUserId,
      },
      ticketNumber: null,
      createdAt: new Date('2026-05-20T05:00:00.000Z'),
      updatedAt: new Date('2026-05-26T05:00:00.000Z'),
    },
    ownerUserId: input.ownerUserId,
    projectId: null,
    programId: null,
    issues: [],
    standups: [],
    sprintIterations: [],
    accountability: {
      weeklyPlan: {
        exists: true,
        documentIds: [],
      },
      weeklyRetro: {
        exists: false,
        documentIds: [],
      },
    },
  };
}
