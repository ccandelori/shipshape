import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { Annotation, END, MemorySaver, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import type { QueryResultRow } from 'pg';
import { z } from 'zod';
import type { FleetGraphConfig } from '../config.js';
import type { FleetGraphQueryClient, WeekContext } from '../context.js';
import type { DetectorRunDecision } from '../guards.js';
import {
  evaluateAtRiskWeekPreFilter,
  type AtRiskWeekPreFilterDecision,
} from './at-risk-week-prefilter.js';
import {
  renderAtRiskWeekReasoningPromptFromContext,
  type AtRiskWeekReasoningPrompt,
} from './at-risk-week-prompt.js';
import {
  createFleetGraphLangfusePropagatedAttributes,
  createFleetGraphLangfuseRunnableConfig,
  createFleetGraphPublicTracePolicy,
  createDisabledFleetGraphPublicTracePolicy,
  fleetGraphLangfuseRuntime,
  publishFleetGraphTraceIfEnabled,
  type FleetGraphLangfuseRuntime,
  type FleetGraphPublicTracePolicy,
  type FleetGraphTracePublicationMetadata,
  type FleetGraphTracePublicationResult,
} from '../langfuse.js';
import { classifyFleetGraphPolicy } from '../policy.js';
import {
  evidenceItemSchema,
  fleetGraphEvidenceSourceTypeSchema,
  fleetGraphSeveritySchema,
  recommendedActionSchema,
  uuidSchema,
  isoDateTimeSchema,
  type ActionCandidate,
  type FleetGraphApprovalLevel,
  type FleetGraphTrigger,
  type FleetGraphLifecycleState,
  type FleetGraphReversibility,
  type FleetGraphSeverity,
} from '../types.js';
import {
  type AtRiskWeekOutputRepository,
  type PersistedAtRiskWeekOutput,
} from './at-risk-week-output-repository.js';
import {
  type AtRiskWeekUsageRecord,
  type AtRiskWeekUsageRepository,
} from './at-risk-week-usage-repository.js';

export { AtRiskWeekPersistenceError } from './at-risk-week-output-repository.js';

export {
  evaluateAtRiskWeekPreFilter,
  type AtRiskWeekPreFilterDecision,
} from './at-risk-week-prefilter.js';

export {
  atRiskWeekPromptBoundary,
  type AtRiskWeekReasoningPrompt,
} from './at-risk-week-prompt.js';

export const atRiskWeekDetectorType = 'at_risk_week';
export const atRiskWeekDetectorVersion = 'v1';

export const atRiskWeekReasoningModelName = 'gpt-4o-mini';
export const atRiskWeekReasoningModelTemperature = 0;
export const atRiskWeekLatencyTargetMs = 5 * 60 * 1_000;

const atRiskWeekModelPricingByName = {
  'gpt-4o-mini': {
    inputUsdPerMillionTokens: 0.15,
    outputUsdPerMillionTokens: 0.60,
  },
} as const;

export const atRiskWeekTriggerSourceSchema = z.enum(['poll', 'mutation', 'ondemand', 'resume']);
export type AtRiskWeekTriggerSource = z.infer<typeof atRiskWeekTriggerSourceSchema>;

export const atRiskWeekGraphInputSchema = z.object({
  workspaceId: uuidSchema,
  scopedDocId: uuidSchema,
  runId: uuidSchema,
  triggerSource: atRiskWeekTriggerSourceSchema,
  requestedAt: isoDateTimeSchema,
});
export type AtRiskWeekGraphInput = z.infer<typeof atRiskWeekGraphInputSchema>;

export const atRiskWeekNodeNames = [
  'scope',
  'context',
  'guard',
  'preFilter',
  'reason',
  'policy',
  'output',
] as const;
export type AtRiskWeekNodeName = typeof atRiskWeekNodeNames[number];

export type AtRiskWeekRunStatus = 'running' | 'exited' | 'completed' | 'failed';

export type AtRiskWeekEarlyExitReason =
  | 'scope_not_found'
  | 'guard_suppressed'
  | 'pre_filter_safe'
  | 'not_at_risk';

export type AtRiskWeekScopeState = {
  workspaceId: string;
  scopedDocId: string;
  runId: string;
  detectorType: typeof atRiskWeekDetectorType;
  materialChangeKey: string | null;
  checkpointThreadId: string;
  checkpointNamespace: string;
};

const atRiskWeekEvidenceItemSchema = evidenceItemSchema.extend({
  quote: z.string().min(1).max(600),
});

const atRiskWeekRecommendedActionSchema = recommendedActionSchema.extend({
  kind: z.literal('draft_comment'),
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(1_000),
});

export const atRiskWeekReasoningOutputSchema = z.discriminatedUnion('isAtRisk', [
  z.object({
    isAtRisk: z.literal(true),
    severity: fleetGraphSeveritySchema,
    evidence: z.array(atRiskWeekEvidenceItemSchema).min(1).max(6),
    recommendedAction: atRiskWeekRecommendedActionSchema,
    rationale: z.string().min(1).max(1_200),
  }),
  z.object({
    isAtRisk: z.literal(false),
    severity: z.null(),
    evidence: z.array(atRiskWeekEvidenceItemSchema).length(0),
    recommendedAction: z.null(),
    rationale: z.string().min(1).max(1_200),
  }),
]);
export type AtRiskWeekReasoningOutput = z.infer<typeof atRiskWeekReasoningOutputSchema>;

const atRiskWeekStructuredEvidenceItemSchema = z.object({
  sourceType: fleetGraphEvidenceSourceTypeSchema,
  sourceDocumentId: uuidSchema.nullable(),
  quote: z.string().min(1).max(600),
  observedAt: isoDateTimeSchema.nullable(),
});

const atRiskWeekStructuredRecommendedActionSchema = z.object({
  kind: z.literal('draft_comment'),
  title: z.string().min(1).max(120).nullable(),
  body: z.string().min(1).max(1_000),
});

export const atRiskWeekStructuredReasoningOutputSchema = z.object({
  isAtRisk: z.boolean(),
  severity: fleetGraphSeveritySchema.nullable(),
  evidence: z.array(atRiskWeekStructuredEvidenceItemSchema).max(6),
  recommendedAction: atRiskWeekStructuredRecommendedActionSchema.nullable(),
  rationale: z.string().min(1).max(1_200),
}).superRefine((value, context) => {
  if (value.isAtRisk) {
    if (value.severity === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['severity'],
        message: 'At-risk reasoning must include severity.',
      });
    }

    if (value.evidence.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidence'],
        message: 'At-risk reasoning must include evidence.',
      });
    }

    if (value.recommendedAction === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recommendedAction'],
        message: 'At-risk reasoning must include a recommended action.',
      });
    }

    return;
  }

  if (value.severity !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['severity'],
      message: 'Quiet reasoning must not include severity.',
    });
  }

  if (value.evidence.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidence'],
      message: 'Quiet reasoning must not include evidence.',
    });
  }

  if (value.recommendedAction !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recommendedAction'],
      message: 'Quiet reasoning must not include a recommended action.',
    });
  }
});
type AtRiskWeekStructuredReasoningOutput = z.infer<typeof atRiskWeekStructuredReasoningOutputSchema>;

