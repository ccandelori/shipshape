import type { FleetGraphConfig } from '../config.js';
import {
  createDisabledFleetGraphPublicTracePolicy,
  createFleetGraphLangfusePropagatedAttributes,
  createFleetGraphPublicTracePolicy,
  fleetGraphLangfuseRuntime,
  publishFleetGraphTraceIfEnabled,
  type FleetGraphLangfuseRuntime,
  type FleetGraphPublicTracePolicy,
  type FleetGraphTracePublicationMetadata,
  type FleetGraphTracePublicationResult,
} from '../langfuse.js';
import {
  isoDateTimeSchema,
  type FleetGraphApprovalLevel,
  type FleetGraphLifecycleState,
  type FleetGraphReversibility,
} from '../types.js';
import {
  atRiskWeekDetectorType,
  atRiskWeekDetectorVersion,
  atRiskWeekLatencyTargetMs,
  atRiskWeekReasoningModelName,
  atRiskWeekReasoningModelTemperature,
} from './at-risk-week-constants.js';
import type {
  AtRiskWeekEarlyExitReason,
  AtRiskWeekGraphState,
  AtRiskWeekModelUsage,
  AtRiskWeekNodeName,
  AtRiskWeekPersistenceArtifacts,
  AtRiskWeekPreFilterDecision,
  AtRiskWeekRunStatus,
  AtRiskWeekTriggerSource,
} from './at-risk-week.js';

export type AtRiskWeekBranchDecision = {
  node: AtRiskWeekNodeName;
  decision: string;
  reason: string;
};

export type AtRiskWeekGuardDecision = 'quiet' | 'run';

export type AtRiskWeekBranchPath =
  | 'scope-exit'
  | 'guard-exit'
  | 'prefilter-exit'
  | 'model-reason'
  | 'policy'
  | 'output';

export type AtRiskWeekTraceNode = AtRiskWeekNodeName | 'run';

export type AtRiskWeekTraceTiming = {
  traceNode: AtRiskWeekTraceNode;
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type AtRiskWeekTraceInstant = {
  iso: string;
  monotonicMs: number;
};

export type AtRiskWeekTraceClock = {
  now: () => AtRiskWeekTraceInstant;
};

export type AtRiskWeekStateTrace = {
  detector: typeof atRiskWeekDetectorType;
  triggerSource: AtRiskWeekTriggerSource;
  workspaceId: string;
  scopedDocId: string;
  runId: string;
  materialChangeKey: string | null;
  langfuseTraceId: string | null;
  langfuseTraceUrl: string | null;
  langfuseTracePublic: boolean;
  branchDecisions: AtRiskWeekBranchDecision[];
  modelUsage: AtRiskWeekModelUsage | null;
  timings: AtRiskWeekTraceTiming[];
};

export type AtRiskWeekTraceMetadata = {
  detectorType: typeof atRiskWeekDetectorType;
  detectorVersion: typeof atRiskWeekDetectorVersion;
  trigger: AtRiskWeekTriggerSource;
  triggerSource: AtRiskWeekTriggerSource;
  workspaceId: string;
  scopedDocumentId: string;
  scopedDocumentType: 'sprint';
  weekId: string;
  runId: string;
  traceNode: AtRiskWeekTraceNode;
  runStatus: AtRiskWeekRunStatus;
  activeNode: AtRiskWeekNodeName | null;
  materialChangeKey: string | null;
  guardDecision: AtRiskWeekGuardDecision | null;
  branchPath: AtRiskWeekBranchPath | null;
  guardShouldRun: boolean | null;
  guardSuppressed: boolean | null;
  guardDecisionReason: string | null;
  preFilterShouldReason: boolean | null;
  preFilterDecisionReason: AtRiskWeekPreFilterDecision['reason'] | null;
  earlyExitNode: AtRiskWeekNodeName | null;
  earlyExitReason: AtRiskWeekEarlyExitReason | null;
  earlyExitMessage: string | null;
  branchDecisionCount: number;
  latestBranchNode: AtRiskWeekNodeName | null;
  latestBranchDecision: string | null;
  latestBranchReason: string | null;
  modelName: typeof atRiskWeekReasoningModelName;
  modelTemperature: typeof atRiskWeekReasoningModelTemperature;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
  lifecycleState: FleetGraphLifecycleState | null;
  approvalLevel: FleetGraphApprovalLevel | null;
  reversibility: FleetGraphReversibility | null;
  actionCandidatePresent: boolean | null;
  findingId: string | null;
  actionCandidateId: string | null;
  broadcastEvent: AtRiskWeekPersistenceArtifacts['broadcastEvent'];
  tracePublic: boolean;
  traceId: string | null;
  traceUrl: string | null;
  traceDurationMs: number | null;
  graphLatencyMs: number | null;
  latencyTargetMs: typeof atRiskWeekLatencyTargetMs;
  latencyTargetMet: boolean | null;
  completedAt: string | null;
};

export type AtRiskWeekTraceDefinition = {
  name: string;
  runType: 'chain';
  tags: string[];
  inputMetadata: AtRiskWeekTraceMetadata;
};

export type AtRiskWeekTraceOperation = (state: AtRiskWeekGraphState) => Promise<AtRiskWeekGraphState>;

export type AtRiskWeekTraceRunner = (
  definition: AtRiskWeekTraceDefinition,
  state: AtRiskWeekGraphState,
  operation: AtRiskWeekTraceOperation
) => Promise<AtRiskWeekGraphState>;

export class AtRiskWeekTraceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtRiskWeekTraceContractError';
  }
}

