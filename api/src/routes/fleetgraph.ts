import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { authMiddleware } from '../middleware/auth.js';

type FleetGraphEvidenceItem = {
  source_type: string;
  source_document_id?: string;
  quote: string;
  observed_at?: string;
};

type FleetGraphRecommendedAction = {
  kind: 'notify' | 'draft_comment' | 'create_issue' | 'update_issue_state' | 'assign_issue';
  title?: string;
  body: string;
};

type FleetGraphScopedDocumentResponse = {
  id: string;
  document_type: string;
  title: string;
};

type FleetGraphUserResponse = {
  id: string;
  name: string;
  email: string;
};

type FleetGraphActionCandidateResponse = {
  id: string;
  finding_id: string;
  target_document: FleetGraphScopedDocumentResponse;
  owner_user: FleetGraphUserResponse | null;
  role_reason: string;
  urgency: string;
  evidence: FleetGraphEvidenceItem[];
  recommended_action: FleetGraphRecommendedAction;
  approval_level: string;
  reversibility: string;
};

type FleetGraphFindingResponse = {
  id: string;
  workspace_id: string;
  scoped_document: FleetGraphScopedDocumentResponse;
  detector_type: string;
  severity: string;
  evidence: FleetGraphEvidenceItem[];
  recipient_user: FleetGraphUserResponse | null;
  lifecycle_state: string;
  material_change_key: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  action_candidates: FleetGraphActionCandidateResponse[];
};

type FleetGraphFindingRow = {
  id: string;
  workspace_id: string;
  scoped_document_id: string;
  scoped_document_type: string;
  scoped_document_title: string;
  detector_type: string;
  severity: string;
  evidence: unknown;
  recipient_user_id: string | null;
  recipient_user_name: string | null;
  recipient_user_email: string | null;
  lifecycle_state: string;
  material_change_key: string;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
};

type FleetGraphActionCandidateRow = {
  id: string;
  finding_id: string;
  target_document_id: string;
  target_document_type: string;
  target_document_title: string;
  owner_user_id: string | null;
  owner_user_name: string | null;
  owner_user_email: string | null;
  role_reason: string;
  urgency: string;
  evidence: unknown;
  recommended_action: string;
  approval_level: string;
  reversibility: string;
};

type FleetGraphCursor = {
  createdAt: string;
  id: string;
};

type FleetGraphFindingQueryInput = {
  lifecycleState?: string;
  cursor?: FleetGraphCursor;
  limit: number;
};

const router = Router();

const fleetGraphLifecycleStateSchema = z.enum([
  'open',
  'pending_review',
  'approved',
  'executed',
  'rejected',
  'dismissed',
  'snoozed',
  'expired',
]);

