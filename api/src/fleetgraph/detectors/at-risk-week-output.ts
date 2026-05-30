import { isoDateTimeSchema, type FleetGraphLifecycleState, type FleetGraphSeverity } from '../types.js';
import { atRiskWeekDetectorType } from './at-risk-week-constants.js';
import type {
  AtRiskWeekOutputRepository,
  PersistedAtRiskWeekOutput,
} from './at-risk-week-output-repository.js';
import {
  requireAtRiskWeekContext,
  requireAtRiskWeekGuard,
  requireAtRiskWeekOutputLifecycle,
  requireAtRiskWeekPolicy,
  requireAtRiskWeekReasoning,
} from './at-risk-week-evaluator.js';
import {
  AtRiskWeekNodeContractError,
} from './at-risk-week-errors.js';
import type {
  AtRiskWeekGraphState,
  AtRiskWeekPolicyDecision,
  AtRiskWeekReasoningOutput,
} from './at-risk-week.js';

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

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