export const passthroughAtRiskWeekTraceRunner: AtRiskWeekTraceRunner = async (
  _definition,
  state,
  operation
) => operation(state);

export function createInstrumentedAtRiskWeekTraceRunner(
  baseRunner: AtRiskWeekTraceRunner,
  clock: AtRiskWeekTraceClock
): AtRiskWeekTraceRunner {
  return async (definition, state, operation) => {
    const startedAt = clock.now();

    return baseRunner(definition, state, async (currentState) => {
      const outputState = await operation(currentState);
      const completedAt = clock.now();

      return recordAtRiskWeekTraceTiming(outputState, {
        traceNode: definition.inputMetadata.traceNode,
        startedAt: startedAt.iso,
        completedAt: completedAt.iso,
        durationMs: calculateAtRiskWeekTraceDuration(startedAt, completedAt),
      });
    });
  };
}

export async function traceAtRiskWeekRun(
  state: AtRiskWeekGraphState,
  runner: AtRiskWeekTraceRunner,
  operation: AtRiskWeekTraceOperation
): Promise<AtRiskWeekGraphState> {
  return runner(createAtRiskWeekTraceDefinition(state, 'run'), state, operation);
}

export async function traceAtRiskWeekNode(
  state: AtRiskWeekGraphState,
  node: AtRiskWeekNodeName,
  runner: AtRiskWeekTraceRunner,
  operation: AtRiskWeekTraceOperation
): Promise<AtRiskWeekGraphState> {
  return runner(createAtRiskWeekTraceDefinition(state, node), state, operation);
}

export function createLangfuseAtRiskWeekTraceRunner(config: FleetGraphConfig): AtRiskWeekTraceRunner {
  return createLangfuseAtRiskWeekTraceRunnerWithRuntime(
    fleetGraphLangfuseRuntime,
    createFleetGraphPublicTracePolicy(config)
  );
}

export function createLangfuseAtRiskWeekTraceRunnerWithRuntime(
  runtime: FleetGraphLangfuseRuntime,
  publicTracePolicy: FleetGraphPublicTracePolicy = createDisabledFleetGraphPublicTracePolicy()
): AtRiskWeekTraceRunner {
  return async (definition, state, operation) => {
    if (shouldDeferAtRiskWeekLangfuseTrace(definition.inputMetadata)) {
      return runDeferredAtRiskWeekLangfuseTrace(runtime, publicTracePolicy, definition, state, operation);
    }

    return runImmediateAtRiskWeekLangfuseTrace(runtime, publicTracePolicy, definition, state, operation);
  };
}

