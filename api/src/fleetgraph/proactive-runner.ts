import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { loadFleetGraphConfig, type FleetGraphConfig } from './config.js';
import { buildWeekContext } from './context.js';
import {
  createAtRiskWeekCheckpointer,
  createInstrumentedAtRiskWeekTraceRunner,
  createLangfuseAtRiskWeekTraceRunner,
  createOpenAIAtRiskWeekReasoner,
  runAtRiskWeekGraph,
  type AtRiskWeekGraphDependencies,
  type AtRiskWeekGraphInput,
  type AtRiskWeekGraphState,
  type AtRiskWeekNodeDependencies,
  type AtRiskWeekOutputNodeDependencies,
  type AtRiskWeekReasonNodeDependencies,
  type AtRiskWeekStructuredReasoner,
  type AtRiskWeekTraceClock,
  type AtRiskWeekTraceRunner,
} from './detectors/at-risk-week.js';
import {
  createPostgresAtRiskWeekOutputRepository,
  type AtRiskWeekOutputRepository,
} from './detectors/at-risk-week-output-repository.js';
import { createAtRiskWeekUsageRecord } from './detectors/at-risk-week-usage.js';
import {
  createPostgresAtRiskWeekUsageRepository,
  type AtRiskWeekUsageRepository,
} from './detectors/at-risk-week-usage-repository.js';
import {
  runFleetGraphGraph,
  type FleetGraphGraphDependencies,
  type FleetGraphGraphInput,
} from './graph.js';
import { shouldRunDetector } from './guards.js';
import type {
  FleetGraphTriggerLogger,
  ProactiveScopeRunner,
} from './triggers.js';

export const atRiskWeekReasonerMaxAttempts = 2;
export const atRiskWeekReasonerRetryDelayMs = 1_000;

export type AtRiskWeekScopeRunnerOptions = {
  loadConfig: () => FleetGraphConfig;
  runFleetGraph: (input: FleetGraphGraphInput, dependencies: FleetGraphGraphDependencies) => Promise<unknown>;
  runAtRiskWeekGraph: (
    input: AtRiskWeekGraphInput,
    dependencies: AtRiskWeekGraphDependencies
  ) => Promise<AtRiskWeekGraphState>;
  buildWeekContext: AtRiskWeekNodeDependencies['buildWeekContext'];
  shouldRunDetector: AtRiskWeekNodeDependencies['shouldRunDetector'];
  createReasoner: (config: FleetGraphConfig) => AtRiskWeekStructuredReasoner;
  createTraceRunner: (config: FleetGraphConfig) => AtRiskWeekTraceRunner;
  createCheckpointer: () => BaseCheckpointSaver;
  createOutputRepository: (client: AtRiskWeekNodeDependencies['client']) => AtRiskWeekOutputRepository;
  createUsageRepository: (client: AtRiskWeekNodeDependencies['client']) => AtRiskWeekUsageRepository;
  broadcastToUser: AtRiskWeekOutputNodeDependencies['broadcastToUser'];
  randomUUID: () => string;
  now: () => string;
  traceClock: AtRiskWeekTraceClock;
  sleep: AtRiskWeekReasonNodeDependencies['retryPolicy']['sleep'];
  logger: AtRiskWeekReasonNodeDependencies['logger'];
};

export function createAtRiskWeekScopeRunner(options: AtRiskWeekScopeRunnerOptions): ProactiveScopeRunner {
  let sharedDependencies: Pick<
    AtRiskWeekGraphDependencies,
    'reasonNodeDependencies' | 'traceRunner' | 'checkpointer'
  > | null = null;

  function getSharedDependencies(): Pick<
    AtRiskWeekGraphDependencies,
    'reasonNodeDependencies' | 'traceRunner' | 'checkpointer'
  > {
    if (sharedDependencies === null) {
      const config = options.loadConfig();
      sharedDependencies = {
        reasonNodeDependencies: {
          reasoner: options.createReasoner(config),
          retryPolicy: {
            maxAttempts: atRiskWeekReasonerMaxAttempts,
            delayMs: atRiskWeekReasonerRetryDelayMs,
            sleep: options.sleep,
          },
          logger: options.logger,
          now: options.now,
        },
        traceRunner: createInstrumentedAtRiskWeekTraceRunner(
          options.createTraceRunner(config),
          options.traceClock
        ),
        checkpointer: options.createCheckpointer(),
      };
    }

    return sharedDependencies;
  }

  return async (input) => {
    const shared = getSharedDependencies();
    const usageRepository = options.createUsageRepository(input.client);
    const atRiskWeekInput: AtRiskWeekGraphInput = {
      workspaceId: input.workspaceId,
      scopedDocId: input.scopedDocId,
      runId: options.randomUUID(),
      triggerSource: input.triggerSource,
      requestedAt: options.now(),
    };
    const runAtRiskWeekGraphAndRecordUsage = async (
      graphInput: AtRiskWeekGraphInput,
      graphDependencies: AtRiskWeekGraphDependencies
    ): Promise<AtRiskWeekGraphState> => {
      const graphState = await options.runAtRiskWeekGraph(graphInput, graphDependencies);
      await usageRepository.persistUsage(createAtRiskWeekUsageRecord(graphState));

      return graphState;
    };

    await options.runFleetGraph({
      mode: 'proactive_at_risk_week',
      atRiskWeek: {
        input: atRiskWeekInput,
      },
    }, {
      proactiveAtRiskWeek: {
        runGraph: runAtRiskWeekGraphAndRecordUsage,
        dependencies: {
          nodeDependencies: {
            client: input.client,
            buildWeekContext: options.buildWeekContext,
            shouldRunDetector: options.shouldRunDetector,
            now: options.now,
          },
          reasonNodeDependencies: shared.reasonNodeDependencies,
          outputNodeDependencies: {
            outputRepository: options.createOutputRepository(input.client),
            broadcastToUser: options.broadcastToUser,
            now: options.now,
          },
          traceRunner: shared.traceRunner,
          checkpointer: shared.checkpointer,
        },
      },
    });
  };
}

export function createProductionAtRiskWeekScopeRunner(
  logger: FleetGraphTriggerLogger,
  productionBroadcastToUser: AtRiskWeekOutputNodeDependencies['broadcastToUser']
): ProactiveScopeRunner {
  return createAtRiskWeekScopeRunner({
    loadConfig: loadFleetGraphConfig,
    runFleetGraph: runFleetGraphGraph,
    runAtRiskWeekGraph,
    buildWeekContext,
    shouldRunDetector,
    createReasoner: createOpenAIAtRiskWeekReasoner,
    createTraceRunner: createLangfuseAtRiskWeekTraceRunner,
    createCheckpointer: createAtRiskWeekCheckpointer,
    createOutputRepository: createPostgresAtRiskWeekOutputRepository,
    createUsageRepository: createPostgresAtRiskWeekUsageRepository,
    broadcastToUser: productionBroadcastToUser,
    randomUUID,
    now: createIsoTimestamp,
    traceClock: createSystemTraceClock(),
    sleep,
    logger,
  });
}

function createIsoTimestamp(): string {
  return new Date().toISOString();
}

function createSystemTraceClock(): AtRiskWeekTraceClock {
  return {
    now: () => ({
      iso: createIsoTimestamp(),
      monotonicMs: performance.now(),
    }),
  };
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
