import { Annotation, END, MemorySaver, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { z } from 'zod';
import type { FleetGraphQueryClient, WeekContext } from '../context.js';
import type { DetectorRunDecision } from '../guards.js';
import type { AtRiskWeekPreFilterDecision } from './at-risk-week-prefilter.js';
import { classifyFleetGraphPolicy } from '../policy.js';
import {
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
  requireAtRiskWeekContext,
  requireAtRiskWeekReasoning,
  scopeNode,
} from './at-risk-week-evaluator.js';
import {
  outputNode,
  type AtRiskWeekOutputNodeDependencies,
} from './at-risk-week-output.js';
import {
  reasonNode,
  type AtRiskWeekModelUsage,
  type AtRiskWeekReasoningOutput,
  type AtRiskWeekReasonNodeDependencies,
} from './at-risk-week-reasoner.js';

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

export {
  atRiskWeekReasoningOutputSchema,
  atRiskWeekStructuredReasoningOutputSchema,
  createLangChainAtRiskWeekReasoner,
  createOpenAIAtRiskWeekReasoner,
  estimateAtRiskWeekModelCost,
  renderAtRiskWeekReasoningPrompt,
  reasonNode,
  AtRiskWeekModelInvocationError,
  AtRiskWeekStructuredOutputError,
  type AtRiskWeekModelMessage,
  type AtRiskWeekModelUsage,
  type AtRiskWeekReasonerResult,
  type AtRiskWeekReasoningOutput,
  type AtRiskWeekReasonNodeDependencies,
  type AtRiskWeekReasonNodeLogger,
  type AtRiskWeekRetryPolicy,
  type AtRiskWeekRunnableConfigFactory,
  type AtRiskWeekStructuredModelInvoker,
  type AtRiskWeekStructuredModelResult,
  type AtRiskWeekStructuredReasoner,
} from './at-risk-week-reasoner.js';

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
