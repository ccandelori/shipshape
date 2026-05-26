import { describe, expect, it } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import {
  atRiskWeekGraphInputSchema,
  atRiskWeekNodeContracts,
  atRiskWeekNodeNames,
  atRiskWeekReasoningOutputSchema,
  createAtRiskWeekCheckpointConfig,
  createAtRiskWeekCheckpointer,
  createAtRiskWeekInitialState,
  recordAtRiskWeekEarlyExit,
  type AtRiskWeekGraphInput,
  type AtRiskWeekReasoningOutput,
} from './at-risk-week.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const scopedDocId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const requestedAt = '2026-05-26T05:00:00.000Z';

const graphInput: AtRiskWeekGraphInput = {
  workspaceId,
  scopedDocId,
  runId,
  triggerSource: 'poll',
  requestedAt,
};

describe('FleetGraph at-risk Week detector contracts', () => {
  it('builds a valid initial graph state with deterministic checkpoint identity', () => {
    const state = createAtRiskWeekInitialState(graphInput);

    expect(atRiskWeekGraphInputSchema.parse(graphInput)).toEqual(graphInput);
    expect(state.status).toBe('running');
    expect(state.activeNode).toBe('scope');
    expect(state.completedNodes).toEqual([]);
    expect(state.scope).toEqual({
      workspaceId,
      scopedDocId,
      runId,
      detectorType: 'at_risk_week',
      materialChangeKey: null,
      checkpointThreadId: `fleetgraph:at_risk_week:${workspaceId}:${scopedDocId}:${runId}`,
      checkpointNamespace: `fleetgraph:at_risk_week:${workspaceId}:${scopedDocId}`,
    });
    expect(state.trace).toMatchObject({
      detector: 'at_risk_week',
      triggerSource: 'poll',
      workspaceId,
      scopedDocId,
      runId,
      materialChangeKey: null,
      branchDecisions: [],
    });
  });

  it('creates LangGraph checkpoint config from state keys and trace metadata', () => {
    const state = createAtRiskWeekInitialState(graphInput);

    expect(createAtRiskWeekCheckpointConfig(state)).toEqual({
      configurable: {
        thread_id: `fleetgraph:at_risk_week:${workspaceId}:${scopedDocId}:${runId}`,
        checkpoint_ns: `fleetgraph:at_risk_week:${workspaceId}:${scopedDocId}`,
      },
      metadata: {
        detector: 'at_risk_week',
        triggerSource: 'poll',
        workspaceId,
        scopedDocId,
        runId,
        materialChangeKey: null,
      },
    });
    expect(createAtRiskWeekCheckpointer()).toBeInstanceOf(MemorySaver);
  });

  it('records early exits as immutable terminal state transitions', () => {
    const state = createAtRiskWeekInitialState(graphInput);
    const exitedState = recordAtRiskWeekEarlyExit(
      state,
      {
        node: 'preFilter',
        reason: 'pre_filter_safe',
        message: 'No blockers or high-priority blocked issues were present.',
        materialChangeKey: 'v1:abc123',
      },
      '2026-05-26T05:01:00.000Z'
    );

    expect(exitedState).not.toBe(state);
    expect(state.status).toBe('running');
    expect(state.completedNodes).toEqual([]);
    expect(exitedState.status).toBe('exited');
    expect(exitedState.activeNode).toBe(null);
    expect(exitedState.completedNodes).toEqual(['preFilter']);
    expect(exitedState.earlyExit).toEqual({
      node: 'preFilter',
      reason: 'pre_filter_safe',
      message: 'No blockers or high-priority blocked issues were present.',
      materialChangeKey: 'v1:abc123',
    });
    expect(exitedState.trace.materialChangeKey).toBe('v1:abc123');
    expect(exitedState.trace.branchDecisions).toEqual([{
      node: 'preFilter',
      decision: 'pre_filter_safe',
      reason: 'No blockers or high-priority blocked issues were present.',
    }]);
    expect(exitedState.completedAt).toBe('2026-05-26T05:01:00.000Z');
  });

  it('documents node contracts in execution order', () => {
    expect(atRiskWeekNodeNames).toEqual([
      'scope',
      'context',
      'guard',
      'preFilter',
      'reason',
      'policy',
      'output',
    ]);
    expect(atRiskWeekNodeContracts.map((contract) => contract.name)).toEqual(atRiskWeekNodeNames);
    expect(atRiskWeekNodeContracts.find((contract) => contract.name === 'reason')).toMatchObject({
      requires: ['preFilter.shouldReason'],
      writes: ['reasoning', 'trace.modelUsage'],
    });
    expect(atRiskWeekNodeContracts.find((contract) => contract.name === 'output')).toMatchObject({
      requires: ['policy'],
      writes: ['persistence', 'status'],
    });
  });

  it('validates structured model reasoning for at-risk and quiet paths', () => {
    const atRiskOutput: AtRiskWeekReasoningOutput = {
      isAtRisk: true,
      severity: 'high',
      evidence: [{
        sourceType: 'issue',
        sourceDocumentId: scopedDocId,
        quote: 'The launch blocker is still waiting on external review.',
        observedAt: '2026-05-26T05:00:00.000Z',
      }],
      recommendedAction: {
        kind: 'draft_comment',
        title: 'Ask for blocker update',
        body: 'Please post the current blocker owner and next step before standup.',
      },
      rationale: 'A high-priority blocked issue has not moved and no owner update exists.',
    };

    expect(atRiskWeekReasoningOutputSchema.parse(atRiskOutput)).toEqual(atRiskOutput);
    expect(atRiskWeekReasoningOutputSchema.parse({
      isAtRisk: false,
      severity: null,
      evidence: [],
      recommendedAction: null,
      rationale: 'No active blockers or stalled high-priority work were present.',
    })).toEqual({
      isAtRisk: false,
      severity: null,
      evidence: [],
      recommendedAction: null,
      rationale: 'No active blockers or stalled high-priority work were present.',
    });
    expect(atRiskWeekReasoningOutputSchema.safeParse({
      isAtRisk: false,
      severity: 'low',
      evidence: [],
      recommendedAction: null,
      rationale: 'Looks fine.',
    }).success).toBe(false);
  });
});
