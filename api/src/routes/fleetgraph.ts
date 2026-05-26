import { Router, type Request, type Response } from 'express';
import type { PoolClient } from 'pg';
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

type FleetGraphActorContext = {
  workspaceId: string;
  userId: string;
  isWorkspaceAdmin: boolean;
};

type FleetGraphDecisionFindingRow = {
  id: string;
  recipient_user_id: string | null;
  lifecycle_state: string;
};

type FleetGraphActionCandidateIdRow = {
  id: string;
};

type FleetGraphDecisionResult = {
  success: true;
  finding: FleetGraphFindingResponse;
} | {
  success: false;
  statusCode: number;
  error: string;
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

const fleetGraphFindingParamsSchema = z.object({
  id: z.string().uuid(),
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

  return mapFindingResponse(finding, actionCandidates);
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
