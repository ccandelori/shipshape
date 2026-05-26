/**
 * FleetGraph schemas - agent findings, approval actions, and inbox workflows
 */

import { z, registry } from '../registry.js';
import {
  DateTimeSchema,
  ErrorResponseSchema,
  UserReferenceSchema,
  UuidSchema,
} from './common.js';

export const FleetGraphDetectorTypeSchema = z.enum([
  'at_risk_week',
  'stale_blocker',
  'missing_standup',
  'planless_week',
  'scope_creep',
  'ownership_unclear',
]).openapi({
  description: 'FleetGraph detector that produced the finding',
});

registry.register('FleetGraphDetectorType', FleetGraphDetectorTypeSchema);

export const FleetGraphSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']).openapi({
  description: 'Risk severity assigned by the detector',
});

registry.register('FleetGraphSeverity', FleetGraphSeveritySchema);

export const FleetGraphLifecycleStateSchema = z.enum([
  'open',
  'pending_review',
  'approved',
  'executed',
  'rejected',
  'dismissed',
  'snoozed',
  'expired',
]).openapi({
  description: 'Current state in the FleetGraph finding lifecycle',
});

registry.register('FleetGraphLifecycleState', FleetGraphLifecycleStateSchema);

export const FleetGraphActionKindSchema = z.enum([
  'notify',
  'draft_comment',
  'create_issue',
  'update_issue_state',
  'assign_issue',
]).openapi({
  description: 'Recommended action type',
});

registry.register('FleetGraphActionKind', FleetGraphActionKindSchema);

export const FleetGraphApprovalLevelSchema = z.enum([
  'none',
  'notify_only',
  'approval_required',
]).openapi({
  description: 'Persistence-level approval gate for the action candidate',
});

registry.register('FleetGraphApprovalLevel', FleetGraphApprovalLevelSchema);

export const FleetGraphReversibilitySchema = z.enum([
  'reversible',
  'partially_reversible',
  'irreversible',
]).openapi({
  description: 'How safely the recommended action can be undone after execution',
});

registry.register('FleetGraphReversibility', FleetGraphReversibilitySchema);

export const FleetGraphEvidenceItemSchema = z.object({
  source_type: z.enum(['document', 'issue', 'standup', 'iteration', 'accountability', 'finding']),
  source_document_id: UuidSchema.optional(),
  quote: z.string().min(1).openapi({
    description: 'Evidence quote or extracted signal supporting the finding',
  }),
  observed_at: DateTimeSchema.optional(),
}).openapi('FleetGraphEvidenceItem');

registry.register('FleetGraphEvidenceItem', FleetGraphEvidenceItemSchema);

export const FleetGraphRecommendedActionSchema = z.object({
  kind: FleetGraphActionKindSchema,
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(4_000),
}).openapi('FleetGraphRecommendedAction');

registry.register('FleetGraphRecommendedAction', FleetGraphRecommendedActionSchema);

export const FleetGraphScopedDocumentSchema = z.object({
  id: UuidSchema,
  document_type: z.string().openapi({
    description: 'Ship document type for the scoped document',
  }),
  title: z.string(),
}).openapi('FleetGraphScopedDocument');

registry.register('FleetGraphScopedDocument', FleetGraphScopedDocumentSchema);

export const FleetGraphActionCandidateSchema = z.object({
  id: UuidSchema,
  finding_id: UuidSchema,
  target_document: FleetGraphScopedDocumentSchema,
  owner_user: UserReferenceSchema.nullable(),
  role_reason: z.string().min(1),
  urgency: FleetGraphSeveritySchema,
  evidence: z.array(FleetGraphEvidenceItemSchema).min(1),
  recommended_action: FleetGraphRecommendedActionSchema,
  approval_level: FleetGraphApprovalLevelSchema,
  reversibility: FleetGraphReversibilitySchema,
}).openapi('FleetGraphActionCandidate');

registry.register('FleetGraphActionCandidate', FleetGraphActionCandidateSchema);