export function createAtRiskWeekTraceDefinition(
  state: AtRiskWeekGraphState,
  traceNode: AtRiskWeekTraceNode
): AtRiskWeekTraceDefinition {
  return {
    name: `fleetgraph.at_risk_week.${traceNode}`,
    runType: 'chain',
    tags: [
      'fleetgraph',
      `detector:${atRiskWeekDetectorType}`,
      `detector_version:${atRiskWeekDetectorVersion}`,
      `trigger:${state.trace.triggerSource}`,
      `trace_node:${traceNode}`,
    ],
    inputMetadata: createAtRiskWeekTraceMetadata(state, traceNode),
  };
}

export function createAtRiskWeekTraceMetadata(
  state: AtRiskWeekGraphState,
  traceNode: AtRiskWeekTraceNode
): AtRiskWeekTraceMetadata {
  const latestBranchDecision = state.trace.branchDecisions[state.trace.branchDecisions.length - 1] ?? null;
  const traceTiming = findLatestAtRiskWeekTraceTiming(state.trace.timings, traceNode);
  const graphTiming = findLatestAtRiskWeekTraceTiming(state.trace.timings, 'run');

  return {
    detectorType: atRiskWeekDetectorType,
    detectorVersion: atRiskWeekDetectorVersion,
    trigger: state.trace.triggerSource,
    triggerSource: state.trace.triggerSource,
    workspaceId: state.scope.workspaceId,
    scopedDocumentId: state.scope.scopedDocId,
    scopedDocumentType: 'sprint',
    weekId: state.scope.scopedDocId,
    runId: state.scope.runId,
    traceNode,
    runStatus: state.status,
    activeNode: state.activeNode,
    materialChangeKey: state.scope.materialChangeKey,
    guardDecision: deriveAtRiskWeekGuardDecision(state),
    branchPath: deriveAtRiskWeekBranchPath(state),
    guardShouldRun: state.guard?.shouldRun ?? null,
    guardSuppressed: state.guard === null ? null : !state.guard.shouldRun,
    guardDecisionReason: state.guard?.reason ?? null,
    preFilterShouldReason: state.preFilter?.shouldReason ?? null,
    preFilterDecisionReason: state.preFilter?.reason ?? null,
    earlyExitNode: state.earlyExit?.node ?? null,
    earlyExitReason: state.earlyExit?.reason ?? null,
    earlyExitMessage: state.earlyExit?.message ?? null,
    branchDecisionCount: state.trace.branchDecisions.length,
    latestBranchNode: latestBranchDecision?.node ?? null,
    latestBranchDecision: latestBranchDecision?.decision ?? null,
    latestBranchReason: latestBranchDecision?.reason ?? null,
    modelName: atRiskWeekReasoningModelName,
    modelTemperature: atRiskWeekReasoningModelTemperature,
    inputTokens: state.trace.modelUsage?.inputTokens ?? null,
    outputTokens: state.trace.modelUsage?.outputTokens ?? null,
    estimatedCost: state.trace.modelUsage?.estimatedCost ?? null,
    lifecycleState: state.policy?.lifecycleState ?? null,
    approvalLevel: state.policy?.approvalLevel ?? null,
    reversibility: state.policy?.reversibility ?? null,
    actionCandidatePresent: state.policy === null ? null : state.policy.actionCandidate !== null,
    findingId: state.persistence?.findingId ?? null,
    actionCandidateId: state.persistence?.actionCandidateId ?? null,
    broadcastEvent: state.persistence?.broadcastEvent ?? null,
    tracePublic: state.trace.langfuseTracePublic,
    traceId: state.trace.langfuseTraceId,
    traceUrl: state.trace.langfuseTraceUrl,
    traceDurationMs: traceTiming?.durationMs ?? null,
    graphLatencyMs: graphTiming?.durationMs ?? null,
    latencyTargetMs: atRiskWeekLatencyTargetMs,
    latencyTargetMet: graphTiming === null ? null : graphTiming.durationMs <= atRiskWeekLatencyTargetMs,
    completedAt: state.completedAt,
  };
}