const fleetGraphFindingsQuerySchema = z.object({
  lifecycle_state: fleetGraphLifecycleStateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

const fleetGraphCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

const recommendedActionSchema = z.object({
  kind: z.enum(['notify', 'draft_comment', 'create_issue', 'update_issue_state', 'assign_issue']),
  title: z.string().min(1).optional(),
  body: z.string().min(1),
});

router.get('/findings', authMiddleware, async (req: Request, res: Response) => {
  const queryResult = parseFleetGraphFindingQuery(req.query);

  if (!queryResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: queryResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  const workspaceId = req.workspaceId;

  if (!workspaceId) {
    res.status(401).json({ error: 'No workspace found for authenticated request' });
    return;
  }

  try {
    const findings = await loadFleetGraphFindings(workspaceId, queryResult.data);
    const visibleFindings = findings.slice(0, queryResult.data.limit);
    const findingIds = visibleFindings.map((finding) => finding.id);
    const actionCandidates = await loadFleetGraphActionCandidates(workspaceId, findingIds);
    const actionCandidatesByFindingId = groupActionCandidatesByFindingId(actionCandidates);
    const hasMore = findings.length > queryResult.data.limit;
    const nextCursor = hasMore
      ? encodeFleetGraphCursor(visibleFindings[visibleFindings.length - 1]!)
      : null;

    res.json({
      items: visibleFindings.map((finding) => mapFindingResponse(
        finding,
        actionCandidatesByFindingId.get(finding.id) ?? []
      )),
      limit: queryResult.data.limit,
      hasMore,
      next_cursor: nextCursor,
    });
  } catch (error) {
    console.error('FleetGraph findings list failed:', error);
    res.status(500).json({ error: 'Failed to list FleetGraph findings' });
  }
});

async function loadFleetGraphFindings(
  workspaceId: string,
  queryInput: FleetGraphFindingQueryInput
): Promise<FleetGraphFindingRow[]> {
  const conditions = ['f.workspace_id = $1'];
  const values: Array<string | number> = [workspaceId];

  if (queryInput.lifecycleState) {
    values.push(queryInput.lifecycleState);
    conditions.push(`f.lifecycle_state = $${values.length}`);
  }

  if (queryInput.cursor) {
    values.push(queryInput.cursor.createdAt);
    values.push(queryInput.cursor.id);
    conditions.push(`(f.created_at, f.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
  }

  values.push(queryInput.limit + 1);

  const result = await pool.query<FleetGraphFindingRow>(
    `SELECT
       f.id,
       f.workspace_id,
       f.scoped_document_id,
       scoped_document.document_type AS scoped_document_type,
       scoped_document.title AS scoped_document_title,
       f.detector_type,
       f.severity,
       f.evidence,
       f.recipient_user_id,
       recipient_user.name AS recipient_user_name,
       recipient_user.email AS recipient_user_email,
       f.lifecycle_state,
       f.material_change_key,
       f.created_at,
       f.updated_at,
       f.expires_at
     FROM fleetgraph_findings f
     INNER JOIN documents scoped_document
       ON scoped_document.id = f.scoped_document_id
      AND scoped_document.workspace_id = f.workspace_id
     LEFT JOIN users recipient_user
       ON recipient_user.id = f.recipient_user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT $${values.length}`,
    values
  );

  return result.rows;
}

async function loadFleetGraphActionCandidates(
  workspaceId: string,
  findingIds: string[]
): Promise<FleetGraphActionCandidateRow[]> {
  if (findingIds.length === 0) {
    return [];
  }

  const result = await pool.query<FleetGraphActionCandidateRow>(
    `SELECT
       action_candidate.id,
       action_candidate.finding_id,
       action_candidate.target_document_id,
       target_document.document_type AS target_document_type,
       target_document.title AS target_document_title,
       action_candidate.owner_user_id,
       owner_user.name AS owner_user_name,
       owner_user.email AS owner_user_email,
       action_candidate.role_reason,
       action_candidate.urgency,
       action_candidate.evidence,
       action_candidate.recommended_action,
       action_candidate.approval_level,
       action_candidate.reversibility
     FROM fleetgraph_action_candidates action_candidate
     INNER JOIN fleetgraph_findings finding
       ON finding.id = action_candidate.finding_id
      AND finding.workspace_id = $2
     INNER JOIN documents target_document
       ON target_document.id = action_candidate.target_document_id
      AND target_document.workspace_id = finding.workspace_id
     LEFT JOIN users owner_user
       ON owner_user.id = action_candidate.owner_user_id
     WHERE action_candidate.finding_id = ANY($1::uuid[])
     ORDER BY action_candidate.id ASC`,
    [findingIds, workspaceId]
  );

  return result.rows;
}

function parseFleetGraphFindingQuery(query: Request['query']) {
  const parsed = fleetGraphFindingsQuerySchema.safeParse(query);

  if (!parsed.success) {
    return parsed;
  }

  if (!parsed.data.cursor) {
    return {
      success: true as const,
      data: {
        lifecycleState: parsed.data.lifecycle_state,
        limit: parsed.data.limit,
      },
    };
  }

  const cursor = decodeFleetGraphCursor(parsed.data.cursor);

  if (!cursor.success) {
    return cursor;
  }

  return {
    success: true as const,
    data: {
      lifecycleState: parsed.data.lifecycle_state,
      cursor: cursor.data,
      limit: parsed.data.limit,
    },
  };
}

function decodeFleetGraphCursor(cursor: string) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsedCursor = fleetGraphCursorSchema.safeParse(decoded);

    if (!parsedCursor.success) {
      return parsedCursor;
    }

    return {
      success: true as const,
      data: parsedCursor.data,
    };
  } catch (_error) {
    return {
      success: false as const,
      error: {
        issues: [{
          path: ['cursor'],
          message: 'Invalid FleetGraph cursor',
        }],
      },
    };
  }
}

function encodeFleetGraphCursor(finding: FleetGraphFindingRow): string {
  const cursor: FleetGraphCursor = {
    createdAt: finding.created_at.toISOString(),
    id: finding.id,
  };

  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function groupActionCandidatesByFindingId(
  actionCandidates: FleetGraphActionCandidateRow[]
): Map<string, FleetGraphActionCandidateRow[]> {
  const grouped = new Map<string, FleetGraphActionCandidateRow[]>();

  for (const actionCandidate of actionCandidates) {
    const existing = grouped.get(actionCandidate.finding_id) ?? [];
    grouped.set(actionCandidate.finding_id, [...existing, actionCandidate]);
  }

  return grouped;
}

function mapFindingResponse(
  finding: FleetGraphFindingRow,
  actionCandidates: FleetGraphActionCandidateRow[]
): FleetGraphFindingResponse {
  return {
    id: finding.id,
    workspace_id: finding.workspace_id,
    scoped_document: {
      id: finding.scoped_document_id,
      document_type: finding.scoped_document_type,
      title: finding.scoped_document_title,
    },
    detector_type: finding.detector_type,
    severity: finding.severity,
    evidence: mapEvidenceItems(finding.evidence),
    recipient_user: mapUserResponse(
      finding.recipient_user_id,
      finding.recipient_user_name,
      finding.recipient_user_email
    ),
    lifecycle_state: finding.lifecycle_state,
    material_change_key: finding.material_change_key,
    created_at: finding.created_at.toISOString(),
    updated_at: finding.updated_at.toISOString(),
    expires_at: finding.expires_at?.toISOString() ?? null,
    action_candidates: actionCandidates.map(mapActionCandidateResponse),
  };
}

function mapActionCandidateResponse(
  actionCandidate: FleetGraphActionCandidateRow
): FleetGraphActionCandidateResponse {
  return {
    id: actionCandidate.id,
    finding_id: actionCandidate.finding_id,
    target_document: {
      id: actionCandidate.target_document_id,
      document_type: actionCandidate.target_document_type,
      title: actionCandidate.target_document_title,
    },
    owner_user: mapUserResponse(
      actionCandidate.owner_user_id,
      actionCandidate.owner_user_name,
      actionCandidate.owner_user_email
    ),
    role_reason: actionCandidate.role_reason,
    urgency: actionCandidate.urgency,
    evidence: mapEvidenceItems(actionCandidate.evidence),
    recommended_action: parseRecommendedAction(actionCandidate.recommended_action),
    approval_level: actionCandidate.approval_level,
    reversibility: actionCandidate.reversibility,
  };
}

function mapUserResponse(
  userId: string | null,
  userName: string | null,
  userEmail: string | null
): FleetGraphUserResponse | null {
  if (!userId || !userName || !userEmail) {
    return null;
  }

  return {
    id: userId,
    name: userName,
    email: userEmail,
  };
}

function parseRecommendedAction(recommendedAction: string): FleetGraphRecommendedAction {
  return recommendedActionSchema.parse(JSON.parse(recommendedAction));
}

function mapEvidenceItems(evidence: unknown): FleetGraphEvidenceItem[] {
  if (!Array.isArray(evidence)) {
    throw new Error('FleetGraph evidence must be an array');
  }

  return evidence.map(mapEvidenceItem);
}

function mapEvidenceItem(evidenceItem: unknown): FleetGraphEvidenceItem {
  if (!isRecord(evidenceItem)) {
    throw new Error('FleetGraph evidence item must be an object');
  }

  const sourceType = requireString(evidenceItem.sourceType ?? evidenceItem.source_type, 'sourceType');
  const sourceDocumentId = optionalString(
    evidenceItem.sourceDocumentId ?? evidenceItem.source_document_id,
    'sourceDocumentId'
  );
  const observedAt = optionalString(evidenceItem.observedAt ?? evidenceItem.observed_at, 'observedAt');

  return {
    source_type: sourceType,
    ...(sourceDocumentId ? { source_document_id: sourceDocumentId } : {}),
    quote: requireString(evidenceItem.quote, 'quote'),
    ...(observedAt ? { observed_at: observedAt } : {}),
  };
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`FleetGraph ${fieldName} must be a non-empty string`);
  }

  return value;
}

function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requireString(value, fieldName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export default router;
