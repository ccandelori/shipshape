import { describe, expect, it, vi } from 'vitest';
import {
  createFleetGraphChatTraceContext,
  type FleetGraphChatModel,
  type FleetGraphChatModelMessage,
} from './chat.js';
import type {
  AtRiskWeekGraphDependencies,
  AtRiskWeekGraphInput,
  AtRiskWeekGraphState,
} from './detectors/at-risk-week.js';
import {
  fleetGraphGraphName,
  runFleetGraphGraph,
} from './graph.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const scopedDocId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

describe('FleetGraph unified runtime graph', () => {
  it('routes proactive at-risk Week mode through the compiled FleetGraph graph', async () => {
    const atRiskWeekInput: AtRiskWeekGraphInput = {
      workspaceId,
      scopedDocId,
      runId,
      triggerSource: 'mutation',
      requestedAt: '2026-05-26T05:00:00.000Z',
    };
    const atRiskWeekState = createCompletedAtRiskWeekState(atRiskWeekInput);
    const atRiskWeekDependencies = {} as AtRiskWeekGraphDependencies;
    const runAtRiskWeekGraph = vi.fn<
      (input: AtRiskWeekGraphInput, dependencies: AtRiskWeekGraphDependencies) => Promise<AtRiskWeekGraphState>
    >().mockResolvedValue(atRiskWeekState);

    const graphState = await runFleetGraphGraph({
      mode: 'proactive_at_risk_week',
      atRiskWeek: {
        input: atRiskWeekInput,
      },
    }, {
      proactiveAtRiskWeek: {
        runGraph: runAtRiskWeekGraph,
        dependencies: atRiskWeekDependencies,
      },
    });

    expect(graphState.graphName).toBe(fleetGraphGraphName);
    expect(graphState.status).toBe('completed');
    expect(graphState.branch).toBe('proactive_at_risk_week');
    expect(graphState.completedNodes).toEqual(['branch', 'proactive_at_risk_week']);
    expect(graphState.proactiveAtRiskWeek).toBe(atRiskWeekState);
    expect(runAtRiskWeekGraph).toHaveBeenCalledTimes(1);
    expect(runAtRiskWeekGraph).toHaveBeenCalledWith(atRiskWeekInput, atRiskWeekDependencies);
  });

  it('routes on-demand chat streaming through the compiled FleetGraph graph', async () => {
    const abortController = new AbortController();
    const observedTokens: string[] = [];
    const messages: FleetGraphChatModelMessage[] = [
      { role: 'system', content: 'You are FleetGraph.' },
      { role: 'user', content: 'What is blocking this week?' },
    ];
    const model = createStreamingChatModel();
    const traceContext = createFleetGraphChatTraceContext({
      userId,
      workspaceId,
      scope: {
        workspaceId,
        documentId: scopedDocId,
        documentType: 'sprint',
        title: 'Week 14',
      },
      request: {
        documentId: scopedDocId,
        documentType: 'sprint',
        question: 'What is blocking this week?',
        conversationHistory: [],
      },
    });

    const graphState = await runFleetGraphGraph({
      mode: 'ondemand_chat',
      chat: {
        model,
        messages,
        abortSignal: abortController.signal,
        traceContext,
        onToken: async (token) => {
          observedTokens.push(token);
        },
      },
    }, {});

    expect(graphState.graphName).toBe(fleetGraphGraphName);
    expect(graphState.status).toBe('completed');
    expect(graphState.branch).toBe('ondemand_chat');
    expect(graphState.completedNodes).toEqual(['branch', 'ondemand_chat']);
    expect(observedTokens).toEqual(['The ', 'answer']);
    expect(graphState.chat?.completion).toEqual({
      response: 'The answer',
      usage: {
        modelName: 'test-chat-model',
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
      },
    });
  });
});

function createStreamingChatModel(): FleetGraphChatModel {
  return {
    modelName: 'test-chat-model',
    stream: async function* () {
      yield { token: 'The ', usage: null };
      yield { token: 'answer', usage: null };
      yield {
        token: '',
        usage: {
          modelName: 'test-chat-model',
          inputTokens: 12,
          outputTokens: 4,
          totalTokens: 16,
        },
      };
    },
  };
}

function createCompletedAtRiskWeekState(input: AtRiskWeekGraphInput): AtRiskWeekGraphState {
  return {
    input,
    status: 'completed',
    activeNode: null,
    completedNodes: ['scope', 'context', 'guard', 'preFilter'],
    scope: {
      workspaceId: input.workspaceId,
      scopedDocId: input.scopedDocId,
      runId: input.runId,
      detectorType: 'at_risk_week',
      materialChangeKey: 'test-material-change',
      checkpointThreadId: `fleetgraph:at_risk_week:${input.workspaceId}:${input.scopedDocId}:${input.runId}`,
      checkpointNamespace: `fleetgraph:at_risk_week:${input.workspaceId}:${input.scopedDocId}`,
    },
    context: null,
    guard: null,
    preFilter: null,
    reasoning: null,
    policy: null,
    persistence: null,
    earlyExit: {
      node: 'preFilter',
      reason: 'pre_filter_safe',
      message: 'No current risk signals.',
      materialChangeKey: 'test-material-change',
    },
    errors: [],
    trace: {
      detector: 'at_risk_week',
      triggerSource: input.triggerSource,
      workspaceId: input.workspaceId,
      scopedDocId: input.scopedDocId,
      runId: input.runId,
      materialChangeKey: 'test-material-change',
      langfuseTraceId: null,
      langfuseTraceUrl: null,
      langfuseTracePublic: false,
      branchDecisions: [],
      modelUsage: null,
      timings: [],
    },
    requestedAt: input.requestedAt,
    completedAt: '2026-05-26T05:00:45.000Z',
  };
}
