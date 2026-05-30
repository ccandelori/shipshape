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
  AtRiskWeekTraceRunner,
  AtRiskWeekStructuredReasoner,
} from './detectors/at-risk-week.js';
import { createAtRiskWeekInitialState } from './detectors/at-risk-week.js';
import type { AtRiskWeekOutputRepository } from './detectors/at-risk-week-output-repository.js';
import type { AtRiskWeekUsageRepository } from './detectors/at-risk-week-usage-repository.js';
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
      langfuseProjectId: 'project-test',
      langfuseTracingEnvironment: 'test',
      langfuseRelease: 'fleetgraph-test',
      publicTraceExportEnabled: false,
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
    >(async (input, dependencies) => {
      if (input.mode !== 'proactive_at_risk_week') {
        throw new Error(`Unexpected FleetGraph mode: ${input.mode}`);
      }

      const proactive = dependencies.proactiveAtRiskWeek;

      if (proactive === undefined) {
        throw new Error('Expected proactive at-risk Week dependencies');
      }

      await proactive.runGraph(input.atRiskWeek.input, proactive.dependencies);
    });
    const runAtRiskWeekGraph = vi.fn<
      (input: AtRiskWeekGraphInput, dependencies: AtRiskWeekGraphDependencies) => Promise<AtRiskWeekGraphState>
    >(async (input) => ({
      ...createAtRiskWeekInitialState(input),
      status: 'exited',
      activeNode: null,
      completedNodes: ['scope', 'context', 'guard'],
      earlyExit: {
        node: 'guard',
        reason: 'guard_suppressed',
        message: 'Test guard exit.',
        materialChangeKey: null,
      },
    }));
    const buildWeekContext = vi.fn();
    const shouldRunDetector = vi.fn();
    const broadcastToUser = vi.fn();
    const sleep = vi.fn(async () => undefined);
    const outputRepository: AtRiskWeekOutputRepository = {
      persistOutput: vi.fn(),
    };
    const usageRepository: AtRiskWeekUsageRepository = {
      persistUsage: vi.fn(),
    };
    const createOutputRepository = vi.fn(() => outputRepository);
    const createUsageRepository = vi.fn(() => usageRepository);

    const runner = createAtRiskWeekScopeRunner({
      loadConfig: () => config,
      runFleetGraph,
      runAtRiskWeekGraph,
      buildWeekContext,
      shouldRunDetector,
      createReasoner: vi.fn(() => reasoner),
      createTraceRunner: vi.fn(() => traceRunner),
      createCheckpointer: vi.fn(() => checkpointer),
      createOutputRepository,
      createUsageRepository,
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
          runGraph: expect.any(Function),
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
      outputRepository,
      broadcastToUser,
    });
    expect('usageRepository' in dependencies).toBe(false);
    expect(createOutputRepository).toHaveBeenCalledWith(client);
    expect(createUsageRepository).toHaveBeenCalledWith(client);
    expect(runAtRiskWeekGraph).toHaveBeenCalledTimes(1);
    expect(usageRepository.persistUsage).toHaveBeenCalledWith(expect.objectContaining({
      runId: '33333333-3333-4333-8333-333333333333',
      workspaceId: '11111111-1111-4111-8111-111111111111',
      trigger: 'proactive',
      detector: 'at_risk_week',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
    }));
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
