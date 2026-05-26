import { describe, expect, it } from 'vitest';
import {
  classifyApprovalLevel,
  classifyFleetGraphPolicy,
  fleetGraphApprovalPolicyExamples,
  fleetGraphApprovalPolicyLevels,
  fleetGraphApprovalPolicyTaxonomy,
  fleetGraphVisibleWriteActionKinds,
  FleetGraphApprovalPolicyInputError,
} from './policy.js';
import type { FleetGraphPolicyInput } from './policy.js';

const targetDocumentId = '22222222-2222-4222-8222-222222222222';
const ownerUserId = '77777777-7777-4777-8777-777777777777';

describe('FleetGraph policy classification', () => {
  it('defines the approval taxonomy with concrete examples', () => {
    expect(fleetGraphApprovalPolicyLevels).toEqual([
      'auto_answer',
      'quick_confirm',
      'explicit_approval',
    ]);
    expect(fleetGraphApprovalPolicyTaxonomy.auto_answer).toMatchObject({
      storesPendingAction: false,
      visibleWriteAllowed: false,
      defaultForAmbiguousAction: false,
    });
    expect(fleetGraphApprovalPolicyTaxonomy.quick_confirm).toMatchObject({
      storesPendingAction: false,
      visibleWriteAllowed: false,
      defaultForAmbiguousAction: false,
    });
    expect(fleetGraphApprovalPolicyTaxonomy.explicit_approval).toMatchObject({
      storesPendingAction: true,
      visibleWriteAllowed: true,
      defaultForAmbiguousAction: true,
    });
    expect(fleetGraphVisibleWriteActionKinds).toEqual([
      'draft_comment',
      'create_issue',
      'update_issue_state',
      'assign_issue',
    ]);
    expect(fleetGraphApprovalPolicyExamples.map((example) => ({
      actionKind: example.actionKind,
      approvalPolicyLevel: example.approvalPolicyLevel,
    }))).toEqual([
      {
        actionKind: 'private_answer',
        approvalPolicyLevel: 'auto_answer',
      },
      {
        actionKind: 'notify',
        approvalPolicyLevel: 'quick_confirm',
      },
      {
        actionKind: 'draft_comment',
        approvalPolicyLevel: 'explicit_approval',
      },
      {
        actionKind: 'create_issue',
        approvalPolicyLevel: 'explicit_approval',
      },
      {
        actionKind: 'update_issue_state',
        approvalPolicyLevel: 'explicit_approval',
      },
      {
        actionKind: 'assign_issue',
        approvalPolicyLevel: 'explicit_approval',
      },
    ]);
  });

  it('classifies known and unknown action kinds into the approval taxonomy', () => {
    expect(classifyApprovalLevel({
      kind: 'private_answer',
      body: 'The blocker is waiting on launch approval.',
    })).toBe('auto_answer');
    expect(classifyApprovalLevel({
      kind: 'notify',
      body: 'Review the blocked launch approval before standup.',
    })).toBe('quick_confirm');
    expect(classifyApprovalLevel({
      kind: 'draft_comment',
      body: 'Please post the current blocker owner and next step.',
    })).toBe('explicit_approval');
    expect(classifyApprovalLevel({
      kind: 'create_issue',
      body: 'Create a follow-up issue for launch approval.',
    })).toBe('explicit_approval');
    expect(classifyApprovalLevel({
      kind: 'update_issue_state',
      body: 'Move the launch approval issue back to blocked.',
    })).toBe('explicit_approval');
    expect(classifyApprovalLevel({
      kind: 'assign_issue',
      body: 'Assign the launch approval issue to the Week owner.',
    })).toBe('explicit_approval');
    expect(classifyApprovalLevel({
      kind: 'archive_project',
      body: 'Unsupported actions default to the safer approval path.',
    })).toBe('explicit_approval');
  });

  it('rejects structurally invalid approval candidates with a specific error', () => {
    expect(() => classifyApprovalLevel({
      body: 'Missing kind.',
    })).toThrow(FleetGraphApprovalPolicyInputError);
    expect(() => classifyApprovalLevel({
      kind: '',
      body: 'Blank kind.',
    })).toThrow('FleetGraph approval candidate kind must be a non-empty string');
  });

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
