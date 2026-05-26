import { describe, expect, it } from 'vitest';
import { classifyFleetGraphPolicy } from './policy.js';
import type { FleetGraphPolicyInput } from './policy.js';

const targetDocumentId = '22222222-2222-4222-8222-222222222222';
const ownerUserId = '77777777-7777-4777-8777-777777777777';

describe('FleetGraph policy classification', () => {
  it('keeps notify-only findings out of pending approval', () => {
    expect(classifyFleetGraphPolicy({
      ...basePolicyInput(),
      recommendedAction: {
        kind: 'notify',
        title: 'Review Week risk',
        body: 'Review the blocked launch approval before standup.',
      },
    })).toEqual({
      lifecycleState: 'open',
      approvalLevel: 'notify_only',
      reversibility: 'reversible',
      actionCandidate: null,
    });
  });

  it('requires approval for visible write candidates', () => {
    expect(classifyFleetGraphPolicy({
      ...basePolicyInput(),
      recommendedAction: {
        kind: 'update_issue_state',
        title: 'Move blocked issue',
        body: 'Move the launch approval issue back to blocked.',
      },
    })).toEqual({
      lifecycleState: 'pending_review',
      approvalLevel: 'approval_required',
      reversibility: 'partially_reversible',
      actionCandidate: {
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
          kind: 'update_issue_state',
          title: 'Move blocked issue',
          body: 'Move the launch approval issue back to blocked.',
        },
        approvalLevel: 'approval_required',
        reversibility: 'partially_reversible',
      },
    });
  });
});

function basePolicyInput(): Omit<FleetGraphPolicyInput, 'recommendedAction'> {
  return {
    targetDocumentId,
    ownerUserId,
    roleReason: 'Week owner is responsible for resolving at-risk Week blockers.',
    severity: 'high',
    evidence: [{
      sourceType: 'issue',
      sourceDocumentId: targetDocumentId,
      quote: 'Launch approval blocked',
      observedAt: '2026-05-26T05:00:00.000Z',
    }],
  };
}