export function createAtRiskWeekLangfusePropagatedMetadata(
  metadata: AtRiskWeekTraceMetadata
): Record<string, string> {
  return {
    detectorType: metadata.detectorType,
    detectorVersion: metadata.detectorVersion,
    triggerSource: metadata.triggerSource,
    workspaceId: metadata.workspaceId,
    scopedDocumentId: metadata.scopedDocumentId,
    runId: metadata.runId,
    traceNode: metadata.traceNode,
    runStatus: metadata.runStatus,
    activeNode: metadata.activeNode ?? 'none',
    materialChangeKey: metadata.materialChangeKey ?? 'none',
  };
}

function recordAtRiskWeekTraceTiming(
  state: AtRiskWeekGraphState,
  timing: AtRiskWeekTraceTiming
): AtRiskWeekGraphState {
  isoDateTimeSchema.parse(timing.startedAt);
  isoDateTimeSchema.parse(timing.completedAt);

  if (!Number.isFinite(timing.durationMs) || timing.durationMs < 0) {
    throw new AtRiskWeekTraceContractError(
      `At-risk Week trace timing duration must be nonnegative: traceNode=${timing.traceNode}, durationMs=${timing.durationMs}`
    );
  }

  return {
    ...state,
    trace: {
      ...state.trace,
      timings: [...state.trace.timings, timing],
    },
  };
}

function calculateAtRiskWeekTraceDuration(
  startedAt: AtRiskWeekTraceInstant,
  completedAt: AtRiskWeekTraceInstant
): number {
  const durationMs = completedAt.monotonicMs - startedAt.monotonicMs;

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new AtRiskWeekTraceContractError(
      `At-risk Week trace clock moved backwards: startedMs=${startedAt.monotonicMs}, completedMs=${completedAt.monotonicMs}`
    );
  }

  return durationMs;
}

function findLatestAtRiskWeekTraceTiming(
  timings: AtRiskWeekTraceTiming[],
  traceNode: AtRiskWeekTraceNode
): AtRiskWeekTraceTiming | null {
  for (let index = timings.length - 1; index >= 0; index -= 1) {
    const timing = timings[index];

    if (timing && timing.traceNode === traceNode) {
      return timing;
    }
  }

  return null;
}

async function runImmediateAtRiskWeekLangfuseTrace(
  runtime: FleetGraphLangfuseRuntime,
  publicTracePolicy: FleetGraphPublicTracePolicy,
  definition: AtRiskWeekTraceDefinition,
  state: AtRiskWeekGraphState,
  operation: AtRiskWeekTraceOperation
): Promise<AtRiskWeekGraphState> {
  return runtime.startActiveObservation(definition.name, async (observation) => (
    runtime.propagateAttributes(createAtRiskWeekLangfuseAttributes(definition, state), async () => {
      observation.update({
        input: createAtRiskWeekLangfuseInput(definition.inputMetadata),
        metadata: definition.inputMetadata,
      });

      try {
        const outputState = await operation(state);
        const publication = await publishAtRiskWeekTraceIfEnabled(publicTracePolicy, definition, observation);
        const outputStateWithPublication = applyAtRiskWeekTracePublication(
          outputState,
          definition,
          publication.metadata
        );
        const outputMetadata = createAtRiskWeekTraceMetadata(
          outputStateWithPublication,
          definition.inputMetadata.traceNode
        );

        observation.update({
          output: createAtRiskWeekLangfuseOutput(outputStateWithPublication, outputMetadata),
          metadata: createAtRiskWeekObservationMetadata(definition, outputMetadata, publication.metadata),
          level: 'DEFAULT',
        });

        return outputStateWithPublication;
      } catch (error) {
        observation.update({
          output: {
            traceMetadata: definition.inputMetadata,
            errorMessage: errorMessage(error),
          },
          level: 'ERROR',
          statusMessage: errorMessage(error),
        });
        throw error;
      }
    })
  ), { asType: definition.runType });
}