export type AtRiskWeekPolicyDecision = {
  lifecycleState: FleetGraphLifecycleState;
  approvalLevel: FleetGraphApprovalLevel;
  reversibility: FleetGraphReversibility;
  actionCandidate: ActionCandidate | null;
};

export type AtRiskWeekPersistenceArtifacts = {
  findingId: string | null;
  actionCandidateId: string | null;
  broadcastEvent: 'fleetgraph:finding_created' | null;
};

export type AtRiskWeekModelUsage = {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
};

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

export type AtRiskWeekTraceNode = AtRiskWeekNodeName | 'run';

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

export type AtRiskWeekNodeError = {
  node: AtRiskWeekNodeName;
  message: string;
  cause: string | null;
};

export type AtRiskWeekEarlyExit = {
  node: AtRiskWeekNodeName;
  reason: AtRiskWeekEarlyExitReason;
  message: string;
  materialChangeKey: string | null;
};

export type AtRiskWeekGraphState = {
  input: AtRiskWeekGraphInput;
  status: AtRiskWeekRunStatus;
  activeNode: AtRiskWeekNodeName | null;
  completedNodes: AtRiskWeekNodeName[];
  scope: AtRiskWeekScopeState;
  context: WeekContext | null;
  guard: DetectorRunDecision | null;
  preFilter: AtRiskWeekPreFilterDecision | null;
  reasoning: AtRiskWeekReasoningOutput | null;
  policy: AtRiskWeekPolicyDecision | null;
  persistence: AtRiskWeekPersistenceArtifacts | null;
  earlyExit: AtRiskWeekEarlyExit | null;
  errors: AtRiskWeekNodeError[];
  trace: AtRiskWeekStateTrace;
  requestedAt: string;
  completedAt: string | null;
};

export type AtRiskWeekNodeContract = {
  name: AtRiskWeekNodeName;
  requires: string[];
  writes: string[];
  exitReasons: AtRiskWeekEarlyExitReason[];
};

export const atRiskWeekNodeContracts: AtRiskWeekNodeContract[] = [
  {
    name: 'scope',
    requires: ['input'],
    writes: ['scope'],
    exitReasons: ['scope_not_found'],
  },
  {
    name: 'context',
    requires: ['scope'],
    writes: ['context'],
    exitReasons: ['scope_not_found'],
  },
  {
    name: 'guard',
    requires: ['context'],
    writes: ['guard', 'scope.materialChangeKey', 'trace.materialChangeKey'],
    exitReasons: ['guard_suppressed'],
  },
  {
    name: 'preFilter',
    requires: ['guard.shouldRun', 'context'],
    writes: ['preFilter'],
    exitReasons: ['pre_filter_safe'],
  },
  {
    name: 'reason',
    requires: ['preFilter.shouldReason'],
    writes: ['reasoning', 'trace.modelUsage'],
    exitReasons: ['not_at_risk'],
  },
  {
    name: 'policy',
    requires: ['reasoning'],
    writes: ['policy'],
    exitReasons: [],
  },
  {
    name: 'output',
    requires: ['policy'],
    writes: ['persistence', 'status'],
    exitReasons: [],
  },
];

export type AtRiskWeekCheckpointConfig = {
  configurable: {
    thread_id: string;
    checkpoint_ns: string;
  };
  metadata: {
    detector: typeof atRiskWeekDetectorType;
    triggerSource: AtRiskWeekTriggerSource;
    workspaceId: string;
    scopedDocId: string;
    runId: string;
    materialChangeKey: string | null;
  };
};

export type AtRiskWeekModelMessage = {
  role: 'system' | 'user';
  content: string;
};

export type AtRiskWeekReasonerResult = {
  reasoning: AtRiskWeekReasoningOutput;
  modelUsage: AtRiskWeekModelUsage | null;
};

export type AtRiskWeekStructuredModelResult = {
  raw: BaseMessage;
  parsed: unknown;
};

export type AtRiskWeekStructuredModelInvoker = {
  invoke: (messages: BaseMessage[], config: Partial<RunnableConfig>) => Promise<AtRiskWeekStructuredModelResult>;
};

export type AtRiskWeekRunnableConfigFactory = () => Partial<RunnableConfig>;

export type AtRiskWeekStructuredReasoner = {
  modelName: string;
  invoke: (messages: AtRiskWeekModelMessage[]) => Promise<AtRiskWeekReasonerResult>;
};

export type AtRiskWeekRetryPolicy = {
  maxAttempts: number;
  delayMs: number;
  sleep: (delayMs: number) => Promise<void>;
};

export type AtRiskWeekReasonNodeLogger = {
  warn: (message: string, fields: Record<string, string | number | boolean | null>) => void;
};

