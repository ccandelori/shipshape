import { z } from 'zod';
import type { DocumentType } from '@ship/shared';

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export type UUIDString = z.infer<typeof uuidSchema>;
export type ISODateTimeString = z.infer<typeof isoDateTimeSchema>;

export const fleetGraphTriggerSchema = z.enum(['proactive', 'ondemand', 'resume']);
export type FleetGraphTrigger = z.infer<typeof fleetGraphTriggerSchema>;

export const fleetGraphModeSchema = z.enum(['monitor', 'chat', 'approval_resume']);
export type FleetGraphMode = z.infer<typeof fleetGraphModeSchema>;

export const fleetGraphDetectorTypeSchema = z.enum([
  'at_risk_week',
  'stale_blocker',
  'missing_standup',
  'planless_week',
  'scope_creep',
  'ownership_unclear',
]);
export type FleetGraphDetectorType = z.infer<typeof fleetGraphDetectorTypeSchema>;

export const fleetGraphSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type FleetGraphSeverity = z.infer<typeof fleetGraphSeveritySchema>;

export const fleetGraphLifecycleStateSchema = z.enum([
  'open',
  'pending_review',
  'approved',
  'executed',
  'rejected',
  'dismissed',
  'snoozed',
  'expired',
]);
export type FleetGraphLifecycleState = z.infer<typeof fleetGraphLifecycleStateSchema>;

export const fleetGraphEvidenceSourceTypeSchema = z.enum([
  'document',
  'issue',
  'standup',
  'iteration',
  'accountability',
  'finding',
]);
export type FleetGraphEvidenceSourceType = z.infer<typeof fleetGraphEvidenceSourceTypeSchema>;

export const fleetGraphActionKindSchema = z.enum([
  'notify',
  'draft_comment',
  'create_issue',
  'update_issue_state',
  'assign_issue',
]);
export type FleetGraphActionKind = z.infer<typeof fleetGraphActionKindSchema>;

export const fleetGraphApprovalLevelSchema = z.enum(['none', 'notify_only', 'approval_required']);
export type FleetGraphApprovalLevel = z.infer<typeof fleetGraphApprovalLevelSchema>;

export const fleetGraphReversibilitySchema = z.enum(['reversible', 'partially_reversible', 'irreversible']);
export type FleetGraphReversibility = z.infer<typeof fleetGraphReversibilitySchema>;

export const fleetGraphUrgencySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type FleetGraphUrgency = z.infer<typeof fleetGraphUrgencySchema>;

export const approvalDecisionStateSchema = z.enum(['approved', 'rejected', 'edited']);
export type ApprovalDecisionState = z.infer<typeof approvalDecisionStateSchema>;

export const suppressionTypeSchema = z.enum(['dismissed', 'snoozed']);
export type SuppressionType = z.infer<typeof suppressionTypeSchema>;

const documentTypeValues = [
  'wiki',
  'issue',
  'program',
  'project',
  'sprint',
  'person',
  'weekly_plan',
  'weekly_retro',
  'standup',
  'weekly_review',
] as const satisfies readonly DocumentType[];

export const documentTypeSchema = z.enum(documentTypeValues);

export const scopeContextSchema = z.object({
  workspaceId: uuidSchema,
  documentId: uuidSchema,
  documentType: documentTypeSchema,
  projectId: uuidSchema.nullable(),
  weekId: uuidSchema.nullable(),
  programId: uuidSchema.nullable(),
});
export type ScopeContext = z.infer<typeof scopeContextSchema>;

export const evidenceItemSchema = z.object({
  sourceType: fleetGraphEvidenceSourceTypeSchema,
  sourceDocumentId: uuidSchema.optional(),
  quote: z.string().min(1),
  observedAt: isoDateTimeSchema.optional(),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const recommendedActionSchema = z.object({
  kind: fleetGraphActionKindSchema,
  title: z.string().min(1).optional(),
  body: z.string().min(1),
});
export type RecommendedAction = z.infer<typeof recommendedActionSchema>;

export const actionCandidateSchema = z.object({
  targetDocumentId: uuidSchema,
  ownerUserId: uuidSchema.nullable(),
  roleReason: z.string().min(1),
  urgency: fleetGraphUrgencySchema,
  evidence: z.array(evidenceItemSchema).min(1),
  recommendedAction: recommendedActionSchema,
  approvalLevel: fleetGraphApprovalLevelSchema,
  reversibility: fleetGraphReversibilitySchema,
});
export type ActionCandidate = z.infer<typeof actionCandidateSchema>;

export const findingSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  scopedDocumentId: uuidSchema,
  detectorType: fleetGraphDetectorTypeSchema,
  severity: fleetGraphSeveritySchema,
  evidence: z.array(evidenceItemSchema).min(1),
  recipientUserId: uuidSchema,
  lifecycleState: fleetGraphLifecycleStateSchema,
  materialChangeKey: z.string().min(1),
  createdAt: isoDateTimeSchema,
});
export type Finding = z.infer<typeof findingSchema>;

export const approvalDecisionSchema = z.object({
  findingId: uuidSchema,
  actorUserId: uuidSchema,
  decision: approvalDecisionStateSchema,
  editedAction: recommendedActionSchema.nullable(),
  timestamp: isoDateTimeSchema,
});
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const suppressionSchema = z.object({
  findingId: uuidSchema,
  type: suppressionTypeSchema,
  expiresAt: isoDateTimeSchema.nullable(),
  reason: z.string().min(1),
});
export type Suppression = z.infer<typeof suppressionSchema>;

export const usageMetadataSchema = z.object({
  runId: uuidSchema,
  workspaceId: uuidSchema,
  trigger: fleetGraphTriggerSchema,
  detector: fleetGraphDetectorTypeSchema,
  modelName: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative(),
});
export type UsageMetadata = z.infer<typeof usageMetadataSchema>;

export const graphContextSchema = z.object({
  findings: z.array(findingSchema),
  actionCandidates: z.array(actionCandidateSchema),
  suppressions: z.array(suppressionSchema),
  usageMetadata: z.array(usageMetadataSchema),
});
export type GraphContext = z.infer<typeof graphContextSchema>;

export const graphOutputSchema = z.object({
  findings: z.array(findingSchema),
  actionCandidates: z.array(actionCandidateSchema),
  approvalDecisions: z.array(approvalDecisionSchema),
  usageMetadata: z.array(usageMetadataSchema),
  responseText: z.string().min(1).optional(),
});
export type GraphOutput = z.infer<typeof graphOutputSchema>;

export const graphStateSchema = z.object({
  trigger: fleetGraphTriggerSchema,
  mode: fleetGraphModeSchema,
  scope: scopeContextSchema,
  context: graphContextSchema,
  output: graphOutputSchema,
});
export type GraphState = z.infer<typeof graphStateSchema>;
