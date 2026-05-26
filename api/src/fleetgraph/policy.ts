import {
  actionCandidateSchema,
  type ActionCandidate,
  type EvidenceItem,
  type FleetGraphActionKind,
  type FleetGraphApprovalLevel,
  type FleetGraphLifecycleState,
  type FleetGraphReversibility,
  type FleetGraphSeverity,
  type RecommendedAction,
} from './types.js';
import type { FleetGraphQueryClient } from './context.js';

export const fleetGraphApprovalPolicyLevels = [
  'auto_answer',
  'quick_confirm',
  'explicit_approval',
] as const;
export type FleetGraphApprovalPolicyLevel = typeof fleetGraphApprovalPolicyLevels[number];

export type FleetGraphApprovalPolicyActionKind = FleetGraphActionKind | 'private_answer';

export type FleetGraphApprovalPolicyDefinition = {
  level: FleetGraphApprovalPolicyLevel;
  summary: string;
  storesPendingAction: boolean;
  visibleWriteAllowed: boolean;
  defaultForAmbiguousAction: boolean;
};

export type FleetGraphApprovalPolicyExample = {
  actionKind: FleetGraphApprovalPolicyActionKind;
  approvalPolicyLevel: FleetGraphApprovalPolicyLevel;
  example: string;
};

export const fleetGraphVisibleWriteActionKinds = [
  'draft_comment',
  'create_issue',
  'update_issue_state',
  'assign_issue',
] as const satisfies readonly FleetGraphActionKind[];

export const fleetGraphApprovalPolicyTaxonomy: Record<
  FleetGraphApprovalPolicyLevel,
  FleetGraphApprovalPolicyDefinition
> = {
  auto_answer: {
    level: 'auto_answer',
    summary: 'Private answer or summary returned only to the requesting user.',
    storesPendingAction: false,
    visibleWriteAllowed: false,
    defaultForAmbiguousAction: false,
  },
  quick_confirm: {
    level: 'quick_confirm',
    summary: 'Low-risk notification or nudge with no durable Ship write in MVP.',
    storesPendingAction: false,
    visibleWriteAllowed: false,
    defaultForAmbiguousAction: false,
  },
  explicit_approval: {
    level: 'explicit_approval',
    summary: 'Any visible write, state change, assignment, or ambiguous action candidate.',
    storesPendingAction: true,
    visibleWriteAllowed: true,
    defaultForAmbiguousAction: true,
  },
};

export const fleetGraphApprovalPolicyExamples: FleetGraphApprovalPolicyExample[] = [
  {
    actionKind: 'private_answer',
    approvalPolicyLevel: 'auto_answer',
    example: 'Answer a scoped chat question without creating or mutating Ship data.',
  },
  {
    actionKind: 'notify',
    approvalPolicyLevel: 'quick_confirm',
    example: 'Surface an FYI risk notification that does not write to a document.',
  },
  {
    actionKind: 'draft_comment',
    approvalPolicyLevel: 'explicit_approval',
    example: 'Prepare a comment for a Week or issue that becomes visible after approval.',
  },
  {
    actionKind: 'create_issue',
    approvalPolicyLevel: 'explicit_approval',
    example: 'Create a follow-up issue for an unresolved blocker.',
  },
  {
    actionKind: 'update_issue_state',
    approvalPolicyLevel: 'explicit_approval',
    example: 'Move a blocked issue to another state.',
  },
  {
    actionKind: 'assign_issue',
    approvalPolicyLevel: 'explicit_approval',
    example: 'Assign an issue owner or change the existing assignee.',
  },
];

export class FleetGraphApprovalPolicyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FleetGraphApprovalPolicyInputError';
  }
}

export type FleetGraphPolicyInput = {
  targetDocumentId: string;
  ownerUserId: string | null;
  roleReason: string;
  severity: FleetGraphSeverity;
  evidence: EvidenceItem[];
  recommendedAction: RecommendedAction;
};

export type FleetGraphPolicyDecision = {
  lifecycleState: FleetGraphLifecycleState;
  approvalLevel: FleetGraphApprovalLevel;
  reversibility: FleetGraphReversibility;
  actionCandidate: ActionCandidate | null;
};

export type FleetGraphPendingActionFinding = {
  id: string;
  workspaceId: string;
  expectedLifecycleState: FleetGraphLifecycleState;
};

type InsertedActionCandidateRow = {
  id: string;
};

type UpdatedFindingRow = {
  id: string;
};

type FleetGraphPendingActionPersistenceErrorInput = {
  findingId: string;
  workspaceId: string;
  message: string;
};

export class FleetGraphPendingActionPersistenceError extends Error {
  readonly findingId: string;
  readonly workspaceId: string;

  constructor(input: FleetGraphPendingActionPersistenceErrorInput) {
    super([
      'FleetGraph pending action persistence failed',
      `findingId=${input.findingId}`,
      `workspaceId=${input.workspaceId}`,
      `errorMessage=${input.message}`,
    ].join(', '));
    this.name = 'FleetGraphPendingActionPersistenceError';
    this.findingId = input.findingId;
    this.workspaceId = input.workspaceId;
  }
}

