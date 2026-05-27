import { describe, expect, it } from 'vitest';
import {
  actionCandidateSchema,
  approvalDecisionSchema,
  findingSchema,
  graphStateSchema,
  suppressionSchema,
  type ActionCandidate,
  type ApprovalDecision,
  type Finding,
  type GraphState,
  type Suppression,
} from './types.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const weekId = '44444444-4444-4444-8444-444444444444';
const programId = '55555555-5555-4555-8555-555555555555';
const findingId = '66666666-6666-4666-8666-666666666666';
const userId = '77777777-7777-4777-8777-777777777777';
const runId = '88888888-8888-4888-8888-888888888888';
const actionTargetId = '99999999-9999-4999-8999-999999999999';

function buildFinding(overrides: Partial<Finding>): Finding {
  return {
    id: findingId,
    workspaceId,
    scopedDocumentId: weekId,
    detectorType: 'at_risk_week',
    severity: 'high',
    evidence: [{
      sourceType: 'issue',
      sourceDocumentId: documentId,
      quote: 'Three in-progress issues have not changed in two days.',
      observedAt: '2026-05-26T02:00:00.000Z',
    }],
    recipientUserId: userId,
    lifecycleState: 'open',
    materialChangeKey: 'week-risk:2026-05-26',
    createdAt: '2026-05-26T02:00:00.000Z',
    ...overrides,
  };
}

const actionCandidate: ActionCandidate = {
  targetDocumentId: actionTargetId,
  ownerUserId: userId,
  roleReason: 'The week owner is accountable for blocked delivery work.',
  urgency: 'high',
  evidence: [{
    sourceType: 'issue',
    sourceDocumentId: documentId,
    quote: 'The issue has been blocked since Monday.',
    observedAt: '2026-05-26T02:00:00.000Z',
  }],
  recommendedAction: {
    kind: 'draft_comment',
    title: 'Ask for blocker update',
    body: 'Can you share the current blocker and next step for this issue?',
  },
  approvalLevel: 'approval_required',
  reversibility: 'reversible',
};

const approvalDecision: ApprovalDecision = {
  findingId,
  actorUserId: userId,
  decision: 'edited',
  editedAction: {
    kind: 'notify',
    body: "Please review the blocked issue before today's standup.",
  },
  timestamp: '2026-05-26T02:05:00.000Z',
};

const suppression: Suppression = {
  findingId,
  type: 'snoozed',
  expiresAt: '2026-05-27T02:00:00.000Z',
  reason: 'The owner already acknowledged this blocker.',
};

describe('FleetGraph domain types', () => {
  it('validates a complete graph state fixture', () => {
    const graphState: GraphState = {
      trigger: 'proactive',
      mode: 'monitor',
      scope: {
        workspaceId,
        documentId,
        documentType: 'sprint',
        projectId,
        weekId,
        programId,
      },
      context: {
        findings: [],
        actionCandidates: [actionCandidate],
        suppressions: [suppression],
        usageMetadata: [],
      },
      output: {
        findings: [buildFinding({})],
        actionCandidates: [actionCandidate],
        approvalDecisions: [approvalDecision],
        usageMetadata: [{
          runId,
          workspaceId,
          trigger: 'proactive',
          detector: 'at_risk_week',
          modelName: 'gpt-4.1-mini',
          inputTokens: 1200,
          outputTokens: 240,
          estimatedCost: 0.01,
        }],
      },
    };

    expect(graphStateSchema.parse(graphState)).toEqual(graphState);
    expect(actionCandidateSchema.parse(actionCandidate)).toEqual(actionCandidate);
    expect(approvalDecisionSchema.parse(approvalDecision)).toEqual(approvalDecision);
    expect(suppressionSchema.parse(suppression)).toEqual(suppression);
  });

  it('rejects non-UUID identifiers at runtime boundaries', () => {
    const invalidFinding = buildFinding({ workspaceId: 'workspace-1' });

    expect(findingSchema.safeParse(invalidFinding).success).toBe(false);
  });

  it('rejects missing required fields at runtime boundaries', () => {
    const invalidFinding = {
      id: findingId,
      workspaceId,
      scopedDocumentId: weekId,
      detectorType: 'at_risk_week',
      severity: 'high',
      evidence: [{
        sourceType: 'issue',
        sourceDocumentId: documentId,
        quote: 'Three in-progress issues have not changed in two days.',
        observedAt: '2026-05-26T02:00:00.000Z',
      }],
      recipientUserId: userId,
      lifecycleState: 'open',
      createdAt: '2026-05-26T02:00:00.000Z',
    };

    expect(findingSchema.safeParse(invalidFinding).success).toBe(false);
  });

  it('rejects lifecycle states outside the FleetGraph state machine', () => {
    const invalidFinding = {
      ...buildFinding({}),
      lifecycleState: 'waiting',
    };

    expect(findingSchema.safeParse(invalidFinding).success).toBe(false);
  });
});
