import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import type { DocumentType } from '@ship/shared';

export type FleetGraphLifecycleState =
  | 'open'
  | 'pending_review'
  | 'approved'
  | 'executed'
  | 'rejected'
  | 'dismissed'
  | 'snoozed'
  | 'expired';

export type FleetGraphSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FleetGraphDocumentType = DocumentType;
export type FleetGraphDetectorType =
  | 'at_risk_week'
  | 'stale_blocker'
  | 'missing_standup'
  | 'planless_week'
  | 'scope_creep'
  | 'ownership_unclear';
export type FleetGraphEvidenceSourceType =
  | 'document'
  | 'issue'
  | 'standup'
  | 'iteration'
  | 'accountability'
  | 'finding';
export type FleetGraphActionKind =
  | 'notify'
  | 'draft_comment'
  | 'create_issue'
  | 'update_issue_state'
  | 'assign_issue';
export type FleetGraphApprovalLevel = 'none' | 'notify_only' | 'approval_required';
export type FleetGraphReversibility = 'reversible' | 'partially_reversible' | 'irreversible';
export type FleetGraphUrgency = FleetGraphSeverity;

export interface FleetGraphEvidenceItem {
  source_type: FleetGraphEvidenceSourceType;
  source_document_id?: string;
  quote: string;
  observed_at?: string;
}

export interface FleetGraphRecommendedAction {
  kind: FleetGraphActionKind;
  title?: string;
  body: string;
}

export interface FleetGraphScopedDocument {
  id: string;
  document_type: FleetGraphDocumentType;
  title: string;
}

export interface FleetGraphUser {
  id: string;
  name: string;
  email: string;
}

export interface FleetGraphActionCandidate {
  id: string;
  finding_id: string;
  target_document: FleetGraphScopedDocument;
  owner_user: FleetGraphUser | null;
  role_reason: string;
  urgency: FleetGraphUrgency;
  evidence: FleetGraphEvidenceItem[];
  recommended_action: FleetGraphRecommendedAction;
  approval_level: FleetGraphApprovalLevel;
  reversibility: FleetGraphReversibility;
}

export interface FleetGraphFindingTrace {
  run_id: string;
  trigger: string;
  detector: FleetGraphDetectorType;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: string;
  branch_path: string | null;
  trace_url: string | null;
  created_at: string;
}

export interface FleetGraphFinding {
  id: string;
  workspace_id: string;
  scoped_document: FleetGraphScopedDocument;
  detector_type: FleetGraphDetectorType;
  severity: FleetGraphSeverity;
  evidence: FleetGraphEvidenceItem[];
  recipient_user: FleetGraphUser | null;
  lifecycle_state: FleetGraphLifecycleState;
  material_change_key: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  trace: FleetGraphFindingTrace | null;
  action_candidates: FleetGraphActionCandidate[];
}

export type FleetGraphLifecycleCounts = Record<FleetGraphLifecycleState, number>;

export interface FleetGraphFindingListResponse {
  items: FleetGraphFinding[];
  lifecycle_counts: FleetGraphLifecycleCounts;
  limit: number;
  hasMore: boolean;
  next_cursor: string | null;
}

export interface FleetGraphFindingsFilters {
  lifecycleState?: FleetGraphLifecycleState;
  limit?: number;
  cursor?: string;
}

export interface NormalizedFleetGraphFindingsFilters {
  lifecycleState: FleetGraphLifecycleState | null;
  limit: number;
  cursor: string | null;
}

export interface UseFleetGraphFindingsQueryOptions {
  enabled?: boolean;
}

export interface ApproveFleetGraphFindingInput {
  findingId: string;
  actionCandidateId?: string;
  editedAction?: FleetGraphRecommendedAction | null;
  idempotencyKey?: string;
}

export interface RejectFleetGraphFindingInput {
  findingId: string;
  reason: string;
  idempotencyKey?: string;
}

export interface DismissFleetGraphFindingInput {
  findingId: string;
  reason: string;
  idempotencyKey?: string;
}

export interface SnoozeFleetGraphFindingInput {
  findingId: string;
  reason: string;
  expiresAt: string;
  idempotencyKey?: string;
}

export interface ResumeFleetGraphActionInput {
  actionCandidateId: string;
  idempotencyKey?: string;
}