export function classifyFleetGraphPolicy(input: FleetGraphPolicyInput): FleetGraphPolicyDecision {
  const approvalLevel = classifyPersistenceApprovalLevel(input.recommendedAction);
  const reversibility = classifyReversibility(input.recommendedAction);

  if (approvalLevel === 'notify_only') {
    return {
      lifecycleState: 'open',
      approvalLevel,
      reversibility,
      actionCandidate: null,
    };
  }

  const actionCandidate: ActionCandidate = actionCandidateSchema.parse({
    targetDocumentId: input.targetDocumentId,
    ownerUserId: input.ownerUserId,
    roleReason: input.roleReason,
    urgency: input.severity,
    evidence: input.evidence,
    recommendedAction: input.recommendedAction,
    approvalLevel,
    reversibility,
  });

  return {
    lifecycleState: 'pending_review',
    approvalLevel,
    reversibility,
    actionCandidate,
  };
}

export async function persistPendingAction(
  client: FleetGraphQueryClient,
  finding: FleetGraphPendingActionFinding,
  actionCandidate: ActionCandidate
): Promise<string> {
  try {
    await client.query('BEGIN', []);
    const actionCandidateId = await insertPendingActionCandidate(client, finding.id, actionCandidate);
    await transitionFindingToPendingReview(client, finding);
    await client.query('COMMIT', []);

    return actionCandidateId;
  } catch (error) {
    await rollbackPendingAction(client, finding, error);
    throw new FleetGraphPendingActionPersistenceError({
      findingId: finding.id,
      workspaceId: finding.workspaceId,
      message: errorMessage(error),
    });
  }
}

async function insertPendingActionCandidate(
  client: FleetGraphQueryClient,
  findingId: string,
  actionCandidate: ActionCandidate
): Promise<string> {
  const result = await client.query<InsertedActionCandidateRow>(
    `INSERT INTO fleetgraph_action_candidates (
       finding_id, target_document_id, owner_user_id, role_reason, urgency, evidence,
       recommended_action, approval_level, reversibility
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     RETURNING id`,
    [
      findingId,
      actionCandidate.targetDocumentId,
      actionCandidate.ownerUserId,
      actionCandidate.roleReason,
      actionCandidate.urgency,
      JSON.stringify(actionCandidate.evidence),
      JSON.stringify(actionCandidate.recommendedAction),
      actionCandidate.approvalLevel,
      actionCandidate.reversibility,
    ]
  );
  const row = result.rows[0];

  if (!row) {
    throw new FleetGraphPendingActionPersistenceError({
      findingId,
      workspaceId: 'unknown',
      message: 'fleetgraph_action_candidates insert returned no id',
    });
  }

  return row.id;
}

async function transitionFindingToPendingReview(
  client: FleetGraphQueryClient,
  finding: FleetGraphPendingActionFinding
): Promise<void> {
  const result = await client.query<UpdatedFindingRow>(
    `UPDATE fleetgraph_findings
     SET lifecycle_state = 'pending_review'
     WHERE id = $1
       AND workspace_id = $2
       AND lifecycle_state = $3
     RETURNING id`,
    [finding.id, finding.workspaceId, finding.expectedLifecycleState]
  );

  if (!result.rows[0]) {
    throw new FleetGraphPendingActionPersistenceError({
      findingId: finding.id,
      workspaceId: finding.workspaceId,
      message: `finding lifecycle transition returned no rows: expectedLifecycleState=${finding.expectedLifecycleState}`,
    });
  }
}

async function rollbackPendingAction(
  client: FleetGraphQueryClient,
  finding: FleetGraphPendingActionFinding,
  originalError: unknown
): Promise<void> {
  try {
    await client.query('ROLLBACK', []);
  } catch (rollbackError) {
    throw new FleetGraphPendingActionPersistenceError({
      findingId: finding.id,
      workspaceId: finding.workspaceId,
      message: `rollback failed after ${errorMessage(originalError)}: ${errorMessage(rollbackError)}`,
    });
  }
}

export function classifyApprovalLevel(actionCandidate: unknown): FleetGraphApprovalPolicyLevel {
  const actionKind = requireApprovalActionKind(actionCandidate);

  switch (actionKind) {
    case 'private_answer':
      return 'auto_answer';
    case 'notify':
      return 'quick_confirm';
    case 'draft_comment':
    case 'create_issue':
    case 'update_issue_state':
    case 'assign_issue':
      return 'explicit_approval';
    default:
      return 'explicit_approval';
  }
}

function classifyPersistenceApprovalLevel(recommendedAction: RecommendedAction): FleetGraphApprovalLevel {
  const approvalPolicyLevel = classifyApprovalLevel(recommendedAction);

  if (approvalPolicyLevel === 'quick_confirm') {
    return 'notify_only';
  }

  return 'approval_required';
}

function requireApprovalActionKind(actionCandidate: unknown): string {
  if (!isRecord(actionCandidate)) {
    throw new FleetGraphApprovalPolicyInputError('FleetGraph approval candidate must be an object');
  }

  const kind = actionCandidate.kind;

  if (typeof kind !== 'string' || kind.trim().length === 0) {
    throw new FleetGraphApprovalPolicyInputError(
      'FleetGraph approval candidate kind must be a non-empty string'
    );
  }

  return kind;
}

function classifyReversibility(recommendedAction: RecommendedAction): FleetGraphReversibility {
  if (recommendedAction.kind === 'assign_issue' || recommendedAction.kind === 'update_issue_state') {
    return 'partially_reversible';
  }

  return 'reversible';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
