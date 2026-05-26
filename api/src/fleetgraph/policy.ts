import {
  actionCandidateSchema,
  type ActionCandidate,
  type EvidenceItem,
  type FleetGraphApprovalLevel,
  type FleetGraphLifecycleState,
  type FleetGraphReversibility,
  type FleetGraphSeverity,
  type RecommendedAction,
} from './types.js';

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
  const approvalLevel = classifyApprovalLevel(input.recommendedAction);
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

function classifyApprovalLevel(recommendedAction: RecommendedAction): FleetGraphApprovalLevel {
  if (recommendedAction.kind === 'notify') {
    return 'notify_only';
  }

  return 'approval_required';
}

function classifyReversibility(recommendedAction: RecommendedAction): FleetGraphReversibility {
  if (recommendedAction.kind === 'assign_issue' || recommendedAction.kind === 'update_issue_state') {
    return 'partially_reversible';
  }

  return 'reversible';
}