export type AtRiskWeekReasonNodeDependencies = {
  reasoner: AtRiskWeekStructuredReasoner;
  retryPolicy: AtRiskWeekRetryPolicy;
  logger: AtRiskWeekReasonNodeLogger;
  now: () => string;
};

export type AtRiskWeekBroadcastPayload = {
  workspaceId: string;
  scopedDocumentId: string;
  findingId: string;
  actionCandidateId: string | null;
  detectorType: typeof atRiskWeekDetectorType;
  severity: FleetGraphSeverity;
  lifecycleState: FleetGraphLifecycleState;
};

export type AtRiskWeekOutputNodeDependencies = {
  outputRepository: AtRiskWeekOutputRepository;
  broadcastToUser: (
    userId: string,
    eventType: 'fleetgraph:finding_created',
    payload: AtRiskWeekBroadcastPayload
  ) => void;
  now: () => string;
};

const atRiskWeekGraphAnnotation = Annotation.Root({
  graphState: Annotation<AtRiskWeekGraphState>(),
});

type AtRiskWeekLangGraphState = typeof atRiskWeekGraphAnnotation.State;
export type AtRiskWeekCompiledGraph = {
  invoke: (
    input: AtRiskWeekLangGraphState,
    options: AtRiskWeekCheckpointConfig
  ) => Promise<AtRiskWeekLangGraphState>;
};

export type AtRiskWeekGraphDependencies = {
  nodeDependencies: AtRiskWeekNodeDependencies;
  reasonNodeDependencies: AtRiskWeekReasonNodeDependencies;
  outputNodeDependencies: AtRiskWeekOutputNodeDependencies;
  usageRepository: AtRiskWeekUsageRepository;
  traceRunner: AtRiskWeekTraceRunner;
  checkpointer: BaseCheckpointSaver;
};

export type AtRiskWeekNodeDependencies = {
  client: FleetGraphQueryClient;
  buildWeekContext: (
    client: FleetGraphQueryClient,
    workspaceId: string,
    scopedDocId: string
  ) => Promise<WeekContext>;
  shouldRunDetector: (
    client: FleetGraphQueryClient,
    workspaceId: string,
    scopedDocId: string,
    context: WeekContext
  ) => Promise<DetectorRunDecision>;
  now: () => string;
};

type ScopeResolutionRow = QueryResultRow & {
  id: string;
};

export function createAtRiskWeekInitialState(input: AtRiskWeekGraphInput): AtRiskWeekGraphState {
  const parsedInput = atRiskWeekGraphInputSchema.parse(input);
  const scope = createAtRiskWeekScopeState(parsedInput);

  return {
    input: parsedInput,
    status: 'running',
    activeNode: 'scope',
    completedNodes: [],
    scope,
    context: null,
    guard: null,
    preFilter: null,
    reasoning: null,
    policy: null,
    persistence: null,
    earlyExit: null,
    errors: [],
    trace: {
      detector: atRiskWeekDetectorType,
      triggerSource: parsedInput.triggerSource,
      workspaceId: parsedInput.workspaceId,
      scopedDocId: parsedInput.scopedDocId,
      runId: parsedInput.runId,
      materialChangeKey: null,
      langfuseTraceId: null,
      langfuseTraceUrl: null,
      langfuseTracePublic: false,
      branchDecisions: [],
      modelUsage: null,
      timings: [],
    },
    requestedAt: parsedInput.requestedAt,
    completedAt: null,
  };
}

export function compileAtRiskWeekGraph(dependencies: AtRiskWeekGraphDependencies): AtRiskWeekCompiledGraph {
  const graph = new StateGraph(atRiskWeekGraphAnnotation)
    .addNode('scope', (state: AtRiskWeekLangGraphState) => runAtRiskWeekGraphNode(
      state,
      'scope',
      dependencies,
      (currentState) => scopeNode(currentState, dependencies.nodeDependencies)
    ))
    .addNode('context', (state: AtRiskWeekLangGraphState) => runAtRiskWeekGraphNode(
      state,
      'context',
      dependencies,
      (currentState) => contextNode(currentState, dependencies.nodeDependencies)
    ))
    .addNode('guard', (state: AtRiskWeekLangGraphState) => runAtRiskWeekGraphNode(
      state,
      'guard',
      dependencies,
      (currentState) => guardNode(currentState, dependencies.nodeDependencies)
    ))
    .addNode('preFilter', (state: AtRiskWeekLangGraphState) => runAtRiskWeekGraphNode(
      state,
      'preFilter',
      dependencies,
      (currentState) => preFilterNode(currentState, dependencies.nodeDependencies)
    ))
    .addNode('reason', (state: AtRiskWeekLangGraphState) => runAtRiskWeekGraphNode(
      state,
      'reason',
      dependencies,
      (currentState) => reasonNode(currentState, dependencies.reasonNodeDependencies)
    ))
    .addNode('policy', (state: AtRiskWeekLangGraphState) => runAtRiskWeekGraphNode(
      state,
      'policy',
      dependencies,
      (currentState) => policyNode(currentState)
    ))
    .addNode('output', (state: AtRiskWeekLangGraphState) => runAtRiskWeekGraphNode(
      state,
      'output',
      dependencies,
      (currentState) => outputNode(currentState, dependencies.outputNodeDependencies)
    ))
    .addEdge(START, 'scope');

  atRiskWeekNodeNames.forEach((node) => {
    graph.addConditionalEdges(node, routeAtRiskWeekGraph, [...atRiskWeekNodeNames, END]);
  });

  return graph.compile({
    checkpointer: dependencies.checkpointer,
    name: 'fleetgraph.at_risk_week',
  });
}

