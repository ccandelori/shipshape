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
