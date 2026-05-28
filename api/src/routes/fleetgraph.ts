import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { broadcastToUser } from '../collaboration/index.js';
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

type FleetGraphFindingTraceResponse = {
  run_id: string;
  trigger: string;
  detector: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: string;
  branch_path: string | null;
  trace_url: string | null;
  created_at: string;
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
  trace: FleetGraphFindingTraceResponse | null;
  action_candidates: FleetGraphActionCandidateResponse[];
};

const fleetGraphLifecycleStates = [
  'open',
  'pending_review',
  'approved',
  'executed',
  'rejected',
  'dismissed',
  'snoozed',
  'expired',
] as const;

type FleetGraphLifecycleState = typeof fleetGraphLifecycleStates[number];

type FleetGraphLifecycleCounts = Record<FleetGraphLifecycleState, number>;

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

type FleetGraphLifecycleCountRow = {
  lifecycle_state: FleetGraphLifecycleState;
  count: string;
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

type FleetGraphFindingTraceRow = {
  finding_id: string;
  run_id: string;
  trigger: string;
  detector: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: string;
  branch_path: string | null;
  trace_url: string | null;
  created_at: Date;
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

type FleetGraphActorContext = {
  workspaceId: string;
  userId: string;
  isWorkspaceAdmin: boolean;
};

type FleetGraphFindingMutation = 'approved' | 'rejected' | 'dismissed' | 'snoozed' | 'executed';

type FleetGraphDecisionFindingRow = {
  id: string;
  recipient_user_id: string | null;
  lifecycle_state: string;
};

type FleetGraphActionCandidateIdRow = {
  id: string;
};

type FleetGraphResumeActionRow = {
  action_candidate_id: string;
  finding_id: string;
  workspace_id: string;
  scoped_document_id: string;
  recipient_user_id: string | null;
  lifecycle_state: string;
  target_document_id: string;
  recommended_action: string;
  edited_action: string | null;
};

type FleetGraphActionExecutionRow = {
  idempotency_key: string | null;
  result: unknown;
};

type FleetGraphActionExecutionResult = {
  kind: 'draft_comment';
  documentId: string;
  commentId: string;
  commentThreadId: string;
};

type InsertedCommentRow = {
  id: string;
  comment_id: string;
};

type UpdatedFleetGraphFindingRow = {
  id: string;
};

type FleetGraphWorkspaceMemberRow = {
  user_id: string;
};

type FleetGraphFindingIdRow = {
  id: string;
};

type FleetGraphDecisionResult = {
  success: true;
  finding: FleetGraphFindingResponse;
  mutationApplied: boolean;
} | {
  success: false;
  statusCode: number;
  error: string;
};

type FleetGraphReadMarkingResult = {
  success: true;
} | {
  success: false;
  statusCode: number;
  error: string;
};

const router = Router();

const fleetGraphLifecycleStateSchema = z.enum(fleetGraphLifecycleStates);

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

const fleetGraphFindingParamsSchema = z.object({
  id: z.string().uuid(),
});

const fleetGraphActionParamsSchema = z.object({
  actionId: z.string().uuid(),
});

const fleetGraphApproveBodySchema = z.object({
  action_candidate_id: z.string().uuid().optional(),
  edited_action: recommendedActionSchema.nullable().optional(),
  idempotency_key: z.string().min(1).max(120).optional(),
});

const fleetGraphRejectBodySchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  idempotency_key: z.string().min(1).max(120).optional(),
});

const fleetGraphDismissBodySchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  idempotency_key: z.string().min(1).max(120).optional(),
});

const fleetGraphSnoozeBodySchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  expires_at: z.string().datetime({ offset: true }),
  idempotency_key: z.string().min(1).max(120).optional(),
});

const fleetGraphResumeBodySchema = z.object({
  idempotency_key: z.string().trim().min(1).max(120).optional(),
});