interface FleetGraphApproveFindingRequest {
  action_candidate_id?: string;
  edited_action?: FleetGraphRecommendedAction | null;
  idempotency_key?: string;
}

interface FleetGraphReasonedMutationRequest {
  reason: string;
  idempotency_key?: string;
}

interface FleetGraphSnoozeFindingRequest {
  reason: string;
  expires_at: string;
  idempotency_key?: string;
}

interface FleetGraphResumeActionRequest {
  idempotency_key?: string;
}

const defaultFleetGraphFindingsLimit = 20;

export class FleetGraphApiError extends Error {
  readonly endpoint: string;
  readonly status: number;
  readonly responseBody: string;

  constructor(operation: string, endpoint: string, status: number, responseBody: string) {
    super(
      `FleetGraph API request failed: operation=${operation}, endpoint=${endpoint}, status=${status}, responseBody=${responseBody}`
    );
    this.name = 'FleetGraphApiError';
    this.endpoint = endpoint;
    this.status = status;
    this.responseBody = responseBody;
  }
}

export const fleetGraphKeys = {
  all: ['fleetgraph'] as const,
  findings: () => [...fleetGraphKeys.all, 'findings'] as const,
  findingsList: (filters: FleetGraphFindingsFilters | null) => [
    ...fleetGraphKeys.findings(),
    'list',
    normalizeFleetGraphFindingsFilters(filters),
  ] as const,
};

export function normalizeFleetGraphFindingsFilters(
  filters: FleetGraphFindingsFilters | null | undefined
): NormalizedFleetGraphFindingsFilters {
  return {
    lifecycleState: filters?.lifecycleState ?? null,
    limit: filters?.limit ?? defaultFleetGraphFindingsLimit,
    cursor: filters?.cursor ?? null,
  };
}

export async function invalidateFleetGraphFindings(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: fleetGraphKeys.findings() });
}

export function updateFleetGraphFindingInCache(
  queryClient: QueryClient,
  finding: FleetGraphFinding
): void {
  queryClient.setQueriesData<FleetGraphFindingListResponse>(
    { queryKey: fleetGraphKeys.findings() },
    (cachedResponse) => {
      if (!cachedResponse) return cachedResponse;

      return {
        ...cachedResponse,
        items: cachedResponse.items.map((cachedFinding) => (
          cachedFinding.id === finding.id ? finding : cachedFinding
        )),
      };
    }
  );
}

export async function fetchFleetGraphFindings(
  filters: FleetGraphFindingsFilters | null | undefined
): Promise<FleetGraphFindingListResponse> {
  const normalizedFilters = normalizeFleetGraphFindingsFilters(filters);
  const endpoint = buildFleetGraphFindingsEndpoint(normalizedFilters);
  const res = await apiGet(endpoint);
  return parseFleetGraphJsonResponse<FleetGraphFindingListResponse>(
    res,
    'list_findings',
    endpoint
  );
}

export function useFleetGraphFindingsQuery(
  filters?: FleetGraphFindingsFilters | null,
  options?: UseFleetGraphFindingsQueryOptions
) {
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: fleetGraphKeys.findingsList(filters ?? null),
    queryFn: () => fetchFleetGraphFindings(filters ?? null),
    staleTime: 1000 * 30,
    enabled,
  });
}

export function useApproveFleetGraphFindingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: approveFleetGraphFinding,
    onSuccess: async (finding) => {
      updateFleetGraphFindingInCache(queryClient, finding);
      await invalidateFleetGraphFindings(queryClient);
    },
  });
}

export function useRejectFleetGraphFindingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: rejectFleetGraphFinding,
    onSuccess: async (finding) => {
      updateFleetGraphFindingInCache(queryClient, finding);
      await invalidateFleetGraphFindings(queryClient);
    },
  });
}

export function useDismissFleetGraphFindingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: dismissFleetGraphFinding,
    onSuccess: async (finding) => {
      updateFleetGraphFindingInCache(queryClient, finding);
      await invalidateFleetGraphFindings(queryClient);
    },
  });
}

export function useSnoozeFleetGraphFindingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: snoozeFleetGraphFinding,
    onSuccess: async (finding) => {
      updateFleetGraphFindingInCache(queryClient, finding);
      await invalidateFleetGraphFindings(queryClient);
    },
  });
}