async function runDeferredAtRiskWeekLangfuseTrace(
  runtime: FleetGraphLangfuseRuntime,
  publicTracePolicy: FleetGraphPublicTracePolicy,
  definition: AtRiskWeekTraceDefinition,
  state: AtRiskWeekGraphState,
  operation: AtRiskWeekTraceOperation
): Promise<AtRiskWeekGraphState> {
  try {
    const outputState = await operation(state);
    const outputMetadata = createAtRiskWeekTraceMetadata(outputState, definition.inputMetadata.traceNode);

    if (!shouldExportAtRiskWeekLangfuseTrace(definition.inputMetadata, outputMetadata)) {
      return outputState;
    }

    await emitCompletedAtRiskWeekLangfuseTrace(runtime, publicTracePolicy, definition, state, outputState, outputMetadata);
    return outputState;
  } catch (error) {
    await emitFailedAtRiskWeekLangfuseTrace(runtime, definition, state, error);
    throw error;
  }
}

async function emitCompletedAtRiskWeekLangfuseTrace(
  runtime: FleetGraphLangfuseRuntime,
  publicTracePolicy: FleetGraphPublicTracePolicy,
  definition: AtRiskWeekTraceDefinition,
  state: AtRiskWeekGraphState,
  outputState: AtRiskWeekGraphState,
  outputMetadata: AtRiskWeekTraceMetadata
): Promise<void> {
  await runtime.startActiveObservation(definition.name, async (observation) => (
    runtime.propagateAttributes(createAtRiskWeekLangfuseAttributes(definition, state), async () => {
      observation.update({
        input: createAtRiskWeekLangfuseInput(definition.inputMetadata),
        metadata: definition.inputMetadata,
      });
      const publication = await publishAtRiskWeekTraceIfEnabled(publicTracePolicy, definition, observation);
      observation.update({
        output: createAtRiskWeekLangfuseOutput(outputState, outputMetadata),
        metadata: createAtRiskWeekObservationMetadata(definition, outputMetadata, publication.metadata),
        level: 'DEFAULT',
      });
    })
  ), { asType: definition.runType });
}

async function emitFailedAtRiskWeekLangfuseTrace(
  runtime: FleetGraphLangfuseRuntime,
  definition: AtRiskWeekTraceDefinition,
  state: AtRiskWeekGraphState,
  error: unknown
): Promise<void> {
  await runtime.startActiveObservation(definition.name, async (observation) => (
    runtime.propagateAttributes(createAtRiskWeekLangfuseAttributes(definition, state), async () => {
      observation.update({
        input: createAtRiskWeekLangfuseInput(definition.inputMetadata),
        metadata: definition.inputMetadata,
      });
      observation.update({
        output: {
          traceMetadata: definition.inputMetadata,
          errorMessage: errorMessage(error),
        },
        level: 'ERROR',
        statusMessage: errorMessage(error),
      });
    })
  ), { asType: definition.runType });
}

async function publishAtRiskWeekTraceIfEnabled(
  policy: FleetGraphPublicTracePolicy,
  definition: AtRiskWeekTraceDefinition,
  observation: Parameters<typeof publishFleetGraphTraceIfEnabled>[0]['observation']
): Promise<FleetGraphTracePublicationResult> {
  if (definition.inputMetadata.traceNode !== 'run') {
    return {
      published: false,
      metadata: {
        tracePublic: false,
        traceId: null,
        traceUrl: null,
      },
    };
  }

  return publishFleetGraphTraceIfEnabled({
    observation,
    policy,
    traceName: definition.name,
    tags: definition.tags,
    logger: console,
  });
}