const fleetGraphMarkReadBodySchema = z.object({
  finding_ids: z.array(z.string().uuid()).min(1).max(100),
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
  const userId = req.userId;

  if (!workspaceId) {
    res.status(401).json({ error: 'No workspace found for authenticated request' });
    return;
  }
  if (!userId) {
    res.status(401).json({ error: 'No user found for authenticated request' });
    return;
  }

  try {
    const [findings, lifecycleCounts, unreadLifecycleCounts] = await Promise.all([
      loadFleetGraphFindings(workspaceId, queryResult.data),
      loadFleetGraphFindingLifecycleCounts(workspaceId),
      loadFleetGraphUnreadLifecycleCounts(workspaceId, userId),
    ]);
    const visibleFindings = findings.slice(0, queryResult.data.limit);
    const findingIds = visibleFindings.map((finding) => finding.id);
    const actionCandidates = await loadFleetGraphActionCandidates(workspaceId, findingIds);
    const actionCandidatesByFindingId = groupActionCandidatesByFindingId(actionCandidates);
    const tracesByFindingId = await loadFleetGraphFindingTraces(workspaceId, findingIds);
    const hasMore = findings.length > queryResult.data.limit;
    const nextCursor = hasMore
      ? encodeFleetGraphCursor(visibleFindings[visibleFindings.length - 1]!)
      : null;

    res.json({
      items: visibleFindings.map((finding) => mapFindingResponse(
        finding,
        actionCandidatesByFindingId.get(finding.id) ?? [],
        tracesByFindingId.get(finding.id) ?? null
      )),
      lifecycle_counts: lifecycleCounts,
      unread_lifecycle_counts: unreadLifecycleCounts,
      limit: queryResult.data.limit,
      hasMore,
      next_cursor: nextCursor,
    });
  } catch (error) {
    console.error('FleetGraph findings list failed:', error);
    res.status(500).json({ error: 'Failed to list FleetGraph findings' });
  }
});

router.post('/inbox/opened', authMiddleware, async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  const userId = req.userId;

  if (!workspaceId) {
    res.status(401).json({ error: 'No workspace found for authenticated request' });
    return;
  }
  if (!userId) {
    res.status(401).json({ error: 'No user found for authenticated request' });
    return;
  }

  try {
    await markFleetGraphInboxOpened(workspaceId, userId);
    res.status(204).send();
  } catch (error) {
    console.error('FleetGraph inbox open watermark failed:', error);
    res.status(500).json({ error: 'Failed to mark FleetGraph inbox opened' });
  }
});

router.post('/findings/read', authMiddleware, async (req: Request, res: Response) => {
  const bodyResult = fleetGraphMarkReadBodySchema.safeParse(req.body ?? {});
  const workspaceId = req.workspaceId;
  const userId = req.userId;

  if (!bodyResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: bodyResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!workspaceId) {
    res.status(401).json({ error: 'No workspace found for authenticated request' });
    return;
  }
  if (!userId) {
    res.status(401).json({ error: 'No user found for authenticated request' });
    return;
  }

  try {
    const result = await markFleetGraphFindingsRead({
      workspaceId,
      userId,
      findingIds: bodyResult.data.finding_ids,
    });

    if (!result.success) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('FleetGraph finding read marking failed:', error);
    res.status(500).json({ error: 'Failed to mark FleetGraph findings read' });
  }
});

router.post('/actions/:actionId/resume', authMiddleware, async (req: Request, res: Response) => {
  const paramsResult = fleetGraphActionParamsSchema.safeParse(req.params);
  const bodyResult = fleetGraphResumeBodySchema.safeParse(req.body ?? {});
  const actorContext = getFleetGraphActorContext(req);

  if (!paramsResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: paramsResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!bodyResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: bodyResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!actorContext.success) {
    res.status(actorContext.statusCode).json({ error: actorContext.error });
    return;
  }

  try {
    const result = await resumeFleetGraphAction({
      actionCandidateId: paramsResult.data.actionId,
      actorContext: actorContext.data,
      idempotencyKey: bodyResult.data.idempotency_key,
    });

    if (!result.success) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }

    if (result.mutationApplied) {
      await broadcastFleetGraphFindingUpdated(
        result.finding,
        'executed',
        paramsResult.data.actionId
      );
    }

    res.json(result.finding);
  } catch (error) {
    console.error('FleetGraph action resume failed:', error);
    res.status(500).json({ error: 'Failed to resume FleetGraph action' });
  }
});

router.post('/findings/:id/snooze', authMiddleware, async (req: Request, res: Response) => {
  const paramsResult = fleetGraphFindingParamsSchema.safeParse(req.params);
  const bodyResult = fleetGraphSnoozeBodySchema.safeParse(req.body ?? {});
  const actorContext = getFleetGraphActorContext(req);

  if (!paramsResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: paramsResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!bodyResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: bodyResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!actorContext.success) {
    res.status(actorContext.statusCode).json({ error: actorContext.error });
    return;
  }

  const expiresAt = new Date(bodyResult.data.expires_at);

  if (expiresAt.getTime() <= Date.now()) {
    res.status(400).json({ error: 'expires_at must be in the future' });
    return;
  }

  try {
    const result = await snoozeFleetGraphFinding({
      findingId: paramsResult.data.id,
      actorContext: actorContext.data,
      reason: bodyResult.data.reason,
      expiresAt,
    });

    if (!result.success) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }

    if (result.mutationApplied) {
      await broadcastFleetGraphFindingUpdated(result.finding, 'snoozed', null);
    }

    res.json(result.finding);
  } catch (error) {
    console.error('FleetGraph finding snooze failed:', error);
    res.status(500).json({ error: 'Failed to snooze FleetGraph finding' });
  }
});

