import { describe, expect, it, vi } from 'vitest';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { QueryResult, QueryResultRow } from 'pg';
import type { FleetGraphConfig } from './config.js';
import type { FleetGraphQueryClient } from './context.js';
import {
  atRiskWeekReasonerMaxAttempts,
  atRiskWeekReasonerRetryDelayMs,
  createAtRiskWeekScopeRunner,
} from './proactive-runner.js';
import type {
  AtRiskWeekGraphDependencies,
  AtRiskWeekGraphInput,
  AtRiskWeekStructuredReasoner,
  AtRiskWeekTraceRunner,
} from './detectors/at-risk-week.js';

describe('FleetGraph proactive at-risk Week runner', () => {
  it('invokes the at-risk Week graph with production dependencies for the requested scope', async () => {
    const config: FleetGraphConfig = {
      openaiApiKey: 'sk-test-openai',
      langchainApiKey: 'lsv2-test-langsmith',
      langchainTracingV2: true,
      langchainProject: 'ship-fleetgraph-test',
    };
    const client = createQueryClient();
    const reasoner: AtRiskWeekStructuredReasoner = {
      modelName: 'gpt-4o-mini',
      invoke: vi.fn(),
    };
    const traceRunner: AtRiskWeekTraceRunner = vi.fn(async (_definition, state, operation) => operation(state));
    const checkpointer = {} as BaseCheckpointSaver;
    const runGraph = vi.fn<(input: AtRiskWeekGraphInput, dependencies: AtRiskWeekGraphDependencies) => Promise<void>>()
      .mockResolvedValue(undefined);
    const buildWeekContext = vi.fn();
    const shouldRunDetector = vi.fn();
    const broadcastToUser = vi.fn();
    const sleep = vi.fn(async () => undefined);

    const runner = createAtRiskWeekScopeRunner({
      loadConfig: () => config,
      runGraph,
      buildWeekContext,
      shouldRunDetector,
      createReasoner: vi.fn(() => reasoner),
      createTraceRunner: vi.fn(() => traceRunner),
      createCheckpointer: vi.fn(() => checkpointer),
      broadcastToUser,
      randomUUID: () => '33333333-3333-4333-8333-333333333333',
      now: () => '2026-05-26T05:00:00.000Z',
      traceClock: {
        now: () => ({
          iso: '2026-05-26T05:00:00.000Z',
          monotonicMs: 100,
        }),
      },
      sleep,
      logger: {
        warn: vi.fn(),
      },
    });

    await runner({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      scopedDocId: '22222222-2222-4222-8222-222222222222',
      triggerSource: 'mutation',
      client,
    });

    expect(runGraph).toHaveBeenCalledTimes(1);
    expect(runGraph).toHaveBeenCalledWith(
      {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        scopedDocId: '22222222-2222-4222-8222-222222222222',
        runId: '33333333-3333-4333-8333-333333333333',
        triggerSource: 'mutation',
        requestedAt: '2026-05-26T05:00:00.000Z',
      },
      expect.objectContaining({
        checkpointer,
      })
    );

    const dependencies = runGraph.mock.calls[0]![1];
    expect(dependencies.nodeDependencies).toMatchObject({
      client,
      buildWeekContext,
      shouldRunDetector,
    });
    expect(dependencies.reasonNodeDependencies).toMatchObject({
      reasoner,
      retryPolicy: {
        maxAttempts: atRiskWeekReasonerMaxAttempts,
        delayMs: atRiskWeekReasonerRetryDelayMs,
        sleep,
      },
    });
    expect(dependencies.outputNodeDependencies).toMatchObject({
      client,
      broadcastToUser,
    });
    expect(dependencies.traceRunner).toEqual(expect.any(Function));
  });
});

function createQueryClient(): FleetGraphQueryClient {
  return {
    query: async <T extends QueryResultRow>(
      _queryText: string,
      _values: unknown[]
    ): Promise<QueryResult<T>> => ({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    }),
  };
}
