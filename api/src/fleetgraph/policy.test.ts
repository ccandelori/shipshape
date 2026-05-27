import { describe, expect, it } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  autoExecuteIfAllowed,
  classifyApprovalLevel,
  classifyFleetGraphPolicy,
  fleetGraphApprovalPolicyExamples,
  fleetGraphApprovalPolicyLevels,
  fleetGraphApprovalPolicyTaxonomy,
  fleetGraphVisibleWriteActionKinds,
  FleetGraphActionExecutionError,
  FleetGraphApprovalPolicyInputError,
} from './policy.js';
import type { FleetGraphActionExecutionFinding, FleetGraphPolicyInput } from './policy.js';
import type { FleetGraphQueryClient } from './context.js';
import type { ActionCandidate, FleetGraphActionKind, FleetGraphApprovalLevel, FleetGraphLifecycleState } from './types.js';

const targetDocumentId = '22222222-2222-4222-8222-222222222222';
const otherDocumentId = '33333333-3333-4333-8333-333333333333';
const ownerUserId = '77777777-7777-4777-8777-777777777777';
const findingId = '99999999-9999-4999-8999-999999999999';
const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

describe('FleetGraph action auto-execution', () => {
  it('marks scoped non-visible candidates executed exactly once', async () => {
    const execution = createAutoExecutionClient('open');

    const result = await autoExecuteIfAllowed(
      execution.client,
      createExecutionFinding('open'),
      createExecutionActionCandidate('none', 'notify', targetDocumentId)
    );

    expect(result).toEqual({
      executed: true,
      lifecycleState: 'executed',
    });
    expect(execution.state.lifecycleState).toBe('executed');
    expect(execution.state.executionUpdates).toBe(1);
  });

  it('leaves explicit approval candidates unexecuted after scope validation', async () => {
    const execution = createAutoExecutionClient('pending_review');

    const result = await autoExecuteIfAllowed(
      execution.client,
      createExecutionFinding('pending_review'),
      createExecutionActionCandidate('approval_required', 'draft_comment', targetDocumentId)
    );

    expect(result).toEqual({
      executed: false,
      lifecycleState: 'pending_review',
    });
    expect(execution.state.lifecycleState).toBe('pending_review');
    expect(execution.state.executionUpdates).toBe(0);
  });

  it('rejects repeated execution attempts without another lifecycle update', async () => {
    const execution = createAutoExecutionClient('open');
    const finding = createExecutionFinding('open');
    const actionCandidate = createExecutionActionCandidate('none', 'notify', targetDocumentId);

    await autoExecuteIfAllowed(execution.client, finding, actionCandidate);

    await expect(autoExecuteIfAllowed(
      execution.client,
      finding,
      actionCandidate
    )).rejects.toThrow(FleetGraphActionExecutionError);
    expect(execution.state.lifecycleState).toBe('executed');
    expect(execution.state.executionUpdates).toBe(1);
    expect(execution.state.rollbacks).toBe(1);
  });

  it('rejects action candidates outside the finding document scope', async () => {
    const execution = createAutoExecutionClient('open');

    await expect(autoExecuteIfAllowed(
      execution.client,
      createExecutionFinding('open'),
      createExecutionActionCandidate('none', 'notify', otherDocumentId)
    )).rejects.toThrow(FleetGraphActionExecutionError);
    expect(execution.state.lifecycleState).toBe('open');
    expect(execution.state.executionUpdates).toBe(0);
    expect(execution.state.rollbacks).toBe(1);
  });

  it('rejects visible write candidates even when their approval level is malformed as automatic', async () => {
    const execution = createAutoExecutionClient('open');

    await expect(autoExecuteIfAllowed(
      execution.client,
      createExecutionFinding('open'),
      createExecutionActionCandidate('none', 'draft_comment', targetDocumentId)
    )).rejects.toThrow(FleetGraphActionExecutionError);
    expect(execution.state.lifecycleState).toBe('open');
    expect(execution.state.executionUpdates).toBe(0);
    expect(execution.state.rollbacks).toBe(1);
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

type AutoExecutionClientState = {
  lifecycleState: FleetGraphLifecycleState;
  executionUpdates: number;
  rollbacks: number;
};

type AutoExecutionClient = {
  client: FleetGraphQueryClient;
  state: AutoExecutionClientState;
};

function createAutoExecutionClient(lifecycleState: FleetGraphLifecycleState): AutoExecutionClient {
  const state: AutoExecutionClientState = {
    lifecycleState,
    executionUpdates: 0,
    rollbacks: 0,
  };
  const client: FleetGraphQueryClient = {
    query: async <T extends QueryResultRow>(
      queryText: string,
      values: unknown[]
    ): Promise<QueryResult<T>> => {
      if (queryText === 'BEGIN' || queryText === 'COMMIT') {
        return typedQueryResult<T>([]);
      }

      if (queryText === 'ROLLBACK') {
        state.rollbacks += 1;

        return typedQueryResult<T>([]);
      }

      if (queryText.startsWith('SELECT f.lifecycle_state')) {
        if (
          values[0] === findingId
          && values[1] === workspaceId
          && values[2] === targetDocumentId
          && values[3] === targetDocumentId
        ) {
          return typedQueryResult<T>([{ lifecycle_state: state.lifecycleState }]);
        }

        return typedQueryResult<T>([]);
      }

      if (queryText.startsWith('UPDATE fleetgraph_findings')) {
        if (
          values[0] === findingId
          && values[1] === workspaceId
          && values[2] === targetDocumentId
          && values[3] === state.lifecycleState
        ) {
          state.lifecycleState = 'executed';
          state.executionUpdates += 1;

          return typedQueryResult<T>([{ lifecycle_state: state.lifecycleState }]);
        }

        return typedQueryResult<T>([]);
      }

      throw new Error(`Unexpected FleetGraph execution query: ${queryText}`);
    },
  };

  return {
    client,
    state,
  };
}

function typedQueryResult<T extends QueryResultRow>(rows: QueryResultRow[]): QueryResult<T> {
  return queryResult(rows) as QueryResult<T>;
}

function queryResult(rows: QueryResultRow[]): QueryResult<QueryResultRow> {
  return {
    command: '',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

function createExecutionFinding(
  expectedLifecycleState: FleetGraphLifecycleState
): FleetGraphActionExecutionFinding {
  return {
    id: findingId,
    workspaceId,
    scopedDocumentId: targetDocumentId,
    expectedLifecycleState,
  };
}

function createExecutionActionCandidate(
  approvalLevel: FleetGraphApprovalLevel,
  actionKind: FleetGraphActionKind,
  actionTargetDocumentId: string
): ActionCandidate {
  return {
    targetDocumentId: actionTargetDocumentId,
    ownerUserId,
    roleReason: 'Week owner is responsible for resolving at-risk Week blockers.',
    urgency: 'high',
    evidence: [{
      sourceType: 'issue',
      sourceDocumentId: actionTargetDocumentId,
      quote: 'Launch approval blocked',
      observedAt: '2026-05-26T05:00:00.000Z',
    }],
    recommendedAction: {
      kind: actionKind,
      title: 'Review Week risk',
      body: 'Review the blocked launch approval before standup.',
    },
    approvalLevel,
    reversibility: 'reversible',
  };
}