router.post('/findings/:id/dismiss', authMiddleware, async (req: Request, res: Response) => {
  const paramsResult = fleetGraphFindingParamsSchema.safeParse(req.params);
  const bodyResult = fleetGraphDismissBodySchema.safeParse(req.body ?? {});
  const actorContext = getFleetGraphActorContext(req);

  if (!paramsResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: paramsResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!bodyResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: bodyResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!actorContext.success) {
    res.status(actorContext.statusCode).json({ error: actorContext.error });
    return;
  }

  try {
    const result = await dismissFleetGraphFinding({
      findingId: paramsResult.data.id,
      actorContext: actorContext.data,
      reason: bodyResult.data.reason,
    });

    if (!result.success) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }

    if (result.mutationApplied) {
      await broadcastFleetGraphFindingUpdated(result.finding, 'dismissed', null);
    }

    res.json(result.finding);
  } catch (error) {
    console.error('FleetGraph finding dismissal failed:', error);
    res.status(500).json({ error: 'Failed to dismiss FleetGraph finding' });
  }
});

router.post('/findings/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  const paramsResult = fleetGraphFindingParamsSchema.safeParse(req.params);
  const bodyResult = fleetGraphRejectBodySchema.safeParse(req.body ?? {});
  const actorContext = getFleetGraphActorContext(req);

  if (!paramsResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: paramsResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!bodyResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: bodyResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!actorContext.success) {
    res.status(actorContext.statusCode).json({ error: actorContext.error });
    return;
  }

  try {
    const result = await rejectFleetGraphFinding({
      findingId: paramsResult.data.id,
      actorContext: actorContext.data,
      reason: bodyResult.data.reason,
    });

    if (!result.success) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }

    if (result.mutationApplied) {
      await broadcastFleetGraphFindingUpdated(result.finding, 'rejected', null);
    }

    res.json(result.finding);
  } catch (error) {
    console.error('FleetGraph finding rejection failed:', error);
    res.status(500).json({ error: 'Failed to reject FleetGraph finding' });
  }
});

