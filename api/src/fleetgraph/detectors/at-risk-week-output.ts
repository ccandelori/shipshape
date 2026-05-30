import { isoDateTimeSchema, type FleetGraphLifecycleState, type FleetGraphSeverity } from '../types.js';
import { atRiskWeekDetectorType } from './at-risk-week-constants.js';
import type {
  AtRiskWeekOutputRepository,
  AtRiskWeekOutputPersistenceInput,
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
  AtRiskWeekReasoningOutput,
} from './at-risk-week.js';
import type { AtRiskWeekPolicyDecision } from './at-risk-week-policy.js';

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

export type AtRiskWeekOutputEffectInput = {
  workspaceId: string;
  scopedDocId: string;
  runId: string;
  ownerUserId: string | null;
  materialChangeKey: string;
  reasoning: AtRiskWeekReasoningOutput;
  policy: AtRiskWeekPolicyDecision;
  lifecycleState: 'open' | 'pending_review';
};

export type AtRiskWeekBroadcastEffect = {
  userId: string;
  eventType: 'fleetgraph:finding_created';
  payload: Omit<AtRiskWeekBroadcastPayload, 'findingId' | 'actionCandidateId' | 'lifecycleState'>;
};

export type AtRiskWeekOutputEffect = {
  persistence: AtRiskWeekOutputPersistenceInput;
  broadcast: AtRiskWeekBroadcastEffect | null;
};

export function createAtRiskWeekOutputEffect(input: AtRiskWeekOutputEffectInput): AtRiskWeekOutputEffect {
  if (!input.reasoning.isAtRisk) {
    throw new AtRiskWeekNodeContractError('At-risk Week output effect requires at-risk reasoning');
  }

  return {
    persistence: {
      workspaceId: input.workspaceId,
      scopedDocId: input.scopedDocId,
      runId: input.runId,
      detectorType: atRiskWeekDetectorType,
      severity: input.reasoning.severity,
      evidence: input.reasoning.evidence,
      recipientUserId: input.ownerUserId,
      lifecycleState: input.lifecycleState,
      materialChangeKey: input.materialChangeKey,
      actionCandidate: input.policy.actionCandidate,
    },
    broadcast: input.ownerUserId === null
      ? null
      : {
          userId: input.ownerUserId,
          eventType: 'fleetgraph:finding_created',
          payload: {
            workspaceId: input.workspaceId,
            scopedDocumentId: input.scopedDocId,
            detectorType: atRiskWeekDetectorType,
            severity: input.reasoning.severity,
          },
        },
  };
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
  const outputEffect = createAtRiskWeekOutputEffect({
    workspaceId: state.scope.workspaceId,
    scopedDocId: state.scope.scopedDocId,
    runId: state.scope.runId,
    ownerUserId: context.ownerUserId,
    materialChangeKey: guard.materialChangeKey,
    reasoning,
    policy,
    lifecycleState,
  });
  const persistence = await dependencies.outputRepository.persistOutput(outputEffect.persistence);

  if (outputEffect.broadcast !== null) {
    broadcastAtRiskWeekFindingCreated(
      state,
      outputEffect.broadcast,
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
  effect: AtRiskWeekBroadcastEffect,
  persistence: PersistedAtRiskWeekOutput,
  dependencies: AtRiskWeekOutputNodeDependencies
): void {
  try {
    dependencies.broadcastToUser(effect.userId, effect.eventType, {
      ...effect.payload,
      findingId: persistence.findingId,
      actionCandidateId: persistence.actionCandidateId,
      lifecycleState: persistence.lifecycleState,
    });
  } catch (error) {
    throw new AtRiskWeekBroadcastError({
      workspaceId: state.scope.workspaceId,
      scopedDocId: state.scope.scopedDocId,
      runId: state.scope.runId,
      findingId: persistence.findingId,
      userId: effect.userId,
      message: errorMessage(error),
    });
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