export async function runAtRiskWeekGraph(
  input: AtRiskWeekGraphInput,
  dependencies: AtRiskWeekGraphDependencies
): Promise<AtRiskWeekGraphState> {
  const initialState = createAtRiskWeekInitialState(input);

  return traceAtRiskWeekRun(
    initialState,
    dependencies.traceRunner,
    async (state) => {
      const graph = compileAtRiskWeekGraph(dependencies);
      const output = await graph.invoke(
        { graphState: state },
        createAtRiskWeekCheckpointConfig(state)
      );

      await dependencies.usageRepository.persistUsage(createAtRiskWeekUsageRecord(output.graphState));

      return output.graphState;
    }
  );
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
    guardDecision: deriveAtRiskWeekGuardDecision(state.guard),
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

function deriveAtRiskWeekGuardDecision(guard: DetectorRunDecision | null): AtRiskWeekGuardDecision | null {
  if (guard === null) {
    return null;
  }

  return guard.shouldRun ? 'run' : 'quiet';
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

function recordAtRiskWeekTraceTiming(
  state: AtRiskWeekGraphState,
  timing: AtRiskWeekTraceTiming
): AtRiskWeekGraphState {
  isoDateTimeSchema.parse(timing.startedAt);
  isoDateTimeSchema.parse(timing.completedAt);

  if (!Number.isFinite(timing.durationMs) || timing.durationMs < 0) {
    throw new AtRiskWeekNodeContractError(
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
    throw new AtRiskWeekNodeContractError(
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

async function runAtRiskWeekGraphNode(
  state: AtRiskWeekLangGraphState,
  node: AtRiskWeekNodeName,
  dependencies: AtRiskWeekGraphDependencies,
  operation: AtRiskWeekTraceOperation
): Promise<Partial<AtRiskWeekLangGraphState>> {
  return {
    graphState: await traceAtRiskWeekNode(state.graphState, node, dependencies.traceRunner, operation),
  };
}

function routeAtRiskWeekGraph(state: AtRiskWeekLangGraphState): AtRiskWeekNodeName | typeof END {
  if (state.graphState.status !== 'running' || state.graphState.activeNode === null) {
    return END;
  }

  return state.graphState.activeNode;
}

export async function scopeNode(
  state: AtRiskWeekGraphState,
  dependencies: AtRiskWeekNodeDependencies
): Promise<AtRiskWeekGraphState> {
  if (state.status !== 'running') {
    return state;
  }

  const result = await dependencies.client.query<ScopeResolutionRow>(
    `SELECT d.id
     FROM documents d
     JOIN workspaces w ON w.id = d.workspace_id
     WHERE d.workspace_id = $1
       AND d.id = $2
       AND d.document_type = 'sprint'
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND w.archived_at IS NULL`,
    [state.scope.workspaceId, state.scope.scopedDocId]
  );

  if (!result.rows[0]) {
    return recordAtRiskWeekEarlyExit(
      state,
      {
        node: 'scope',
        reason: 'scope_not_found',
        message: `Active Week scope not found: workspaceId=${state.scope.workspaceId}, scopedDocId=${state.scope.scopedDocId}`,
        materialChangeKey: state.scope.materialChangeKey,
      },
      dependencies.now()
    );
  }

  return completeAtRiskWeekNode(state, 'scope', 'context', {});
}

export async function contextNode(
  state: AtRiskWeekGraphState,
  dependencies: AtRiskWeekNodeDependencies
): Promise<AtRiskWeekGraphState> {
  if (state.status !== 'running') {
    return state;
  }

  const context = await dependencies.buildWeekContext(
    dependencies.client,
    state.scope.workspaceId,
    state.scope.scopedDocId
  );

  return completeAtRiskWeekNode(state, 'context', 'guard', {
    context,
  });
}

export async function guardNode(
  state: AtRiskWeekGraphState,
  dependencies: AtRiskWeekNodeDependencies
): Promise<AtRiskWeekGraphState> {
  if (state.status !== 'running') {
    return state;
  }

  const context = requireAtRiskWeekContext(state, 'guard');
  const guard = await dependencies.shouldRunDetector(
    dependencies.client,
    state.scope.workspaceId,
    state.scope.scopedDocId,
    context
  );
  const guardedState = completeAtRiskWeekNode(state, 'guard', 'preFilter', {
    guard,
    scope: {
      ...state.scope,
      materialChangeKey: guard.materialChangeKey,
    },
    trace: {
      ...state.trace,
      materialChangeKey: guard.materialChangeKey,
    },
  });

  if (!guard.shouldRun) {
    return recordAtRiskWeekEarlyExit(
      guardedState,
      {
        node: 'guard',
        reason: 'guard_suppressed',
        message: guard.reason,
        materialChangeKey: guard.materialChangeKey,
      },
      dependencies.now()
    );
  }

  return guardedState;
}

export async function preFilterNode(
  state: AtRiskWeekGraphState,
  dependencies: AtRiskWeekNodeDependencies
): Promise<AtRiskWeekGraphState> {
  if (state.status !== 'running') {
    return state;
  }

  const context = requireAtRiskWeekContext(state, 'preFilter');
  const guard = requireAtRiskWeekGuard(state, 'preFilter');
  const preFilter = evaluateAtRiskWeekPreFilter(context);
  const preFilteredState = completeAtRiskWeekNode(state, 'preFilter', 'reason', {
    preFilter,
  });

  if (!preFilter.shouldReason) {
    return recordAtRiskWeekEarlyExit(
      preFilteredState,
      {
        node: 'preFilter',
        reason: 'pre_filter_safe',
        message: 'No blockers or high-priority blocked issues were present.',
        materialChangeKey: guard.materialChangeKey,
      },
      dependencies.now()
    );
  }

  return preFilteredState;
}

export async function reasonNode(
  state: AtRiskWeekGraphState,
  dependencies: AtRiskWeekReasonNodeDependencies
): Promise<AtRiskWeekGraphState> {
  if (state.status !== 'running') {
    return state;
  }

  requireAtRiskWeekContext(state, 'reason');
  const guard = requireAtRiskWeekGuard(state, 'reason');
  const preFilter = requireAtRiskWeekPreFilter(state, 'reason');

  if (!preFilter.shouldReason) {
    throw new AtRiskWeekNodeContractError('At-risk Week reason node requires a positive pre-filter decision');
  }

  const prompt = renderAtRiskWeekReasoningPrompt(state);
  const messages: AtRiskWeekModelMessage[] = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  const result = await invokeAtRiskWeekReasonerWithRetries(state, messages, dependencies);
  const reasoning = atRiskWeekReasoningOutputSchema.parse(result.reasoning);

  const reasonedState = completeAtRiskWeekNode(state, 'reason', 'policy', {
    reasoning,
    trace: {
      ...state.trace,
      modelUsage: result.modelUsage,
    },
  });

  if (!reasoning.isAtRisk) {
    return recordAtRiskWeekEarlyExit(
      reasonedState,
      {
        node: 'reason',
        reason: 'not_at_risk',
        message: reasoning.rationale,
        materialChangeKey: guard.materialChangeKey,
      },
      dependencies.now()
    );
  }

  return reasonedState;
}

export async function policyNode(state: AtRiskWeekGraphState): Promise<AtRiskWeekGraphState> {
  if (state.status !== 'running') {
    return state;
  }

  const context = requireAtRiskWeekContext(state, 'policy');
  const reasoning = requireAtRiskWeekReasoning(state, 'policy');

  if (!reasoning.isAtRisk) {
    throw new AtRiskWeekNodeContractError('At-risk Week policy node requires at-risk reasoning');
  }

  const policy = classifyFleetGraphPolicy({
    targetDocumentId: state.scope.scopedDocId,
    ownerUserId: context.ownerUserId,
    roleReason: 'Week owner is responsible for resolving at-risk Week blockers.',
    severity: reasoning.severity,
    evidence: reasoning.evidence,
    recommendedAction: reasoning.recommendedAction,
  });

  return completeAtRiskWeekNode(state, 'policy', 'output', {
    policy: {
      lifecycleState: policy.lifecycleState,
      approvalLevel: policy.approvalLevel,
      reversibility: policy.reversibility,
      actionCandidate: policy.actionCandidate,
    },
  });
}

export async function outputNode(
  state: AtRiskWeekGraphState,
  dependencies: AtRiskWeekOutputNodeDependencies
): Promise<AtRiskWeekGraphState> {
  if (state.status !== 'running') {
    return state;
  }

  const context = requireAtRiskWeekContext(state, 'output');
  const guard = requireAtRiskWeekGuard(state, 'output');
  const reasoning = requireAtRiskWeekReasoning(state, 'output');
  const policy = requireAtRiskWeekPolicy(state, 'output');

  if (!reasoning.isAtRisk) {
    throw new AtRiskWeekNodeContractError('At-risk Week output node requires at-risk reasoning');
  }

  const lifecycleState = requireAtRiskWeekOutputLifecycle(policy.lifecycleState);
  const persistence = await persistAtRiskWeekOutput(state, reasoning, policy, lifecycleState, dependencies);

  if (context.ownerUserId !== null) {
    broadcastAtRiskWeekFindingCreated(
      state,
      context.ownerUserId,
      reasoning.severity,
      persistence.lifecycleState,
      persistence,
      dependencies
    );
  }

  return {
    ...state,
    status: 'completed',
    activeNode: null,
    completedNodes: state.completedNodes.includes('output')
      ? state.completedNodes
      : [...state.completedNodes, 'output'],
    persistence: {
      findingId: persistence.findingId,
      actionCandidateId: persistence.actionCandidateId,
      broadcastEvent: context.ownerUserId === null ? null : 'fleetgraph:finding_created',
    },
    trace: {
      ...state.trace,
      materialChangeKey: guard.materialChangeKey,
    },
    completedAt: isoDateTimeSchema.parse(dependencies.now()),
  };
}

function broadcastAtRiskWeekFindingCreated(
  state: AtRiskWeekGraphState,
  userId: string,
  severity: FleetGraphSeverity,
  lifecycleState: FleetGraphLifecycleState,
  persistence: PersistedAtRiskWeekOutput,
  dependencies: AtRiskWeekOutputNodeDependencies
): void {
  try {
    dependencies.broadcastToUser(userId, 'fleetgraph:finding_created', {
      workspaceId: state.scope.workspaceId,
      scopedDocumentId: state.scope.scopedDocId,
      findingId: persistence.findingId,
      actionCandidateId: persistence.actionCandidateId,
      detectorType: atRiskWeekDetectorType,
      severity,
      lifecycleState,
    });
  } catch (error) {
    throw new AtRiskWeekBroadcastError({
      workspaceId: state.scope.workspaceId,
      scopedDocId: state.scope.scopedDocId,
      runId: state.scope.runId,
      findingId: persistence.findingId,
      userId,
      message: errorMessage(error),
    });
  }
}

async function persistAtRiskWeekOutput(
  state: AtRiskWeekGraphState,
  reasoning: Extract<AtRiskWeekReasoningOutput, { isAtRisk: true }>,
  policy: AtRiskWeekPolicyDecision,
  lifecycleState: 'open' | 'pending_review',
  dependencies: AtRiskWeekOutputNodeDependencies
): Promise<PersistedAtRiskWeekOutput> {
  const context = requireAtRiskWeekContext(state, 'output');
  const guard = requireAtRiskWeekGuard(state, 'output');

  return dependencies.outputRepository.persistOutput({
    workspaceId: state.scope.workspaceId,
    scopedDocId: state.scope.scopedDocId,
    runId: state.scope.runId,
    detectorType: atRiskWeekDetectorType,
    severity: reasoning.severity,
    evidence: reasoning.evidence,
    recipientUserId: context.ownerUserId,
    lifecycleState,
    materialChangeKey: guard.materialChangeKey,
    actionCandidate: policy.actionCandidate,
  });
}

function createAtRiskWeekUsageRecord(state: AtRiskWeekGraphState): AtRiskWeekUsageRecord {
  const modelUsage = state.trace.modelUsage ?? {
    modelName: atRiskWeekReasoningModelName,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
  };

  return {
    runId: state.scope.runId,
    workspaceId: state.scope.workspaceId,
    trigger: toFleetGraphUsageTrigger(state.trace.triggerSource),
    detector: atRiskWeekDetectorType,
    modelName: modelUsage.modelName,
    inputTokens: modelUsage.inputTokens,
    outputTokens: modelUsage.outputTokens,
    estimatedCost: modelUsage.estimatedCost,
    traceMetadata: createAtRiskWeekTraceMetadata(state, 'run'),
  };
}

function toFleetGraphUsageTrigger(triggerSource: AtRiskWeekTriggerSource): FleetGraphTrigger {
  if (triggerSource === 'poll' || triggerSource === 'mutation') {
    return 'proactive';
  }

  if (triggerSource === 'ondemand') {
    return 'ondemand';
  }

  if (triggerSource === 'resume') {
    return 'resume';
  }

  throw new AtRiskWeekNodeContractError(`Unsupported at-risk Week trigger source: triggerSource=${triggerSource}`);
}

export function createOpenAIAtRiskWeekReasoner(config: FleetGraphConfig): AtRiskWeekStructuredReasoner {
  const model = new ChatOpenAI({
    model: atRiskWeekReasoningModelName,
    temperature: atRiskWeekReasoningModelTemperature,
    maxRetries: 0,
    apiKey: config.openaiApiKey,
  });
  const structuredModel = model.withStructuredOutput(atRiskWeekStructuredReasoningOutputSchema, {
    name: 'at_risk_week_reasoning',
    method: 'jsonSchema',
    strict: true,
    includeRaw: true,
  });

  return createLangChainAtRiskWeekReasoner(
    atRiskWeekReasoningModelName,
    structuredModel,
    () => createFleetGraphLangfuseRunnableConfig({
      runName: 'fleetgraph.at_risk_week.reason.llm',
      tags: [
        'fleetgraph',
        `detector:${atRiskWeekDetectorType}`,
        `detector_version:${atRiskWeekDetectorVersion}`,
        'trace_node:reason',
        'llm',
      ],
      metadata: {
        detectorType: atRiskWeekDetectorType,
        detectorVersion: atRiskWeekDetectorVersion,
        traceNode: 'reason',
      },
      userId: null,
      sessionId: null,
    })
  );
}

export function createLangChainAtRiskWeekReasoner(
  modelName: string,
  structuredModel: AtRiskWeekStructuredModelInvoker,
  createRunnableConfig: AtRiskWeekRunnableConfigFactory
): AtRiskWeekStructuredReasoner {
  return {
    modelName,
    invoke: async (messages) => {
      const result = await structuredModel.invoke(messages.map(toLangChainMessage), createRunnableConfig());
      const reasoning = parseAtRiskWeekStructuredOutput(result.parsed, modelName);

      return {
        reasoning,
        modelUsage: extractAtRiskWeekModelUsage(result.raw, modelName),
      };
    },
  };
}

function parseAtRiskWeekStructuredOutput(parsed: unknown, modelName: string): AtRiskWeekReasoningOutput {
  try {
    return atRiskWeekReasoningOutputSchema.parse(
      normalizeAtRiskWeekStructuredOutput(atRiskWeekStructuredReasoningOutputSchema.parse(parsed))
    );
  } catch (error) {
    throw new AtRiskWeekStructuredOutputError({
      modelName,
      message: errorMessage(error),
      parsed,
    });
  }
}

function normalizeAtRiskWeekStructuredOutput(
  structured: AtRiskWeekStructuredReasoningOutput
): AtRiskWeekReasoningOutput {
  if (!structured.isAtRisk) {
    return {
      isAtRisk: false,
      severity: null,
      evidence: [],
      recommendedAction: null,
      rationale: structured.rationale,
    };
  }

  if (structured.severity === null || structured.recommendedAction === null) {
    throw new Error('At-risk structured output was parsed without required at-risk fields.');
  }

  const recommendedAction = {
    kind: structured.recommendedAction.kind,
    body: structured.recommendedAction.body,
    ...(structured.recommendedAction.title === null ? {} : { title: structured.recommendedAction.title }),
  };
  const normalized = {
    isAtRisk: true,
    severity: structured.severity,
    evidence: structured.evidence.map((item) => ({
      sourceType: item.sourceType,
      quote: item.quote,
      ...(item.sourceDocumentId === null ? {} : { sourceDocumentId: item.sourceDocumentId }),
      ...(item.observedAt === null ? {} : { observedAt: item.observedAt }),
    })),
    recommendedAction,
    rationale: structured.rationale,
  };

  return atRiskWeekReasoningOutputSchema.parse(normalized);
}

export function recordAtRiskWeekEarlyExit(
  state: AtRiskWeekGraphState,
  earlyExit: AtRiskWeekEarlyExit,
  completedAt: string
): AtRiskWeekGraphState {
  isoDateTimeSchema.parse(completedAt);

  return {
    ...state,
    status: 'exited',
    activeNode: null,
    completedNodes: state.completedNodes.includes(earlyExit.node)
      ? state.completedNodes
      : [...state.completedNodes, earlyExit.node],
    earlyExit,
    trace: {
      ...state.trace,
      materialChangeKey: earlyExit.materialChangeKey,
      branchDecisions: [
        ...state.trace.branchDecisions,
        {
          node: earlyExit.node,
          decision: earlyExit.reason,
          reason: earlyExit.message,
        },
      ],
    },
    completedAt,
  };
}

async function invokeAtRiskWeekReasonerWithRetries(
  state: AtRiskWeekGraphState,
  messages: AtRiskWeekModelMessage[],
  dependencies: AtRiskWeekReasonNodeDependencies
): Promise<AtRiskWeekReasonerResult> {
  const maxAttempts = dependencies.retryPolicy.maxAttempts;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await dependencies.reasoner.invoke(messages);
    } catch (error) {
      const errorDetails = describeAtRiskWeekReasonerError(error);

      if (attempt >= maxAttempts) {
        throw new AtRiskWeekModelInvocationError({
          modelName: dependencies.reasoner.modelName,
          attempts: maxAttempts,
          workspaceId: state.scope.workspaceId,
          scopedDocId: state.scope.scopedDocId,
          runId: state.scope.runId,
          statusCode: errorDetails.statusCode,
          responseBody: errorDetails.responseBody,
          causeMessage: errorDetails.errorMessage,
        });
      }

      dependencies.logger.warn('fleetgraph.at_risk_week.reason_retry', {
        attempt,
        maxAttempts,
        modelName: dependencies.reasoner.modelName,
        workspaceId: state.scope.workspaceId,
        scopedDocId: state.scope.scopedDocId,
        runId: state.scope.runId,
        statusCode: errorDetails.statusCode,
        errorMessage: errorDetails.errorMessage,
      });
      await dependencies.retryPolicy.sleep(dependencies.retryPolicy.delayMs);
    }
  }

  throw new AtRiskWeekNodeContractError('At-risk Week reason retry policy did not allow any model attempts');
}

export function createAtRiskWeekCheckpointConfig(state: AtRiskWeekGraphState): AtRiskWeekCheckpointConfig {
  return {
    configurable: {
      thread_id: state.scope.checkpointThreadId,
      checkpoint_ns: state.scope.checkpointNamespace,
    },
    metadata: {
      detector: atRiskWeekDetectorType,
      triggerSource: state.trace.triggerSource,
      workspaceId: state.scope.workspaceId,
      scopedDocId: state.scope.scopedDocId,
      runId: state.scope.runId,
      materialChangeKey: state.scope.materialChangeKey,
    },
  };
}

export function createAtRiskWeekCheckpointer(): BaseCheckpointSaver {
  return new MemorySaver();
}

export function renderAtRiskWeekReasoningPrompt(state: AtRiskWeekGraphState): AtRiskWeekReasoningPrompt {
  const context = requireAtRiskWeekContext(state, 'reason');
  const guard = requireAtRiskWeekGuard(state, 'reason');
  const preFilter = requireAtRiskWeekPreFilter(state, 'reason');

  return renderAtRiskWeekReasoningPromptFromContext({
    detectorType: atRiskWeekDetectorType,
    workspaceId: state.scope.workspaceId,
    scopedDocId: state.scope.scopedDocId,
    runId: state.scope.runId,
    materialChangeKey: guard.materialChangeKey,
    context,
    preFilter,
  });
}

export class AtRiskWeekNodeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtRiskWeekNodeContractError';
  }
}

type AtRiskWeekModelInvocationErrorInput = {
  modelName: string;
  attempts: number;
  workspaceId: string;
  scopedDocId: string;
  runId: string;
  statusCode: number | null;
  responseBody: string | null;
  causeMessage: string;
};

export class AtRiskWeekModelInvocationError extends Error {
  readonly modelName: string;
  readonly attempts: number;
  readonly workspaceId: string;
  readonly scopedDocId: string;
  readonly runId: string;
  readonly statusCode: number | null;
  readonly responseBody: string | null;

  constructor(input: AtRiskWeekModelInvocationErrorInput) {
    super([
      `At-risk Week reasoning failed after ${input.attempts} attempts`,
      `modelName=${input.modelName}`,
      `workspaceId=${input.workspaceId}`,
      `scopedDocId=${input.scopedDocId}`,
      `runId=${input.runId}`,
      `statusCode=${input.statusCode ?? 'unknown'}`,
      `responseBody=${input.responseBody ?? 'unavailable'}`,
      `errorMessage=${input.causeMessage}`,
    ].join(', '));
    this.name = 'AtRiskWeekModelInvocationError';
    this.modelName = input.modelName;
    this.attempts = input.attempts;
    this.workspaceId = input.workspaceId;
    this.scopedDocId = input.scopedDocId;
    this.runId = input.runId;
    this.statusCode = input.statusCode;
    this.responseBody = input.responseBody;
  }
}

type AtRiskWeekStructuredOutputErrorInput = {
  modelName: string;
  message: string;
  parsed: unknown;
};

export class AtRiskWeekStructuredOutputError extends Error {
  readonly modelName: string;
  readonly parsedOutput: string;

  constructor(input: AtRiskWeekStructuredOutputErrorInput) {
    const parsedOutput = stringifyAtRiskWeekErrorPayload(input.parsed);

    super([
      'At-risk Week structured output parse failed',
      `modelName=${input.modelName}`,
      `errorMessage=${input.message}`,
      `parsedOutput=${parsedOutput}`,
    ].join(', '));
    this.name = 'AtRiskWeekStructuredOutputError';
    this.modelName = input.modelName;
    this.parsedOutput = parsedOutput;
  }
}

type AtRiskWeekBroadcastErrorInput = {
  workspaceId: string;
  scopedDocId: string;
  runId: string;
  findingId: string;
  userId: string;
  message: string;
};

export class AtRiskWeekBroadcastError extends Error {
  readonly workspaceId: string;
  readonly scopedDocId: string;
  readonly runId: string;
  readonly findingId: string;
  readonly userId: string;

  constructor(input: AtRiskWeekBroadcastErrorInput) {
    super([
      'At-risk Week finding broadcast failed',
      `workspaceId=${input.workspaceId}`,
      `scopedDocId=${input.scopedDocId}`,
      `runId=${input.runId}`,
      `findingId=${input.findingId}`,
      `userId=${input.userId}`,
      `errorMessage=${input.message}`,
    ].join(', '));
    this.name = 'AtRiskWeekBroadcastError';
    this.workspaceId = input.workspaceId;
    this.scopedDocId = input.scopedDocId;
    this.runId = input.runId;
    this.findingId = input.findingId;
    this.userId = input.userId;
  }
}

function createAtRiskWeekScopeState(input: AtRiskWeekGraphInput): AtRiskWeekScopeState {
  return {
    workspaceId: input.workspaceId,
    scopedDocId: input.scopedDocId,
    runId: input.runId,
    detectorType: atRiskWeekDetectorType,
    materialChangeKey: null,
    checkpointThreadId: `fleetgraph:at_risk_week:${input.workspaceId}:${input.scopedDocId}:${input.runId}`,
    checkpointNamespace: `fleetgraph:at_risk_week:${input.workspaceId}:${input.scopedDocId}`,
  };
}

function completeAtRiskWeekNode(
  state: AtRiskWeekGraphState,
  completedNode: AtRiskWeekNodeName,
  nextNode: AtRiskWeekNodeName,
  update: Partial<AtRiskWeekGraphState>
): AtRiskWeekGraphState {
  return {
    ...state,
    ...update,
    activeNode: nextNode,
    completedNodes: [...state.completedNodes, completedNode],
  };
}

function requireAtRiskWeekContext(state: AtRiskWeekGraphState, node: AtRiskWeekNodeName): WeekContext {
  if (state.context === null) {
    throw new AtRiskWeekNodeContractError(`At-risk Week ${node} node requires Week context`);
  }

  return state.context;
}

function requireAtRiskWeekGuard(state: AtRiskWeekGraphState, node: AtRiskWeekNodeName): DetectorRunDecision {
  if (state.guard === null) {
    throw new AtRiskWeekNodeContractError(`At-risk Week ${node} node requires guard decision`);
  }

  return state.guard;
}

function requireAtRiskWeekPreFilter(
  state: AtRiskWeekGraphState,
  node: AtRiskWeekNodeName
): AtRiskWeekPreFilterDecision {
  if (state.preFilter === null) {
    throw new AtRiskWeekNodeContractError(`At-risk Week ${node} node requires pre-filter decision`);
  }

  return state.preFilter;
}

function requireAtRiskWeekReasoning(state: AtRiskWeekGraphState, node: AtRiskWeekNodeName): AtRiskWeekReasoningOutput {
  if (state.reasoning === null) {
    throw new AtRiskWeekNodeContractError(`At-risk Week ${node} node requires model reasoning`);
  }

  return state.reasoning;
}

function requireAtRiskWeekPolicy(state: AtRiskWeekGraphState, node: AtRiskWeekNodeName): AtRiskWeekPolicyDecision {
  if (state.policy === null) {
    throw new AtRiskWeekNodeContractError(`At-risk Week ${node} node requires policy decision`);
  }

  return state.policy;
}

function requireAtRiskWeekOutputLifecycle(lifecycleState: FleetGraphLifecycleState): 'open' | 'pending_review' {
  if (lifecycleState === 'open' || lifecycleState === 'pending_review') {
    return lifecycleState;
  }

  throw new AtRiskWeekNodeContractError(
    `At-risk Week output node cannot create new finding with lifecycleState=${lifecycleState}`
  );
}

type BaseMessageWithUsageMetadata = BaseMessage & {
  usage_metadata?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
};

function toLangChainMessage(message: AtRiskWeekModelMessage): BaseMessage {
  if (message.role === 'system') {
    return new SystemMessage(message.content);
  }

  return new HumanMessage(message.content);
}

function extractAtRiskWeekModelUsage(raw: BaseMessage, modelName: string): AtRiskWeekModelUsage | null {
  const usageMetadata = (raw as BaseMessageWithUsageMetadata).usage_metadata;
  const inputTokens = integerOrNull(usageMetadata?.input_tokens);
  const outputTokens = integerOrNull(usageMetadata?.output_tokens);

  if (inputTokens === null || outputTokens === null) {
    return null;
  }

  return {
    modelName,
    inputTokens,
    outputTokens,
    estimatedCost: estimateAtRiskWeekModelCost(modelName, inputTokens, outputTokens),
  };
}

export function estimateAtRiskWeekModelCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number
): number {
  if (!Number.isInteger(inputTokens) || inputTokens < 0) {
    throw new AtRiskWeekNodeContractError(
      `At-risk Week model input token count must be a nonnegative integer: modelName=${modelName}, inputTokens=${inputTokens}`
    );
  }

  if (!Number.isInteger(outputTokens) || outputTokens < 0) {
    throw new AtRiskWeekNodeContractError(
      `At-risk Week model output token count must be a nonnegative integer: modelName=${modelName}, outputTokens=${outputTokens}`
    );
  }

  const pricing = atRiskWeekModelPricingByName[modelName as keyof typeof atRiskWeekModelPricingByName];

  if (!pricing) {
    return 0;
  }

  const cost = (
    inputTokens * pricing.inputUsdPerMillionTokens
    + outputTokens * pricing.outputUsdPerMillionTokens
  ) / 1_000_000;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

function integerOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return null;
}

type AtRiskWeekReasonerErrorDetails = {
  statusCode: number | null;
  errorMessage: string;
  responseBody: string | null;
};

type AtRiskWeekReasonerErrorLike = {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  body?: unknown;
  response?: {
    status?: unknown;
    body?: unknown;
    data?: unknown;
  };
};

function describeAtRiskWeekReasonerError(error: unknown): AtRiskWeekReasonerErrorDetails {
  const errorLike = toAtRiskWeekReasonerErrorLike(error);

  return {
    statusCode: numberOrNull(errorLike.statusCode)
      ?? numberOrNull(errorLike.status)
      ?? numberOrNull(errorLike.response?.status),
    errorMessage: stringOrFallback(errorLike.message, 'Unknown model invocation error'),
    responseBody: responseBodyOrNull(errorLike.response?.data)
      ?? responseBodyOrNull(errorLike.response?.body)
      ?? responseBodyOrNull(errorLike.body),
  };
}

function toAtRiskWeekReasonerErrorLike(error: unknown): AtRiskWeekReasonerErrorLike {
  if (typeof error === 'object' && error !== null) {
    return error as AtRiskWeekReasonerErrorLike;
  }

  return {
    message: String(error),
  };
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return fallback;
}

function responseBodyOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function stringifyAtRiskWeekErrorPayload(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return '[unserializable]';
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
