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

export const FleetGraphFindingTraceSchema = z.object({
  run_id: z.string().min(1).openapi({
    description: 'FleetGraph run identifier recorded with usage metadata',
  }),
  trigger: z.string().min(1).openapi({
    description: 'Trigger source for the agent run',
  }),
  detector: FleetGraphDetectorTypeSchema,
  model_name: z.string().min(1),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  estimated_cost_usd: z.string().openapi({
    description: 'Estimated run cost as a decimal string',
  }),
  branch_path: z.string().nullable().openapi({
    description: 'Graph branch path that produced or exited the finding',
  }),
  trace_url: z.string().url().nullable().openapi({
    description: 'Optional shared Langfuse trace URL',
  }),
  created_at: DateTimeSchema,
}).openapi('FleetGraphFindingTrace');

registry.register('FleetGraphFindingTrace', FleetGraphFindingTraceSchema);

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
  trace: FleetGraphFindingTraceSchema.nullable(),
  action_candidates: z.array(FleetGraphActionCandidateSchema),
}).openapi('FleetGraphFinding');

registry.register('FleetGraphFinding', FleetGraphFindingSchema);

export const FleetGraphLifecycleCountsSchema = z.object({
  open: z.number().int().min(0),
  pending_review: z.number().int().min(0),
  approved: z.number().int().min(0),
  executed: z.number().int().min(0),
  rejected: z.number().int().min(0),
  dismissed: z.number().int().min(0),
  snoozed: z.number().int().min(0),
  expired: z.number().int().min(0),
}).openapi('FleetGraphLifecycleCounts');

registry.register('FleetGraphLifecycleCounts', FleetGraphLifecycleCountsSchema);

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
  lifecycle_counts: FleetGraphLifecycleCountsSchema.openapi({
    description: 'Current workspace finding counts by lifecycle state. Counts are independent of pagination and filters.',
  }),
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

export const FleetGraphChatDocumentTypeSchema = z.enum(['sprint', 'project', 'issue']).openapi({
  description: 'Document types supported by FleetGraph chat context loading',
});

registry.register('FleetGraphChatDocumentType', FleetGraphChatDocumentTypeSchema);

export const FleetGraphChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']).openapi({
    description: 'Conversation message author role',
  }),
  content: z.string().trim().min(1).max(8_000).openapi({
    description: 'Prior conversation message content',
  }),
}).openapi('FleetGraphChatMessage');

registry.register('FleetGraphChatMessage', FleetGraphChatMessageSchema);

export const FleetGraphChatRequestSchema = z.object({
  documentId: UuidSchema.openapi({
    description: 'Scoped Ship document id. Must belong to the authenticated workspace.',
  }),
  documentType: FleetGraphChatDocumentTypeSchema,
  question: z.string().trim().min(1).max(4_000).openapi({
    description: 'User question to answer using only the scoped Ship context',
  }),
  conversationHistory: z.array(FleetGraphChatMessageSchema).max(50).openapi({
    description: 'Bounded prior user/assistant messages. The server uses the most recent 10 messages for model context.',
  }),
}).openapi('FleetGraphChatRequest');

registry.register('FleetGraphChatRequest', FleetGraphChatRequestSchema);

export const FleetGraphChatRateLimitResponseSchema = z.object({
  error: z.string(),
  retry_after_seconds: z.number().int().positive(),
  reset_at: DateTimeSchema,
}).openapi('FleetGraphChatRateLimitResponse');

registry.register('FleetGraphChatRateLimitResponse', FleetGraphChatRateLimitResponseSchema);

export const FleetGraphChatSseStreamSchema = z.string().openapi({
  description: [
    'Server-Sent Events stream. Frames are newline-delimited and use named events:',
    'heartbeat, token, final, and error.',
    'The server sets Cache-Control: no-cache, no-transform and X-Accel-Buffering: no.',
  ].join(' '),
  example: [
    'event: heartbeat',
    'data: {"sentAt":"2026-05-26T12:00:00.000Z"}',
    '',
    'event: token',
    'data: {"token":"The "}',
    '',
    'event: token',
    'data: {"token":"answer"}',
    '',
    'event: final',
    'data: {"response":"The answer","usage":{"modelName":"gpt-4o-mini","inputTokens":12,"outputTokens":4,"totalTokens":16},"sources":[{"label":"Week 14","documentId":"550e8400-e29b-41d4-a716-446655440001","documentType":"sprint","kind":"scope"}]}',
    '',
  ].join('\n'),
});

registry.register('FleetGraphChatSseStream', FleetGraphChatSseStreamSchema);

const fleetGraphErrorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
    },
  },
});

const fleetGraphChatSseEventExamples = {
  heartbeat: {
    summary: 'Heartbeat frame',
    value: 'event: heartbeat\ndata: {"sentAt":"2026-05-26T12:00:00.000Z"}\n\n',
  },
  token: {
    summary: 'Token frame',
    value: 'event: token\ndata: {"token":"The "}\n\n',
  },
  final: {
    summary: 'Final answer frame',
    value: 'event: final\ndata: {"response":"The answer","usage":{"modelName":"gpt-4o-mini","inputTokens":12,"outputTokens":4,"totalTokens":16},"sources":[{"label":"Week 14","documentId":"550e8400-e29b-41d4-a716-446655440001","documentType":"sprint","kind":"scope"}]}\n\n',
  },
  error: {
    summary: 'Post-stream error frame',
    value: 'event: error\ndata: {"error":"FleetGraph chat stream failed"}\n\n',
  },
};

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
  path: '/fleetgraph/chat',
  tags: ['FleetGraph'],
  summary: 'Stream a context-scoped FleetGraph chat answer',
  description: [
    'Starts an on-demand FleetGraph chat response scoped to a sprint, project, or issue document in the current workspace.',
    'Successful responses are streamed as text/event-stream frames with heartbeat, token, final, and error events.',
    'The transport sets Content-Type: text/event-stream, Cache-Control: no-cache, no-transform, Connection: keep-alive, and X-Accel-Buffering: no.',
    'Reverse proxies and CDNs must not buffer or cache this route.',
  ].join(' '),
  request: {
    body: {
      content: {
        'application/json': {
          schema: FleetGraphChatRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'SSE stream of FleetGraph chat events',
      headers: {
        'Cache-Control': {
          description: 'Disables cache and transformation buffering for the stream',
          schema: { type: 'string' },
          example: 'no-cache, no-transform',
        },
        Connection: {
          description: 'Keeps the response connection open for streaming',
          schema: { type: 'string' },
          example: 'keep-alive',
        },
        'X-Accel-Buffering': {
          description: 'Disables nginx response buffering where supported',
          schema: { type: 'string' },
          example: 'no',
        },
      },
      content: {
        'text/event-stream': {
          schema: FleetGraphChatSseStreamSchema,
          examples: fleetGraphChatSseEventExamples,
        },
      },
    },
    400: fleetGraphErrorResponse('Invalid request body'),
    401: fleetGraphErrorResponse('Authentication required'),
    404: fleetGraphErrorResponse('Scoped document not found in the current workspace'),
    429: {
      description: 'Per-user FleetGraph chat rate limit exceeded',
      content: {
        'application/json': {
          schema: FleetGraphChatRateLimitResponseSchema,
        },
      },
    },
    503: fleetGraphErrorResponse('FleetGraph chat is not configured'),
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
