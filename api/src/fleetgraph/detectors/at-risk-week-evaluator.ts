import type { QueryResultRow } from 'pg';
import type { WeekContext } from '../context.js';
import type { DetectorRunDecision } from '../guards.js';
import { isoDateTimeSchema, type FleetGraphLifecycleState } from '../types.js';
import {
  evaluateAtRiskWeekPreFilter,
  type AtRiskWeekPreFilterDecision,
} from './at-risk-week-prefilter.js';
import { AtRiskWeekNodeContractError } from './at-risk-week-errors.js';
import type {
  AtRiskWeekEarlyExit,
  AtRiskWeekGraphState,
  AtRiskWeekNodeDependencies,
  AtRiskWeekNodeName,
  AtRiskWeekReasoningOutput,
} from './at-risk-week.js';
import type { AtRiskWeekPolicyDecision } from './at-risk-week-policy.js';

type ScopeResolutionRow = QueryResultRow & {
  id: string;
};

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

export function completeAtRiskWeekNode(
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

export function requireAtRiskWeekContext(state: AtRiskWeekGraphState, node: AtRiskWeekNodeName): WeekContext {
  if (state.context === null) {
    throw new AtRiskWeekNodeContractError(`At-risk Week ${node} node requires Week context`);
  }

  return state.context;
}

export function requireAtRiskWeekGuard(state: AtRiskWeekGraphState, node: AtRiskWeekNodeName): DetectorRunDecision {
  if (state.guard === null) {
    throw new AtRiskWeekNodeContractError(`At-risk Week ${node} node requires guard decision`);
  }

  return state.guard;
}

export function requireAtRiskWeekPreFilter(
  state: AtRiskWeekGraphState,
  node: AtRiskWeekNodeName
): AtRiskWeekPreFilterDecision {
  if (state.preFilter === null) {
    throw new AtRiskWeekNodeContractError(`At-risk Week ${node} node requires pre-filter decision`);
  }

  return state.preFilter;
}

export function requireAtRiskWeekReasoning(
  state: AtRiskWeekGraphState,
  node: AtRiskWeekNodeName
): AtRiskWeekReasoningOutput {
  if (state.reasoning === null) {
    throw new AtRiskWeekNodeContractError(`At-risk Week ${node} node requires model reasoning`);
  }

  return state.reasoning;
}

export function requireAtRiskWeekPolicy(state: AtRiskWeekGraphState, node: AtRiskWeekNodeName): AtRiskWeekPolicyDecision {
  if (state.policy === null) {
    throw new AtRiskWeekNodeContractError(`At-risk Week ${node} node requires policy decision`);
  }

  return state.policy;
}

export function requireAtRiskWeekOutputLifecycle(lifecycleState: FleetGraphLifecycleState): 'open' | 'pending_review' {
  if (lifecycleState === 'open' || lifecycleState === 'pending_review') {
    return lifecycleState;
  }

  throw new AtRiskWeekNodeContractError(
    `At-risk Week output node cannot create new finding with lifecycleState=${lifecycleState}`
  );
}