function applyAtRiskWeekTracePublication(
  state: AtRiskWeekGraphState,
  definition: AtRiskWeekTraceDefinition,
  metadata: FleetGraphTracePublicationMetadata
): AtRiskWeekGraphState {
  if (definition.inputMetadata.traceNode !== 'run') {
    return state;
  }

  return {
    ...state,
    trace: {
      ...state.trace,
      langfuseTraceId: metadata.traceId,
      langfuseTraceUrl: metadata.traceUrl,
      langfuseTracePublic: metadata.tracePublic,
    },
  };
}

function createAtRiskWeekObservationMetadata(
  definition: AtRiskWeekTraceDefinition,
  outputMetadata: AtRiskWeekTraceMetadata,
  publicationMetadata: FleetGraphTracePublicationMetadata
): AtRiskWeekTraceMetadata | (AtRiskWeekTraceMetadata & FleetGraphTracePublicationMetadata) {
  if (definition.inputMetadata.traceNode !== 'run') {
    return outputMetadata;
  }

  return {
    ...outputMetadata,
    ...publicationMetadata,
  };
}

function createAtRiskWeekLangfuseAttributes(
  definition: AtRiskWeekTraceDefinition,
  state: AtRiskWeekGraphState
): ReturnType<typeof createFleetGraphLangfusePropagatedAttributes> {
  return createFleetGraphLangfusePropagatedAttributes({
    traceName: definition.name,
    sessionId: state.scope.checkpointThreadId,
    userId: null,
    tags: definition.tags,
    metadata: createAtRiskWeekLangfusePropagatedMetadata(definition.inputMetadata),
  });
}

function shouldDeferAtRiskWeekLangfuseTrace(metadata: AtRiskWeekTraceMetadata): boolean {
  if (metadata.triggerSource !== 'poll') {
    return false;
  }

  return metadata.traceNode === 'run'
    || metadata.traceNode === 'scope'
    || metadata.traceNode === 'context'
    || metadata.traceNode === 'guard'
    || metadata.traceNode === 'preFilter';
}

function shouldExportAtRiskWeekLangfuseTrace(
  inputMetadata: AtRiskWeekTraceMetadata,
  outputMetadata: AtRiskWeekTraceMetadata
): boolean {
  if (inputMetadata.triggerSource !== 'poll') {
    return true;
  }

  if (
    outputMetadata.traceNode === 'scope'
    || outputMetadata.traceNode === 'context'
    || outputMetadata.traceNode === 'guard'
  ) {
    return false;
  }

  return outputMetadata.branchPath !== 'prefilter-exit'
    && outputMetadata.branchPath !== 'guard-exit'
    && outputMetadata.branchPath !== 'scope-exit';
}

function createAtRiskWeekLangfuseInput(metadata: AtRiskWeekTraceMetadata): object {
  return {
    traceMetadata: metadata,
  };
}

function createAtRiskWeekLangfuseOutput(
  state: AtRiskWeekGraphState,
  metadata: AtRiskWeekTraceMetadata
): object {
  return {
    traceMetadata: metadata,
    runStatus: state.status,
    activeNode: state.activeNode,
  };
}

function deriveAtRiskWeekGuardDecision(state: AtRiskWeekGraphState): AtRiskWeekGuardDecision | null {
  if (state.guard === null) {
    return null;
  }

  return state.guard.shouldRun ? 'run' : 'quiet';
}

function deriveAtRiskWeekBranchPath(state: AtRiskWeekGraphState): AtRiskWeekBranchPath | null {
  if (state.persistence !== null || state.status === 'completed') {
    return 'output';
  }

  if (state.policy !== null) {
    return 'policy';
  }

  if (state.reasoning !== null || state.trace.modelUsage !== null) {
    return 'model-reason';
  }

  if (state.preFilter?.shouldReason === true) {
    return 'model-reason';
  }

  if (state.preFilter?.shouldReason === false || state.earlyExit?.reason === 'pre_filter_safe') {
    return 'prefilter-exit';
  }

  if (state.earlyExit?.reason === 'guard_suppressed') {
    return 'guard-exit';
  }

  if (state.earlyExit?.reason === 'scope_not_found') {
    return 'scope-exit';
  }

  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
