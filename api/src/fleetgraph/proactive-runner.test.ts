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
  AtRiskWeekGraphState,
  AtRiskWeekStructuredReasoner,
  AtRiskWeekTraceRunner,
} from './detectors/at-risk-week.js';
import type {
  FleetGraphGraphDependencies,
  FleetGraphGraphInput,
} from './graph.js';

describe('FleetGraph proactive at-risk Week runner', () => {
  it('enters the unified FleetGraph graph with at-risk Week dependencies for the requested scope', async () => {
    const config: FleetGraphConfig = {
      openaiApiKey: 'sk-test-openai',
      langfusePublicKey: 'pk-lf-test',
      langfuseSecretKey: 'sk-lf-test',
      langfuseBaseUrl: 'https://cloud.langfuse.com',
      langfuseTracingEnvironment: 'test',
      langfuseRelease: 'fleetgraph-test',
    };
    const client = createQueryClient();
    const reasoner: AtRiskWeekStructuredReasoner = {
      modelName: 'gpt-4o-mini',
      invoke: vi.fn(),
    };
    const traceRunner: AtRiskWeekTraceRunner = vi.fn(async (_definition, state, operation) => operation(state));
    const checkpointer = {} as BaseCheckpointSaver;
    const runFleetGraph = vi.fn<
      (input: FleetGraphGraphInput, dependencies: FleetGraphGraphDependencies) => Promise<void>
    >()
      .mockResolvedValue(undefined);
    const runAtRiskWeekGraph = vi.fn<
      (input: AtRiskWeekGraphInput, dependencies: AtRiskWeekGraphDependencies) => Promise<AtRiskWeekGraphState>
    >();
    const buildWeekContext = vi.fn();
    const shouldRunDetector = vi.fn();
    const broadcastToUser = vi.fn();
    const sleep = vi.fn(async () => undefined);

    const runner = createAtRiskWeekScopeRunner({
      loadConfig: () => config,
      runFleetGraph,
      runAtRiskWeekGraph,
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

    expect(runFleetGraph).toHaveBeenCalledTimes(1);
    expect(runFleetGraph).toHaveBeenCalledWith(
      {
        mode: 'proactive_at_risk_week',
        atRiskWeek: {
          input: {
            workspaceId: '11111111-1111-4111-8111-111111111111',
            scopedDocId: '22222222-2222-4222-8222-222222222222',
            runId: '33333333-3333-4333-8333-333333333333',
            triggerSource: 'mutation',
            requestedAt: '2026-05-26T05:00:00.000Z',
          },
        },
      },
      {
        proactiveAtRiskWeek: {
          runGraph: runAtRiskWeekGraph,
          dependencies: expect.objectContaining({
            checkpointer,
          }),
        },
      }
    );

    const dependencies = runFleetGraph.mock.calls[0]![1].proactiveAtRiskWeek!.dependencies;
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
