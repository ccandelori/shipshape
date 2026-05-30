import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { Annotation, END, MemorySaver, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { FleetGraphConfig } from '../config.js';
import type { FleetGraphQueryClient, WeekContext } from '../context.js';
import type { DetectorRunDecision } from '../guards.js';
import type { AtRiskWeekPreFilterDecision } from './at-risk-week-prefilter.js';
import {
  renderAtRiskWeekReasoningPromptFromContext,
  type AtRiskWeekReasoningPrompt,
} from './at-risk-week-prompt.js';
import {
  createFleetGraphLangfuseRunnableConfig,
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
import {
  traceAtRiskWeekNode,
  traceAtRiskWeekRun,
  type AtRiskWeekStateTrace,
  type AtRiskWeekTraceOperation,
  type AtRiskWeekTraceRunner,
} from './at-risk-week-tracing.js';
import {
  AtRiskWeekNodeContractError,
} from './at-risk-week-errors.js';
import {
  completeAtRiskWeekNode,
  contextNode,
  guardNode,
  preFilterNode,
  recordAtRiskWeekEarlyExit,
  requireAtRiskWeekContext,
  requireAtRiskWeekGuard,
  requireAtRiskWeekPreFilter,
  requireAtRiskWeekReasoning,
  scopeNode,
} from './at-risk-week-evaluator.js';
import {
  outputNode,
  type AtRiskWeekOutputNodeDependencies,
} from './at-risk-week-output.js';

export { AtRiskWeekPersistenceError } from './at-risk-week-output-repository.js';
export { AtRiskWeekNodeContractError } from './at-risk-week-errors.js';
export {
  AtRiskWeekBroadcastError,
  outputNode,
  type AtRiskWeekBroadcastPayload,
  type AtRiskWeekOutputNodeDependencies,
} from './at-risk-week-output.js';

export {
  atRiskWeekDetectorType,
  atRiskWeekDetectorVersion,
  atRiskWeekLatencyTargetMs,
  atRiskWeekReasoningModelName,
  atRiskWeekReasoningModelTemperature,
} from './at-risk-week-constants.js';

export {
  createAtRiskWeekLangfusePropagatedMetadata,
  createAtRiskWeekTraceDefinition,
  createAtRiskWeekTraceMetadata,
  createInstrumentedAtRiskWeekTraceRunner,
  createLangfuseAtRiskWeekTraceRunner,
  createLangfuseAtRiskWeekTraceRunnerWithRuntime,
  passthroughAtRiskWeekTraceRunner,
  traceAtRiskWeekNode,
  traceAtRiskWeekRun,
  type AtRiskWeekBranchDecision,
  type AtRiskWeekBranchPath,
  type AtRiskWeekGuardDecision,
  type AtRiskWeekStateTrace,
  type AtRiskWeekTraceClock,
  type AtRiskWeekTraceDefinition,
  type AtRiskWeekTraceInstant,
  type AtRiskWeekTraceMetadata,
  type AtRiskWeekTraceNode,
  type AtRiskWeekTraceOperation,
  type AtRiskWeekTraceRunner,
  type AtRiskWeekTraceTiming,
} from './at-risk-week-tracing.js';

export {
  contextNode,
  guardNode,
  preFilterNode,
  recordAtRiskWeekEarlyExit,
  scopeNode,
} from './at-risk-week-evaluator.js';

export {
  evaluateAtRiskWeekPreFilter,
  type AtRiskWeekPreFilterDecision,
} from './at-risk-week-prefilter.js';

export {
  atRiskWeekPromptBoundary,
  type AtRiskWeekReasoningPrompt,
} from './at-risk-week-prompt.js';

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

      return output.graphState;
    }
  );
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
