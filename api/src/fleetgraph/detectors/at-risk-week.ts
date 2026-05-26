import { MemorySaver, type BaseCheckpointSaver } from '@langchain/langgraph';
import type { QueryResultRow } from 'pg';
import { z } from 'zod';
import type { FleetGraphQueryClient, WeekContext } from '../context.js';
import type { DetectorRunDecision } from '../guards.js';
import {
  evidenceItemSchema,
  fleetGraphSeveritySchema,
  recommendedActionSchema,
  uuidSchema,
  isoDateTimeSchema,
  type ActionCandidate,
  type FleetGraphApprovalLevel,
  type FleetGraphReversibility,
} from '../types.js';
import { extractText } from '../../utils/document-content.js';

export const atRiskWeekDetectorType = 'at_risk_week';

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

export type AtRiskWeekPreFilterDecision = {
  shouldReason: boolean;
  reason: 'candidate_risk' | 'no_blockers_or_blocked_high_priority_issues';
  evidenceSummary: string[];
};

export const atRiskWeekReasoningOutputSchema = z.discriminatedUnion('isAtRisk', [
  z.object({
    isAtRisk: z.literal(true),
    severity: fleetGraphSeveritySchema,
    evidence: z.array(evidenceItemSchema).min(1),
    recommendedAction: recommendedActionSchema,
    rationale: z.string().min(1),
  }),
  z.object({
    isAtRisk: z.literal(false),
    severity: z.null(),
    evidence: z.array(evidenceItemSchema).length(0),
    recommendedAction: z.null(),
    rationale: z.string().min(1),
  }),
]);
export type AtRiskWeekReasoningOutput = z.infer<typeof atRiskWeekReasoningOutputSchema>;

export type AtRiskWeekPolicyDecision = {
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

export type AtRiskWeekTraceMetadata = {
  detector: typeof atRiskWeekDetectorType;
  triggerSource: AtRiskWeekTriggerSource;
  workspaceId: string;
  scopedDocId: string;
  runId: string;
  materialChangeKey: string | null;
  branchDecisions: AtRiskWeekBranchDecision[];
  modelUsage: AtRiskWeekModelUsage | null;
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
  trace: AtRiskWeekTraceMetadata;
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
      branchDecisions: [],
      modelUsage: null,
    },
    requestedAt: parsedInput.requestedAt,
    completedAt: null,
  };
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
    completedNodes: [...state.completedNodes, earlyExit.node],
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

export class AtRiskWeekNodeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtRiskWeekNodeContractError';
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

function evaluateAtRiskWeekPreFilter(context: WeekContext): AtRiskWeekPreFilterDecision {
  const evidenceSummary = [
    ...context.issues.filter(isHighPriorityBlockedIssue).map((issue) => (
      `High-priority blocked issue: ${issue.title}`
    )),
    ...context.standups.filter(hasStandupBlockerText).map((standup) => (
      `Standup blocker: ${extractText(standup.content).trim()}`
    )),
    ...context.sprintIterations.filter(hasIterationBlockerText).map((iteration) => (
      `Iteration blocker: ${iteration.storyTitle}`
    )),
  ];

  if (evidenceSummary.length === 0) {
    return {
      shouldReason: false,
      reason: 'no_blockers_or_blocked_high_priority_issues',
      evidenceSummary,
    };
  }

  return {
    shouldReason: true,
    reason: 'candidate_risk',
    evidenceSummary,
  };
}

function isHighPriorityBlockedIssue(issue: WeekContext['issues'][number]): boolean {
  return isHighPriority(issue.priority) && issue.state === 'blocked';
}

function isHighPriority(priority: string | null): boolean {
  return priority === 'urgent' || priority === 'high' || priority === 'critical';
}

function hasStandupBlockerText(standup: WeekContext['standups'][number]): boolean {
  return extractText(standup.content).toLowerCase().includes('block');
}

function hasIterationBlockerText(iteration: WeekContext['sprintIterations'][number]): boolean {
  return typeof iteration.blockersEncountered === 'string' && iteration.blockersEncountered.trim().length > 0;
}