router.post('/findings/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  const paramsResult = fleetGraphFindingParamsSchema.safeParse(req.params);
  const bodyResult = fleetGraphApproveBodySchema.safeParse(req.body ?? {});
  const actorContext = getFleetGraphActorContext(req);

  if (!paramsResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: paramsResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!bodyResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: bodyResult.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (!actorContext.success) {
    res.status(actorContext.statusCode).json({ error: actorContext.error });
    return;
  }

  try {
    const result = await approveFleetGraphFinding({
      findingId: paramsResult.data.id,
      actorContext: actorContext.data,
      actionCandidateId: bodyResult.data.action_candidate_id,
      editedAction: bodyResult.data.edited_action ?? null,
    });

    if (!result.success) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }

    if (result.mutationApplied) {
      await broadcastFleetGraphFindingUpdated(
        result.finding,
        'approved',
        resolveApprovedActionCandidateId(result.finding, bodyResult.data.action_candidate_id)
      );
    }

    res.json(result.finding);
  } catch (error) {
    console.error('FleetGraph finding approval failed:', error);
    res.status(500).json({ error: 'Failed to approve FleetGraph finding' });
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

async function loadFleetGraphFindingLifecycleCounts(workspaceId: string): Promise<FleetGraphLifecycleCounts> {
  const result = await pool.query<FleetGraphLifecycleCountRow>(
    `SELECT lifecycle_state, COUNT(*)::text AS count
     FROM fleetgraph_findings
     WHERE workspace_id = $1
     GROUP BY lifecycle_state`,
    [workspaceId]
  );
  const counts = createEmptyFleetGraphLifecycleCounts();

  for (const row of result.rows) {
    counts[row.lifecycle_state] = Number.parseInt(row.count, 10);
  }

  return counts;
}

async function loadFleetGraphUnreadLifecycleCounts(
  workspaceId: string,
  userId: string
): Promise<FleetGraphLifecycleCounts> {
  const result = await pool.query<FleetGraphLifecycleCountRow>(
    `SELECT lifecycle_state, COUNT(*)::text AS count
     FROM fleetgraph_findings finding
     WHERE finding.workspace_id = $1
       AND finding.lifecycle_state IN ('open', 'pending_review', 'approved')
       AND NOT EXISTS (
         SELECT 1
         FROM fleetgraph_finding_reads finding_read
         WHERE finding_read.finding_id = finding.id
           AND finding_read.workspace_id = finding.workspace_id
           AND finding_read.user_id = $2
       )
     GROUP BY finding.lifecycle_state`,
    [workspaceId, userId]
  );
  const counts = createEmptyFleetGraphLifecycleCounts();

  for (const row of result.rows) {
    counts[row.lifecycle_state] = Number.parseInt(row.count, 10);
  }

  return counts;
}

async function markFleetGraphInboxOpened(workspaceId: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO fleetgraph_inbox_reads (workspace_id, user_id, last_opened_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (workspace_id, user_id)
     DO UPDATE SET last_opened_at = EXCLUDED.last_opened_at`,
    [workspaceId, userId]
  );
}

async function markFleetGraphFindingsRead(input: {
  workspaceId: string;
  userId: string;
  findingIds: string[];
}): Promise<FleetGraphReadMarkingResult> {
  const findingIds = Array.from(new Set(input.findingIds));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const visibleFindingResult = await client.query<FleetGraphFindingIdRow>(
      `SELECT id
       FROM fleetgraph_findings
       WHERE workspace_id = $1
         AND id = ANY($2::uuid[])`,
      [input.workspaceId, findingIds]
    );

    if (visibleFindingResult.rowCount !== findingIds.length) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 404,
        error: 'FleetGraph finding not found',
      };
    }

    await client.query(
      `INSERT INTO fleetgraph_finding_reads (finding_id, workspace_id, user_id, read_at)
       SELECT id, workspace_id, $3, NOW()
       FROM fleetgraph_findings
       WHERE workspace_id = $1
         AND id = ANY($2::uuid[])
       ON CONFLICT (finding_id, user_id)
       DO UPDATE SET read_at = EXCLUDED.read_at`,
      [input.workspaceId, findingIds, input.userId]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function createEmptyFleetGraphLifecycleCounts(): FleetGraphLifecycleCounts {
  return {
    open: 0,
    pending_review: 0,
    approved: 0,
    executed: 0,
    rejected: 0,
    dismissed: 0,
    snoozed: 0,
    expired: 0,
  };
}

async function loadFleetGraphFindingById(
  workspaceId: string,
  findingId: string
): Promise<FleetGraphFindingResponse | null> {
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
     WHERE f.workspace_id = $1
       AND f.id = $2`,
    [workspaceId, findingId]
  );

  const finding = result.rows[0];

  if (!finding) {
    return null;
  }

  const actionCandidates = await loadFleetGraphActionCandidates(workspaceId, [finding.id]);
  const tracesByFindingId = await loadFleetGraphFindingTraces(workspaceId, [finding.id]);

  return mapFindingResponse(finding, actionCandidates, tracesByFindingId.get(finding.id) ?? null);
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

async function loadFleetGraphFindingTraces(
  workspaceId: string,
  findingIds: string[]
): Promise<Map<string, FleetGraphFindingTraceRow>> {
  if (findingIds.length === 0) {
    return new Map();
  }

  const result = await pool.query<FleetGraphFindingTraceRow>(
    `SELECT DISTINCT ON (usage.trace_metadata->>'findingId')
       usage.trace_metadata->>'findingId' AS finding_id,
       usage.run_id,
       usage.trigger,
       usage.detector,
       usage.model_name,
       usage.input_tokens,
       usage.output_tokens,
       usage.estimated_cost_usd::text AS estimated_cost_usd,
       COALESCE(
         usage.trace_metadata->>'branchPath',
         usage.trace_metadata->>'branch_path',
         usage.trace_metadata->>'branch'
       ) AS branch_path,
       COALESCE(
         usage.trace_metadata->>'traceUrl',
         usage.trace_metadata->>'trace_url',
         usage.trace_metadata->>'langfuseUrl',
         usage.trace_metadata->>'langfuse_url'
       ) AS trace_url,
       usage.created_at
     FROM fleetgraph_usage usage
     WHERE usage.workspace_id = $1
       AND usage.trace_metadata->>'findingId' = ANY($2::text[])
     ORDER BY usage.trace_metadata->>'findingId', usage.created_at DESC, usage.id DESC`,
    [workspaceId, findingIds]
  );

  return new Map(result.rows.map((trace) => [trace.finding_id, trace]));
}

async function broadcastFleetGraphFindingUpdated(
  finding: FleetGraphFindingResponse,
  mutation: FleetGraphFindingMutation,
  actionCandidateId: string | null
): Promise<void> {
  const memberResult = await pool.query<FleetGraphWorkspaceMemberRow>(
    `SELECT user_id
     FROM workspace_memberships
     WHERE workspace_id = $1`,
    [finding.workspace_id]
  );

  for (const row of memberResult.rows) {
    broadcastToUser(row.user_id, 'fleetgraph:finding_updated', {
      workspaceId: finding.workspace_id,
      findingId: finding.id,
      lifecycleState: finding.lifecycle_state,
      mutation,
      actionCandidateId,
    });
  }
}

function resolveApprovedActionCandidateId(
  finding: FleetGraphFindingResponse,
  requestedActionCandidateId?: string
): string | null {
  if (requestedActionCandidateId) {
    return requestedActionCandidateId;
  }

  if (finding.action_candidates.length === 1) {
    return finding.action_candidates[0]!.id;
  }

  return null;
}

async function resumeFleetGraphAction(input: {
  actionCandidateId: string;
  actorContext: FleetGraphActorContext;
  idempotencyKey?: string;
}): Promise<FleetGraphDecisionResult> {
  const client = await pool.connect();
  let findingId = '';

  try {
    await client.query('BEGIN');

    const action = await loadResumeActionForUpdate(
      client,
      input.actorContext.workspaceId,
      input.actionCandidateId
    );

    if (!action) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 404,
        error: 'FleetGraph action candidate not found',
      };
    }

    findingId = action.finding_id;

    if (!canActorDecideFinding(input.actorContext, {
      id: action.finding_id,
      recipient_user_id: action.recipient_user_id,
      lifecycle_state: action.lifecycle_state,
    })) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 403,
        error: 'FleetGraph action resume requires the recipient or workspace admin',
      };
    }

    if (action.lifecycle_state === 'executed') {
      const replay = await loadReplayExecution(
        client,
        input.actionCandidateId,
        input.idempotencyKey
      );
      await client.query('ROLLBACK');

      if (replay) {
        const replayedFinding = await loadFleetGraphFindingById(
          input.actorContext.workspaceId,
          action.finding_id
        );

        if (!replayedFinding) {
          throw new Error('Replayed FleetGraph finding could not be reloaded');
        }

        return {
          success: true,
          finding: replayedFinding,
          mutationApplied: false,
        };
      }

      return {
        success: false,
        statusCode: 409,
        error: 'FleetGraph action has already been executed',
      };
    }

    if (action.lifecycle_state !== 'approved') {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 409,
        error: 'FleetGraph action can only resume from an approved finding',
      };
    }

    const recommendedAction = parseResumeRecommendedAction(action);

    if (recommendedAction.kind !== 'draft_comment') {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 409,
        error: 'FleetGraph resume currently supports draft_comment actions only',
      };
    }

    const executionResult = await executeFleetGraphRecommendedAction(
      client,
      input.actorContext,
      action,
      recommendedAction
    );

    await insertFleetGraphActionExecution(
      client,
      action,
      input.actorContext.userId,
      input.idempotencyKey,
      executionResult
    );

    const updateResult = await client.query<UpdatedFleetGraphFindingRow>(
      `UPDATE fleetgraph_findings
       SET lifecycle_state = 'executed'
       WHERE id = $1
         AND workspace_id = $2
         AND lifecycle_state = 'approved'
       RETURNING id`,
      [action.finding_id, input.actorContext.workspaceId]
    );

    if (!updateResult.rows[0]) {
      throw new Error(`FleetGraph finding execution transition returned no row: findingId=${action.finding_id}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const updatedFinding = await loadFleetGraphFindingById(
    input.actorContext.workspaceId,
    findingId
  );

  if (!updatedFinding) {
    throw new Error('Executed FleetGraph finding could not be reloaded');
  }

  return {
    success: true,
    finding: updatedFinding,
    mutationApplied: true,
  };
}

async function loadResumeActionForUpdate(
  client: PoolClient,
  workspaceId: string,
  actionCandidateId: string
): Promise<FleetGraphResumeActionRow | null> {
  const result = await client.query<FleetGraphResumeActionRow>(
    `SELECT
       action_candidate.id AS action_candidate_id,
       finding.id AS finding_id,
       finding.workspace_id,
       finding.scoped_document_id,
       finding.recipient_user_id,
       finding.lifecycle_state,
       action_candidate.target_document_id,
       action_candidate.recommended_action,
       approval.edited_action
     FROM fleetgraph_action_candidates action_candidate
     INNER JOIN fleetgraph_findings finding
       ON finding.id = action_candidate.finding_id
      AND finding.workspace_id = $2
     INNER JOIN documents target_document
       ON target_document.id = action_candidate.target_document_id
      AND target_document.workspace_id = finding.workspace_id
     LEFT JOIN LATERAL (
       SELECT edited_action
       FROM fleetgraph_approvals
       WHERE finding_id = finding.id
         AND (action_candidate_id = action_candidate.id OR action_candidate_id IS NULL)
         AND decision IN ('approved', 'edited')
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     ) approval ON true
     WHERE action_candidate.id = $1
     FOR UPDATE OF finding`,
    [actionCandidateId, workspaceId]
  );

  return result.rows[0] ?? null;
}

async function loadReplayExecution(
  client: PoolClient,
  actionCandidateId: string,
  idempotencyKey?: string
): Promise<FleetGraphActionExecutionRow | null> {
  if (!idempotencyKey) {
    return null;
  }

  const result = await client.query<FleetGraphActionExecutionRow>(
    `SELECT idempotency_key, result
     FROM fleetgraph_action_executions
     WHERE action_candidate_id = $1
       AND idempotency_key = $2`,
    [actionCandidateId, idempotencyKey]
  );

  return result.rows[0] ?? null;
}

function parseResumeRecommendedAction(action: FleetGraphResumeActionRow): FleetGraphRecommendedAction {
  const rawAction = action.edited_action ?? action.recommended_action;
  return recommendedActionSchema.parse(JSON.parse(rawAction));
}

async function executeFleetGraphRecommendedAction(
  client: PoolClient,
  actorContext: FleetGraphActorContext,
  action: FleetGraphResumeActionRow,
  recommendedAction: FleetGraphRecommendedAction
): Promise<FleetGraphActionExecutionResult> {
  const commentThreadId = randomUUID();
  const result = await client.query<InsertedCommentRow>(
    `INSERT INTO comments (document_id, comment_id, parent_id, author_id, workspace_id, content)
     VALUES ($1, $2, NULL, $3, $4, $5)
     RETURNING id, comment_id`,
    [
      action.target_document_id,
      commentThreadId,
      actorContext.userId,
      actorContext.workspaceId,
      recommendedAction.body,
    ]
  );
  const row = result.rows[0];

  if (!row) {
    throw new Error(`FleetGraph draft comment insert returned no row: actionCandidateId=${action.action_candidate_id}`);
  }

  return {
    kind: 'draft_comment',
    documentId: action.target_document_id,
    commentId: row.id,
    commentThreadId: row.comment_id,
  };
}

async function insertFleetGraphActionExecution(
  client: PoolClient,
  action: FleetGraphResumeActionRow,
  actorUserId: string,
  idempotencyKey: string | undefined,
  executionResult: FleetGraphActionExecutionResult
): Promise<void> {
  await client.query(
    `INSERT INTO fleetgraph_action_executions (
       finding_id, action_candidate_id, actor_user_id, idempotency_key, result
     )
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      action.finding_id,
      action.action_candidate_id,
      actorUserId,
      idempotencyKey ?? null,
      JSON.stringify(executionResult),
    ]
  );
}

