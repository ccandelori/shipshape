import { describe, expect, it } from 'vitest';
import { AtRiskWeekNodeContractError } from './at-risk-week-errors.js';
import {
  createAtRiskWeekOutputEffect,
} from './at-risk-week-output.js';
import { atRiskWeekDetectorType } from './at-risk-week-constants.js';
import type { AtRiskWeekReasoningOutput } from './at-risk-week-reasoner.js';
import type { AtRiskWeekPolicyDecision } from './at-risk-week-policy.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const scopedDocId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const ownerUserId = '44444444-4444-4444-8444-444444444444';
const materialChangeKey = 'v1:test-material-change-key';

describe('createAtRiskWeekOutputEffect', () => {
  it('builds durable output and broadcast intents from an at-risk policy decision', () => {
    const reasoning = createAtRiskReasoningOutput();
    const policy = createPolicyDecision(reasoning);

    const effect = createAtRiskWeekOutputEffect({
      workspaceId,
      scopedDocId,
      runId,
      ownerUserId,
      materialChangeKey,
      reasoning,
      policy,
      lifecycleState: 'pending_review',
    });

    expect(effect.persistence).toEqual({
      workspaceId,
      scopedDocId,
      runId,
      detectorType: atRiskWeekDetectorType,
      severity: 'high',
      evidence: reasoning.evidence,
      recipientUserId: ownerUserId,
      lifecycleState: 'pending_review',
      materialChangeKey,
      actionCandidate: policy.actionCandidate,
    });
    expect(effect.broadcast).toEqual({
      userId: ownerUserId,
      eventType: 'fleetgraph:finding_created',
      payload: {
        workspaceId,
        scopedDocumentId: scopedDocId,
        detectorType: atRiskWeekDetectorType,
        severity: 'high',
      },
    });
  });

  it('omits the broadcast intent when the Week has no owner', () => {
    const reasoning = createAtRiskReasoningOutput();

    const effect = createAtRiskWeekOutputEffect({
      workspaceId,
      scopedDocId,
      runId,
      ownerUserId: null,
      materialChangeKey,
      reasoning,
      policy: createPolicyDecision(reasoning),
      lifecycleState: 'open',
    });

    expect(effect.persistence.recipientUserId).toBeNull();
    expect(effect.broadcast).toBeNull();
  });

  it('rejects non-risk reasoning before building side-effect intents', () => {
    const reasoning: AtRiskWeekReasoningOutput = {
      isAtRisk: false,
      severity: null,
      evidence: [],
      recommendedAction: null,
      rationale: 'The Week is healthy.',
    };
    const policy: AtRiskWeekPolicyDecision = {
      lifecycleState: 'open',
      approvalLevel: 'notify_only',
      reversibility: 'reversible',
      actionCandidate: null,
    };

    expect(() => createAtRiskWeekOutputEffect({
      workspaceId,
      scopedDocId,
      runId,
      ownerUserId,
      materialChangeKey,
      reasoning,
      policy,
      lifecycleState: 'open',
    })).toThrow(AtRiskWeekNodeContractError);
  });
});

function createAtRiskReasoningOutput(): AtRiskWeekReasoningOutput {
  return {
    isAtRisk: true,
    severity: 'high',
    evidence: [{
      sourceType: 'issue',
      sourceDocumentId: scopedDocId,
      quote: 'Launch approval remains blocked without a recovery owner.',
      observedAt: '2026-05-26T05:00:00.000Z',
    }],
    recommendedAction: {
      kind: 'draft_comment',
      title: 'Ask for blocker recovery owner',
      body: 'Please name the recovery owner and next mitigation step.',
    },
    rationale: 'The Week contains a high-priority blocked issue with no current recovery owner.',
  };
}

function createPolicyDecision(reasoning: AtRiskWeekReasoningOutput): AtRiskWeekPolicyDecision {
  if (!reasoning.isAtRisk) {
    throw new Error('Output effect test requires at-risk reasoning');
  }

  return {
    lifecycleState: 'pending_review',
    approvalLevel: 'approval_required',
    reversibility: 'reversible',
    actionCandidate: {
      targetDocumentId: scopedDocId,
      ownerUserId,
      roleReason: 'Week owner is responsible for resolving at-risk Week blockers.',
      urgency: reasoning.severity,
      evidence: reasoning.evidence,
      recommendedAction: reasoning.recommendedAction,
      approvalLevel: 'approval_required',
      reversibility: 'reversible',
    },
  };
}
