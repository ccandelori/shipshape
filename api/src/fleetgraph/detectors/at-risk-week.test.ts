import { describe, expect, it, vi } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import type { QueryResult, QueryResultRow } from 'pg';
import type { WeekContext } from '../context.js';
import {
  atRiskWeekGraphInputSchema,
  atRiskWeekNodeContracts,
  atRiskWeekNodeNames,
  atRiskWeekReasoningOutputSchema,
  contextNode,
  createAtRiskWeekCheckpointConfig,
  createAtRiskWeekCheckpointer,
  createAtRiskWeekInitialState,
  guardNode,
  preFilterNode,
  recordAtRiskWeekEarlyExit,
  scopeNode,
  type AtRiskWeekNodeDependencies,
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

  it('exits deterministically when scope resolution cannot find an active Week', async () => {
    const state = createAtRiskWeekInitialState(graphInput);
    const dependencies = createNodeDependencies({
      scopeRows: [],
      weekContext: createWeekContext({ issues: [] }),
      guardDecision: {
        shouldRun: true,
        reason: 'run_material_changed_no_suppression:v1:key',
        materialChangeKey: 'v1:key',
      },
    });

    const nextState = await scopeNode(state, dependencies);

    expect(nextState.status).toBe('exited');
    expect(nextState.activeNode).toBe(null);
    expect(nextState.completedNodes).toEqual(['scope']);
    expect(nextState.earlyExit).toEqual({
      node: 'scope',
      reason: 'scope_not_found',
      message: `Active Week scope not found: workspaceId=${workspaceId}, scopedDocId=${scopedDocId}`,
      materialChangeKey: null,
    });
    expect(dependencies.client.query).toHaveBeenCalledWith(
      expect.stringContaining("d.document_type = 'sprint'"),
      [workspaceId, scopedDocId]
    );
  });

  it('builds Week context after scope resolution without mutating previous state', async () => {
    const state = createAtRiskWeekInitialState(graphInput);
    const weekContext = createWeekContext({ issues: [] });
    const dependencies = createNodeDependencies({
      scopeRows: [{ id: scopedDocId }],
      weekContext,
      guardDecision: {
        shouldRun: true,
        reason: 'run_material_changed_no_suppression:v1:key',
        materialChangeKey: 'v1:key',
      },
    });

    const scopedState = await scopeNode(state, dependencies);
    const contextState = await contextNode(scopedState, dependencies);

    expect(scopedState.context).toBe(null);
    expect(contextState.context).toBe(weekContext);
    expect(contextState.completedNodes).toEqual(['scope', 'context']);
    expect(contextState.activeNode).toBe('guard');
    expect(dependencies.buildWeekContext).toHaveBeenCalledWith(dependencies.client, workspaceId, scopedDocId);
  });

  it('exits at guard when suppression says the material state should not run', async () => {
    const state = createAtRiskWeekInitialState(graphInput);
    const weekContext = createWeekContext({ issues: [] });
    const dependencies = createNodeDependencies({
      scopeRows: [{ id: scopedDocId }],
      weekContext,
      guardDecision: {
        shouldRun: false,
        reason: 'suppressed_open_finding:finding-1:v1:key',
        materialChangeKey: 'v1:key',
      },
    });

    const contextState = await contextNode(await scopeNode(state, dependencies), dependencies);
    const guardedState = await guardNode(contextState, dependencies);

    expect(guardedState.status).toBe('exited');
    expect(guardedState.scope.materialChangeKey).toBe('v1:key');
    expect(guardedState.trace.materialChangeKey).toBe('v1:key');
    expect(guardedState.earlyExit).toEqual({
      node: 'guard',
      reason: 'guard_suppressed',
      message: 'suppressed_open_finding:finding-1:v1:key',
      materialChangeKey: 'v1:key',
    });
    expect(dependencies.shouldRunDetector).toHaveBeenCalledWith(
      dependencies.client,
      workspaceId,
      scopedDocId,
      weekContext
    );
  });

  it('exits at preFilter for clearly safe Week contexts without requiring model reasoning', async () => {
    const state = createAtRiskWeekInitialState(graphInput);
    const dependencies = createNodeDependencies({
      scopeRows: [{ id: scopedDocId }],
      weekContext: createWeekContext({ issues: [] }),
      guardDecision: {
        shouldRun: true,
        reason: 'run_material_changed_no_suppression:v1:safe',
        materialChangeKey: 'v1:safe',
      },
    });

    const guardedState = await guardNode(
      await contextNode(await scopeNode(state, dependencies), dependencies),
      dependencies
    );
    const preFilteredState = await preFilterNode(guardedState, dependencies);

    expect(preFilteredState.status).toBe('exited');
    expect(preFilteredState.preFilter).toEqual({
      shouldReason: false,
      reason: 'no_blockers_or_blocked_high_priority_issues',
      evidenceSummary: [],
    });
    expect(preFilteredState.earlyExit).toMatchObject({
      node: 'preFilter',
      reason: 'pre_filter_safe',
      materialChangeKey: 'v1:safe',
    });
  });

  it('passes through preFilter when blockers or blocked high-priority issues are present', async () => {
    const state = createAtRiskWeekInitialState(graphInput);
    const dependencies = createNodeDependencies({
      scopeRows: [{ id: scopedDocId }],
      weekContext: createWeekContext({
        issues: [{
          id: '44444444-4444-4444-8444-444444444444',
          title: 'Launch approval blocked',
          state: 'blocked',
          priority: 'high',
        }],
        blockerText: 'Blocked waiting on security approval.',
      }),
      guardDecision: {
        shouldRun: true,
        reason: 'run_material_changed_no_suppression:v1:risky',
        materialChangeKey: 'v1:risky',
      },
    });

    const guardedState = await guardNode(
      await contextNode(await scopeNode(state, dependencies), dependencies),
      dependencies
    );
    const preFilteredState = await preFilterNode(guardedState, dependencies);

    expect(preFilteredState.status).toBe('running');
    expect(preFilteredState.activeNode).toBe('reason');
    expect(preFilteredState.preFilter).toEqual({
      shouldReason: true,
      reason: 'candidate_risk',
      evidenceSummary: [
        'High-priority blocked issue: Launch approval blocked',
        'Standup blocker: Blocked waiting on security approval.',
      ],
    });
    expect(preFilteredState.earlyExit).toBe(null);
  });
});