async function dismissFleetGraphFinding(input: {
  findingId: string;
  actorContext: FleetGraphActorContext;
  reason: string;
}): Promise<FleetGraphDecisionResult> {
  return suppressFleetGraphFinding({
    findingId: input.findingId,
    actorContext: input.actorContext,
    reason: input.reason,
    suppressionType: 'dismissed',
    lifecycleState: 'dismissed',
    expiresAt: null,
  });
}

async function snoozeFleetGraphFinding(input: {
  findingId: string;
  actorContext: FleetGraphActorContext;
  reason: string;
  expiresAt: Date;
}): Promise<FleetGraphDecisionResult> {
  return suppressFleetGraphFinding({
    findingId: input.findingId,
    actorContext: input.actorContext,
    reason: input.reason,
    suppressionType: 'snoozed',
    lifecycleState: 'snoozed',
    expiresAt: input.expiresAt,
  });
}

async function suppressFleetGraphFinding(input: {
  findingId: string;
  actorContext: FleetGraphActorContext;
  reason: string;
  suppressionType: 'dismissed' | 'snoozed';
  lifecycleState: 'dismissed' | 'snoozed';
  expiresAt: Date | null;
}): Promise<FleetGraphDecisionResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const finding = await loadDecisionFindingForUpdate(
      client,
      input.actorContext.workspaceId,
      input.findingId
    );

    if (!finding) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 404,
        error: 'FleetGraph finding not found',
      };
    }

    if (!canActorDecideFinding(input.actorContext, finding)) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 403,
        error: 'FleetGraph finding decision requires the recipient or workspace admin',
      };
    }

    if (!canSuppressFindingState(finding.lifecycle_state)) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 409,
        error: 'FleetGraph finding cannot be suppressed from its current state',
      };
    }

    await client.query(
      `INSERT INTO fleetgraph_suppressions (
         finding_id, suppression_type, reason, expires_at
       )
       VALUES ($1, $2, $3, $4)`,
      [finding.id, input.suppressionType, input.reason, input.expiresAt]
    );

    await client.query(
      `UPDATE fleetgraph_findings
       SET lifecycle_state = $2,
           expires_at = $3
       WHERE id = $1`,
      [finding.id, input.lifecycleState, input.expiresAt]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const updatedFinding = await loadFleetGraphFindingById(
    input.actorContext.workspaceId,
    input.findingId
  );

  if (!updatedFinding) {
    throw new Error('Suppressed FleetGraph finding could not be reloaded');
  }

  return {
    success: true,
    finding: updatedFinding,
    mutationApplied: true,
  };
}