export const FleetGraphFindingSchema = z.object({
  id: UuidSchema,
  workspace_id: UuidSchema,
  scoped_document: FleetGraphScopedDocumentSchema,
  detector_type: FleetGraphDetectorTypeSchema,
  severity: FleetGraphSeveritySchema,
  evidence: z.array(FleetGraphEvidenceItemSchema).min(1),
  recipient_user: UserReferenceSchema.nullable(),
  lifecycle_state: FleetGraphLifecycleStateSchema,
  material_change_key: z.string().min(1),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
  expires_at: DateTimeSchema.nullable(),
  action_candidates: z.array(FleetGraphActionCandidateSchema),
}).openapi('FleetGraphFinding');

registry.register('FleetGraphFinding', FleetGraphFindingSchema);

export const FleetGraphFindingListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({
    description: 'Items per page (max 100)',
  }),
  cursor: z.string().min(1).optional().openapi({
    description: 'Opaque cursor returned by the previous page. Encodes the last seen created_at and id.',
  }),
  lifecycle_state: FleetGraphLifecycleStateSchema.optional().openapi({
    description: 'Filter by a single lifecycle_state. Results are always sorted by created_at desc.',
    example: 'pending_review',
  }),
  detector_type: FleetGraphDetectorTypeSchema.optional(),
  recipient_user_id: UuidSchema.optional().openapi({
    description: 'Filter to findings assigned to a recipient user',
  }),
}).openapi('FleetGraphFindingListQuery');

registry.register('FleetGraphFindingListQuery', FleetGraphFindingListQuerySchema);

export const FleetGraphFindingListResponseSchema = z.object({
  items: z.array(FleetGraphFindingSchema),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
  next_cursor: z.string().nullable().openapi({
    description: 'Opaque cursor for the next page, or null when no more findings are available',
  }),
}).openapi('FleetGraphFindingListResponse');

registry.register('FleetGraphFindingListResponse', FleetGraphFindingListResponseSchema);

export const FleetGraphApproveFindingRequestSchema = z.object({
  action_candidate_id: UuidSchema.optional().openapi({
    description: 'Specific action candidate to approve when the finding has multiple candidates',
  }),
  edited_action: FleetGraphRecommendedActionSchema.nullable().optional().openapi({
    description: 'Optional human-edited replacement for the recommended action',
  }),
  idempotency_key: z.string().min(1).max(120).optional().openapi({
    description: 'Client-generated key for safely retrying duplicate approval submissions',
  }),
}).openapi('FleetGraphApproveFindingRequest');

registry.register('FleetGraphApproveFindingRequest', FleetGraphApproveFindingRequestSchema);

export const FleetGraphRejectFindingRequestSchema = z.object({
  reason: z.string().min(1).max(1_000),
  idempotency_key: z.string().min(1).max(120).optional(),
}).openapi('FleetGraphRejectFindingRequest');

registry.register('FleetGraphRejectFindingRequest', FleetGraphRejectFindingRequestSchema);

export const FleetGraphDismissFindingRequestSchema = z.object({
  reason: z.string().min(1).max(1_000),
  idempotency_key: z.string().min(1).max(120).optional(),
}).openapi('FleetGraphDismissFindingRequest');

registry.register('FleetGraphDismissFindingRequest', FleetGraphDismissFindingRequestSchema);

export const FleetGraphSnoozeFindingRequestSchema = z.object({
  reason: z.string().min(1).max(1_000),
  expires_at: DateTimeSchema.openapi({
    description: 'Timestamp when the snoozed finding becomes eligible again',
  }),
  idempotency_key: z.string().min(1).max(120).optional(),
}).openapi('FleetGraphSnoozeFindingRequest');

registry.register('FleetGraphSnoozeFindingRequest', FleetGraphSnoozeFindingRequestSchema);

export const FleetGraphResumeActionRequestSchema = z.object({
  idempotency_key: z.string().min(1).max(120).optional().openapi({
    description: 'Client-generated key for safely retrying duplicate resume submissions',
  }),
}).openapi('FleetGraphResumeActionRequest');

registry.register('FleetGraphResumeActionRequest', FleetGraphResumeActionRequestSchema);

const fleetGraphErrorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/fleetgraph/findings',
  tags: ['FleetGraph'],
  summary: 'List FleetGraph findings',
  description: 'Lists findings for the current workspace, filterable by lifecycle_state and sorted by created_at desc.',
  request: {
    query: FleetGraphFindingListQuerySchema,
  },
  responses: {
    200: {
      description: 'FleetGraph findings for the current workspace',
      content: {
        'application/json': {
          schema: FleetGraphFindingListResponseSchema,
        },
      },
    },
    401: fleetGraphErrorResponse('Authentication required'),
    403: fleetGraphErrorResponse('Current user cannot access this workspace'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/fleetgraph/findings/{id}/approve',
  tags: ['FleetGraph'],
  summary: 'Approve a FleetGraph action candidate',
  description: 'Allowed transition: pending_review -> approved. Duplicate approvals for an already approved finding return 409 unless the same idempotency_key is replayed.',
  request: {
    params: z.object({ id: UuidSchema }),
    body: {
      content: {
        'application/json': {
          schema: FleetGraphApproveFindingRequestSchema,
        },
      },
    },
  },
  responses: fleetGraphFindingMutationResponses('FleetGraph finding approved'),
});

registry.registerPath({
  method: 'post',
  path: '/fleetgraph/findings/{id}/reject',
  tags: ['FleetGraph'],
  summary: 'Reject a FleetGraph action candidate',
  description: 'Allowed transition: pending_review -> rejected. Duplicate or stale submissions return 409.',
  request: {
    params: z.object({ id: UuidSchema }),
    body: {
      content: {
        'application/json': {
          schema: FleetGraphRejectFindingRequestSchema,
        },
      },
    },
  },
  responses: fleetGraphFindingMutationResponses('FleetGraph finding rejected'),
});

registry.registerPath({
  method: 'post',
  path: '/fleetgraph/findings/{id}/dismiss',
  tags: ['FleetGraph'],
  summary: 'Dismiss a FleetGraph finding',
  description: 'Allowed transition: open or pending_review -> dismissed. Creates a dismissed suppression record and stale submissions return 409.',
  request: {
    params: z.object({ id: UuidSchema }),
    body: {
      content: {
        'application/json': {
          schema: FleetGraphDismissFindingRequestSchema,
        },
      },
    },
  },
  responses: fleetGraphFindingMutationResponses('FleetGraph finding dismissed'),
});

registry.registerPath({
  method: 'post',
  path: '/fleetgraph/findings/{id}/snooze',
  tags: ['FleetGraph'],
  summary: 'Snooze a FleetGraph finding',
  description: 'Allowed transition: open or pending_review -> snoozed. Creates a snoozed suppression with expires_at and stale submissions return 409.',
  request: {
    params: z.object({ id: UuidSchema }),
    body: {
      content: {
        'application/json': {
          schema: FleetGraphSnoozeFindingRequestSchema,
        },
      },
    },
  },
  responses: fleetGraphFindingMutationResponses('FleetGraph finding snoozed'),
});

registry.registerPath({
  method: 'post',
  path: '/fleetgraph/actions/{actionId}/resume',
  tags: ['FleetGraph'],
  summary: 'Resume an approved FleetGraph action',
  description: 'Allowed transition: approved -> executed. Only the recipient user or a workspace admin can resume; duplicate execution attempts return 409 unless the same idempotency_key is replayed.',
  request: {
    params: z.object({ actionId: UuidSchema }),
    body: {
      content: {
        'application/json': {
          schema: FleetGraphResumeActionRequestSchema,
        },
      },
    },
  },
  responses: fleetGraphFindingMutationResponses('FleetGraph action resumed and executed'),
});

function fleetGraphFindingMutationResponses(successDescription: string) {
  return {
    200: {
      description: successDescription,
      content: {
        'application/json': {
          schema: FleetGraphFindingSchema,
        },
      },
    },
    400: fleetGraphErrorResponse('Invalid request body'),
    401: fleetGraphErrorResponse('Authentication required'),
    403: fleetGraphErrorResponse('Current user is not allowed to mutate this finding'),
    404: fleetGraphErrorResponse('Finding or action candidate not found in the current workspace'),
    409: fleetGraphErrorResponse('Lifecycle conflict or duplicate submission'),
  };
}