export function useResumeFleetGraphActionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resumeFleetGraphAction,
    onSuccess: async (finding) => {
      updateFleetGraphFindingInCache(queryClient, finding);
      await invalidateFleetGraphFindings(queryClient);
    },
  });
}

async function approveFleetGraphFinding(
  input: ApproveFleetGraphFindingInput
): Promise<FleetGraphFinding> {
  const endpoint = `/api/fleetgraph/findings/${input.findingId}/approve`;
  const body: FleetGraphApproveFindingRequest = {};

  if (input.actionCandidateId !== undefined) {
    body.action_candidate_id = input.actionCandidateId;
  }
  if (input.editedAction !== undefined) {
    body.edited_action = input.editedAction;
  }
  if (input.idempotencyKey !== undefined) {
    body.idempotency_key = input.idempotencyKey;
  }

  const res = await apiPost(endpoint, body);
  return parseFleetGraphJsonResponse<FleetGraphFinding>(res, 'approve_finding', endpoint);
}

async function rejectFleetGraphFinding(
  input: RejectFleetGraphFindingInput
): Promise<FleetGraphFinding> {
  const endpoint = `/api/fleetgraph/findings/${input.findingId}/reject`;
  const body: FleetGraphReasonedMutationRequest = {
    reason: input.reason,
  };

  if (input.idempotencyKey !== undefined) {
    body.idempotency_key = input.idempotencyKey;
  }

  const res = await apiPost(endpoint, body);
  return parseFleetGraphJsonResponse<FleetGraphFinding>(res, 'reject_finding', endpoint);
}

async function dismissFleetGraphFinding(
  input: DismissFleetGraphFindingInput
): Promise<FleetGraphFinding> {
  const endpoint = `/api/fleetgraph/findings/${input.findingId}/dismiss`;
  const body: FleetGraphReasonedMutationRequest = {
    reason: input.reason,
  };

  if (input.idempotencyKey !== undefined) {
    body.idempotency_key = input.idempotencyKey;
  }

  const res = await apiPost(endpoint, body);
  return parseFleetGraphJsonResponse<FleetGraphFinding>(res, 'dismiss_finding', endpoint);
}

async function snoozeFleetGraphFinding(
  input: SnoozeFleetGraphFindingInput
): Promise<FleetGraphFinding> {
  const endpoint = `/api/fleetgraph/findings/${input.findingId}/snooze`;
  const body: FleetGraphSnoozeFindingRequest = {
    reason: input.reason,
    expires_at: input.expiresAt,
  };

  if (input.idempotencyKey !== undefined) {
    body.idempotency_key = input.idempotencyKey;
  }

  const res = await apiPost(endpoint, body);
  return parseFleetGraphJsonResponse<FleetGraphFinding>(res, 'snooze_finding', endpoint);
}

async function resumeFleetGraphAction(
  input: ResumeFleetGraphActionInput
): Promise<FleetGraphFinding> {
  const endpoint = `/api/fleetgraph/actions/${input.actionCandidateId}/resume`;
  const body: FleetGraphResumeActionRequest = {};

  if (input.idempotencyKey !== undefined) {
    body.idempotency_key = input.idempotencyKey;
  }

  const res = await apiPost(endpoint, body);
  return parseFleetGraphJsonResponse<FleetGraphFinding>(res, 'resume_action', endpoint);
}

function buildFleetGraphFindingsEndpoint(filters: NormalizedFleetGraphFindingsFilters): string {
  const params = new URLSearchParams();

  if (filters.lifecycleState !== null) {
    params.append('lifecycle_state', filters.lifecycleState);
  }

  params.append('limit', filters.limit.toString());

  if (filters.cursor !== null) {
    params.append('cursor', filters.cursor);
  }

  return `/api/fleetgraph/findings?${params.toString()}`;
}

async function parseFleetGraphJsonResponse<T>(
  res: Response,
  operation: string,
  endpoint: string
): Promise<T> {
  const responseBody = await res.text();

  if (!res.ok) {
    throw new FleetGraphApiError(operation, endpoint, res.status, responseBody);
  }

  try {
    return JSON.parse(responseBody) as T;
  } catch {
    throw new FleetGraphApiError(operation, endpoint, res.status, responseBody);
  }
}