async function rejectFleetGraphFinding(input: {
  findingId: string;
  actorContext: FleetGraphActorContext;
  reason: string;
}): Promise<FleetGraphDecisionResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const finding = await loadDecisionFindingForUpdate(
      client,
      input.actorContext.workspaceId,
      input.findingId
    );

    if (!finding) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 404,
        error: 'FleetGraph finding not found',
      };
    }

    if (!canActorDecideFinding(input.actorContext, finding)) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 403,
        error: 'FleetGraph finding decision requires the recipient or workspace admin',
      };
    }

    if (finding.lifecycle_state !== 'pending_review') {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 409,
        error: 'FleetGraph finding is not pending review',
      };
    }

    const actionCandidateId = await loadNullableSingleActionCandidateId(
      client,
      input.actorContext.workspaceId,
      finding.id
    );

    await client.query(
      `INSERT INTO fleetgraph_approvals (
         finding_id, action_candidate_id, actor_user_id, decision, reason
       )
       VALUES ($1, $2, $3, 'rejected', $4)`,
      [finding.id, actionCandidateId, input.actorContext.userId, input.reason]
    );

    await client.query(
      `UPDATE fleetgraph_findings
       SET lifecycle_state = 'rejected'
       WHERE id = $1`,
      [finding.id]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const updatedFinding = await loadFleetGraphFindingById(
    input.actorContext.workspaceId,
    input.findingId
  );

  if (!updatedFinding) {
    throw new Error('Rejected FleetGraph finding could not be reloaded');
  }

  return {
    success: true,
    finding: updatedFinding,
    mutationApplied: true,
  };
}