type ScopeRow = QueryResultRow & {
  id: string;
};

type IssueFixture = {
  id: string;
  title: string;
  state: string | null;
  priority: string | null;
};

type WeekContextFixture = {
  issues: IssueFixture[];
  blockerText?: string;
};

type NodeDependencyFixture = {
  scopeRows: ScopeRow[];
  weekContext: WeekContext;
  guardDecision: {
    shouldRun: boolean;
    reason: string;
    materialChangeKey: string;
  };
};

function createNodeDependencies(fixture: NodeDependencyFixture): AtRiskWeekNodeDependencies {
  return {
    client: {
      query: vi.fn(async <T extends QueryResultRow>(
        _queryText: string,
        _values: unknown[]
      ): Promise<QueryResult<T>> => ({
        rows: fixture.scopeRows as unknown as T[],
        rowCount: fixture.scopeRows.length,
        command: '',
        oid: 0,
        fields: [],
      })),
    },
    buildWeekContext: vi.fn(async () => fixture.weekContext),
    shouldRunDetector: vi.fn(async () => fixture.guardDecision),
    now: () => '2026-05-26T05:01:00.000Z',
  } as AtRiskWeekNodeDependencies;
}

function createWeekContext(fixture: WeekContextFixture): WeekContext {
  return {
    week: {
      id: scopedDocId,
      workspaceId,
      documentType: 'sprint',
      title: 'Week 5',
      content: {},
      parentId: null,
      properties: {},
      ticketNumber: null,
      createdAt: new Date('2026-05-20T05:00:00.000Z'),
      updatedAt: new Date('2026-05-26T05:00:00.000Z'),
    },
    ownerUserId: null,
    projectId: null,
    programId: null,
    issues: fixture.issues.map((issue) => ({
      id: issue.id,
      workspaceId,
      documentType: 'issue',
      title: issue.title,
      content: {},
      parentId: null,
      properties: {
        state: issue.state,
        priority: issue.priority,
      },
      ticketNumber: null,
      createdAt: new Date('2026-05-20T05:00:00.000Z'),
      updatedAt: new Date('2026-05-26T05:00:00.000Z'),
      state: issue.state,
      priority: issue.priority,
      assigneeUserId: null,
    })),
    standups: fixture.blockerText
      ? [{
        id: '55555555-5555-4555-8555-555555555555',
        workspaceId,
        documentType: 'standup',
        title: 'Daily Standup',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: fixture.blockerText }] }],
        },
        parentId: scopedDocId,
        properties: {},
        ticketNumber: null,
        createdAt: new Date('2026-05-26T04:00:00.000Z'),
        updatedAt: new Date('2026-05-26T04:00:00.000Z'),
        authorUserId: null,
      }]
      : [],
    sprintIterations: [],
    accountability: {
      weeklyPlan: {
        exists: true,
        documentIds: ['66666666-6666-4666-8666-666666666666'],
      },
      weeklyRetro: {
        exists: false,
        documentIds: [],
      },
    },
  };
}