async function approveFleetGraphFinding(input: {
  findingId: string;
  actorContext: FleetGraphActorContext;
  actionCandidateId?: string;
  editedAction: FleetGraphRecommendedAction | null;
}): Promise<FleetGraphDecisionResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const finding = await loadDecisionFindingForUpdate(
      client,
      input.actorContext.workspaceId,
      input.findingId
    );

    if (!finding) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 404,
        error: 'FleetGraph finding not found',
      };
    }

    if (!canActorDecideFinding(input.actorContext, finding)) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 403,
        error: 'FleetGraph finding decision requires the recipient or workspace admin',
      };
    }

    if (finding.lifecycle_state !== 'pending_review') {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 409,
        error: 'FleetGraph finding is not pending review',
      };
    }

    const actionCandidateResult = await resolveActionCandidateIdForApproval(
      client,
      input.actorContext.workspaceId,
      finding.id,
      input.actionCandidateId
    );

    if (!actionCandidateResult.success) {
      await client.query('ROLLBACK');
      return actionCandidateResult;
    }

    const decision = input.editedAction ? 'edited' : 'approved';
    const editedAction = input.editedAction ? JSON.stringify(input.editedAction) : null;

    await client.query(
      `INSERT INTO fleetgraph_approvals (
         finding_id, action_candidate_id, actor_user_id, decision, edited_action
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [finding.id, actionCandidateResult.actionCandidateId, input.actorContext.userId, decision, editedAction]
    );

    await client.query(
      `UPDATE fleetgraph_findings
       SET lifecycle_state = 'approved'
       WHERE id = $1`,
      [finding.id]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const updatedFinding = await loadFleetGraphFindingById(
    input.actorContext.workspaceId,
    input.findingId
  );

  if (!updatedFinding) {
    throw new Error('Approved FleetGraph finding could not be reloaded');
  }

  return {
    success: true,
    finding: updatedFinding,
    mutationApplied: true,
  };
}

async function loadDecisionFindingForUpdate(
  client: PoolClient,
  workspaceId: string,
  findingId: string
): Promise<FleetGraphDecisionFindingRow | null> {
  const result = await client.query<FleetGraphDecisionFindingRow>(
    `SELECT id, recipient_user_id, lifecycle_state
     FROM fleetgraph_findings
     WHERE workspace_id = $1
       AND id = $2
     FOR UPDATE`,
    [workspaceId, findingId]
  );

  return result.rows[0] ?? null;
}

async function loadNullableSingleActionCandidateId(
  client: PoolClient,
  workspaceId: string,
  findingId: string
): Promise<string | null> {
  const result = await client.query<FleetGraphActionCandidateIdRow>(
    `SELECT action_candidate.id
     FROM fleetgraph_action_candidates action_candidate
     INNER JOIN fleetgraph_findings finding
       ON finding.id = action_candidate.finding_id
      AND finding.workspace_id = $1
     WHERE action_candidate.finding_id = $2
     ORDER BY action_candidate.id ASC
     LIMIT 2`,
    [workspaceId, findingId]
  );

  if (result.rows.length !== 1) {
    return null;
  }

  return result.rows[0]!.id;
}

async function resolveActionCandidateIdForApproval(
  client: PoolClient,
  workspaceId: string,
  findingId: string,
  requestedActionCandidateId?: string
): Promise<{
  success: true;
  actionCandidateId: string;
} | {
  success: false;
  statusCode: number;
  error: string;
}> {
  const result = await client.query<FleetGraphActionCandidateIdRow>(
    `SELECT action_candidate.id
     FROM fleetgraph_action_candidates action_candidate
     INNER JOIN fleetgraph_findings finding
       ON finding.id = action_candidate.finding_id
      AND finding.workspace_id = $1
     WHERE action_candidate.finding_id = $2
     ORDER BY action_candidate.id ASC`,
    [workspaceId, findingId]
  );

  if (requestedActionCandidateId) {
    const matchingActionCandidate = result.rows.find((row) => row.id === requestedActionCandidateId);

    if (!matchingActionCandidate) {
      return {
        success: false,
        statusCode: 400,
        error: 'Action candidate does not belong to this FleetGraph finding',
      };
    }

    return {
      success: true,
      actionCandidateId: matchingActionCandidate.id,
    };
  }

  if (result.rows.length === 0) {
    return {
      success: false,
      statusCode: 409,
      error: 'FleetGraph finding has no action candidates to approve',
    };
  }

  if (result.rows.length > 1) {
    return {
      success: false,
      statusCode: 400,
      error: 'action_candidate_id is required when a finding has multiple action candidates',
    };
  }

  return {
    success: true,
    actionCandidateId: result.rows[0]!.id,
  };
}

function getFleetGraphActorContext(req: Request): {
  success: true;
  data: FleetGraphActorContext;
} | {
  success: false;
  statusCode: number;
  error: string;
} {
  if (!req.workspaceId) {
    return {
      success: false,
      statusCode: 401,
      error: 'No workspace found for authenticated request',
    };
  }

  if (!req.userId) {
    return {
      success: false,
      statusCode: 401,
      error: 'No user found for authenticated request',
    };
  }

  return {
    success: true,
    data: {
      workspaceId: req.workspaceId,
      userId: req.userId,
      isWorkspaceAdmin: req.isSuperAdmin === true || req.membership?.role === 'admin',
    },
  };
}

function canActorDecideFinding(
  actorContext: FleetGraphActorContext,
  finding: FleetGraphDecisionFindingRow
): boolean {
  if (actorContext.isWorkspaceAdmin) {
    return true;
  }

  return finding.recipient_user_id === actorContext.userId;
}

function canSuppressFindingState(lifecycleState: string): boolean {
  return lifecycleState === 'open' || lifecycleState === 'pending_review';
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
  actionCandidates: FleetGraphActionCandidateRow[],
  trace: FleetGraphFindingTraceRow | null
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
    trace: trace ? mapFindingTraceResponse(trace) : null,
    action_candidates: actionCandidates.map(mapActionCandidateResponse),
  };
}

function mapFindingTraceResponse(trace: FleetGraphFindingTraceRow): FleetGraphFindingTraceResponse {
  return {
    run_id: trace.run_id,
    trigger: trace.trigger,
    detector: trace.detector,
    model_name: trace.model_name,
    input_tokens: trace.input_tokens,
    output_tokens: trace.output_tokens,
    estimated_cost_usd: trace.estimated_cost_usd,
    branch_path: trace.branch_path,
    trace_url: trace.trace_url,
    created_at: trace.created_at.toISOString(),
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
