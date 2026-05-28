import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { broadcastToUser } from '../collaboration/index.js';
import { pool } from '../db/client.js';
import {
  FleetGraphFindingListResponseSchema,
  FleetGraphFindingSchema,
} from '../openapi/schemas/fleetgraph.js';
import fleetGraphRouter from './fleetgraph.js';

vi.mock('../collaboration/index.js', () => ({
  broadcastToUser: vi.fn(),
}));

const broadcastToUserMock = vi.mocked(broadcastToUser);

type IdRow = {
  id: string;
};

type CountRow = {
  count: string;
};

type SeededFinding = {
  id: string;
  title: string;
  lifecycleState: string;
};

type ApprovalAuditRow = {
  decision: string;
  edited_action: string | null;
};

type RejectionAuditRow = {
  decision: string;
  reason: string | null;
};

type SuppressionAuditRow = {
  suppression_type: string;
  reason: string;
  expires_at: Date | null;
};

type CommentRow = {
  content: string;
  author_id: string | null;
};

type ActionExecutionRow = {
  idempotency_key: string | null;
  result: unknown;
};

type TestRecommendedAction = {
  kind: string;
  title?: string;
  body: string;
};

type FindingAuditKind = 'approval' | 'suppression';

describe('FleetGraph inbox API', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sessionId = `fleetgraph-inbox-${testRunId}`;
  const adminSessionId = `fleetgraph-inbox-admin-${testRunId}`;
  const otherSessionId = `fleetgraph-inbox-other-${testRunId}`;
  let app: express.Express;
  let workspaceId = '';
  let otherWorkspaceId = '';
  let userId = '';
  let adminUserId = '';
  let otherUserId = '';
  let scopedDocumentId = '';
  let otherScopedDocumentId = '';
  let openFinding: SeededFinding;
  let pendingFinding: SeededFinding;

  beforeAll(async () => {
    app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/fleetgraph', fleetGraphRouter);

    const workspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`FleetGraph Inbox ${testRunId}`]
    );
    workspaceId = workspaceResult.rows[0]!.id;

    const otherWorkspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`Other FleetGraph Inbox ${testRunId}`]
    );
    otherWorkspaceId = otherWorkspaceResult.rows[0]!.id;

    const userResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Inbox User')
       RETURNING id`,
      [`fleetgraph-inbox-${testRunId}@test.local`]
    );
    userId = userResult.rows[0]!.id;

    const adminUserResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Admin User')
       RETURNING id`,
      [`fleetgraph-inbox-admin-${testRunId}@test.local`]
    );
    adminUserId = adminUserResult.rows[0]!.id;

    const otherUserResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Other User')
       RETURNING id`,
      [`fleetgraph-inbox-other-${testRunId}@test.local`]
    );
    otherUserId = otherUserResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [workspaceId, userId]
    );

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspaceId, adminUserId]
    );

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [workspaceId, otherUserId]
    );

    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at, last_activity, created_at)
       VALUES ($1, $2, $3, now() + interval '1 hour', now(), now())`,
      [sessionId, userId, workspaceId]
    );

    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at, last_activity, created_at)
       VALUES ($1, $2, $3, now() + interval '1 hour', now(), now())`,
      [adminSessionId, adminUserId, workspaceId]
    );

    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at, last_activity, created_at)
       VALUES ($1, $2, $3, now() + interval '1 hour', now(), now())`,
      [otherSessionId, otherUserId, workspaceId]
    );

    const documentResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'Inbox Week', 'workspace', $2, '{}'::jsonb)
       RETURNING id`,
      [workspaceId, userId]
    );
    scopedDocumentId = documentResult.rows[0]!.id;

    const otherDocumentResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'Other Inbox Week', 'workspace', $2, '{}'::jsonb)
       RETURNING id`,
      [otherWorkspaceId, userId]
    );
    otherScopedDocumentId = otherDocumentResult.rows[0]!.id;

    openFinding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Older open risk',
      lifecycleState: 'open',
      materialChangeKey: `v1:inbox-${testRunId}:open`,
      createdAt: '2026-05-26T05:00:00.000Z',
    });
    pendingFinding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'New pending risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:pending`,
      createdAt: '2026-05-26T06:00:00.000Z',
    });
    await createActionCandidate(pendingFinding.id, scopedDocumentId);

    await createFinding({
      workspaceId: otherWorkspaceId,
      scopedDocumentId: otherDocumentResult.rows[0]!.id,
      recipientUserId: userId,
      title: 'Other workspace risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:other`,
      createdAt: '2026-05-26T07:00:00.000Z',
    });
  });

  afterAll(async () => {
    if (workspaceId) {
      await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    }

    if (otherWorkspaceId) {
      await pool.query('DELETE FROM workspaces WHERE id = $1', [otherWorkspaceId]);
    }

    if (userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }

    if (adminUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [adminUserId]);
    }

    if (otherUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [otherUserId]);
    }
  });

  afterEach(() => {
    broadcastToUserMock.mockClear();
  });

  it('lists current-workspace findings sorted by created_at desc with nested recipient and action candidates', async () => {
    await createUsageTrace({
      findingId: pendingFinding.id,
      runId: `fleetgraph-run-${testRunId}`,
      traceUrl: `https://cloud.langfuse.com/project/demo/traces/fleetgraph-run-${testRunId}`,
    });

    const response = await request(app)
      .get('/api/fleetgraph/findings')
      .set('Cookie', [`session_id=${sessionId}`]);

    expect(response.status).toBe(200);
    expectFleetGraphFindingListResponse(response.body);
    expect(response.body.items.map((finding: { id: string }) => finding.id)).toEqual([
      pendingFinding.id,
      openFinding.id,
    ]);
    expect(response.body.lifecycle_counts).toMatchObject({
      open: 1,
      pending_review: 1,
      approved: 0,
      executed: 0,
    });
    expect(response.body.items[0]).toMatchObject({
      id: pendingFinding.id,
      workspace_id: workspaceId,
      scoped_document: {
        id: scopedDocumentId,
        document_type: 'sprint',
        title: 'Inbox Week',
      },
      recipient_user: {
        id: userId,
        name: 'FleetGraph Inbox User',
        email: `fleetgraph-inbox-${testRunId}@test.local`,
      },
      lifecycle_state: 'pending_review',
      trace: {
        run_id: `fleetgraph-run-${testRunId}`,
        trigger: 'proactive',
        detector: 'at_risk_week',
        model_name: 'gpt-4.1-mini',
        input_tokens: 1180,
        output_tokens: 260,
        estimated_cost_usd: '0.000900',
        branch_path: 'output',
        trace_url: `https://cloud.langfuse.com/project/demo/traces/fleetgraph-run-${testRunId}`,
        created_at: expect.any(String),
      },
      action_candidates: [{
        target_document: {
          id: scopedDocumentId,
          title: 'Inbox Week',
        },
        recommended_action: {
          kind: 'draft_comment',
          title: 'Ask for blocker update',
        },
        approval_level: 'approval_required',
      }],
    });
    expect(response.body.items.map((finding: { id: string }) => finding.id)).not.toContain('Other workspace risk');
  });

  it('filters findings by lifecycle_state', async () => {
    const response = await request(app)
      .get('/api/fleetgraph/findings?lifecycle_state=open')
      .set('Cookie', [`session_id=${sessionId}`]);

    expect(response.status).toBe(200);
    expect(response.body.items.map((finding: { id: string }) => finding.id)).toEqual([openFinding.id]);
    expect(response.body.lifecycle_counts).toMatchObject({
      open: 1,
      pending_review: 1,
    });
  });

  it('returns unread lifecycle counts from the current user inbox watermark', async () => {
    await pool.query(
      `INSERT INTO fleetgraph_inbox_reads (workspace_id, user_id, last_opened_at)
       VALUES ($1, $2, $3)`,
      [workspaceId, userId, '2026-05-26T05:30:00.000Z']
    );

    await pool.query(
      `INSERT INTO fleetgraph_inbox_reads (workspace_id, user_id, last_opened_at)
       VALUES ($1, $2, $3)`,
      [workspaceId, otherUserId, '2026-05-26T06:30:00.000Z']
    );

    const response = await request(app)
      .get('/api/fleetgraph/findings')
      .set('Cookie', [`session_id=${sessionId}`]);

    expect(response.status).toBe(200);
    expect(response.body.lifecycle_counts).toMatchObject({
      open: 1,
      pending_review: 1,
    });
    expect(response.body.unread_lifecycle_counts).toMatchObject({
      open: 0,
      pending_review: 1,
      approved: 0,
      executed: 0,
    });

    const otherUserResponse = await request(app)
      .get('/api/fleetgraph/findings')
      .set('Cookie', [`session_id=${otherSessionId}`]);

    expect(otherUserResponse.status).toBe(200);
    expect(otherUserResponse.body.unread_lifecycle_counts).toMatchObject({
      open: 0,
      pending_review: 0,
      approved: 0,
    });
  });

  it('marks the FleetGraph inbox opened for the current user without changing lifecycle counts', async () => {
    const beforeResponse = await request(app)
      .get('/api/fleetgraph/findings')
      .set('Cookie', [`session_id=${adminSessionId}`]);

    expect(beforeResponse.status).toBe(200);
    expect(beforeResponse.body.unread_lifecycle_counts).toMatchObject({
      open: 1,
      pending_review: 1,
    });

    const openedResponse = await request(app)
      .post('/api/fleetgraph/inbox/opened')
      .set('Cookie', [`session_id=${adminSessionId}`])
      .send({});

    expect(openedResponse.status).toBe(204);

    const afterResponse = await request(app)
      .get('/api/fleetgraph/findings')
      .set('Cookie', [`session_id=${adminSessionId}`]);

    expect(afterResponse.status).toBe(200);
    expect(afterResponse.body.lifecycle_counts).toMatchObject({
      open: 1,
      pending_review: 1,
    });
    expect(afterResponse.body.unread_lifecycle_counts).toMatchObject({
      open: 0,
      pending_review: 0,
      approved: 0,
    });
  });

  it('paginates with a stable cursor over created_at and id', async () => {
    const firstPage = await request(app)
      .get('/api/fleetgraph/findings?limit=1')
      .set('Cookie', [`session_id=${sessionId}`]);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items.map((finding: { id: string }) => finding.id)).toEqual([pendingFinding.id]);
    expect(firstPage.body.hasMore).toBe(true);
    expect(firstPage.body.next_cursor).toEqual(expect.any(String));

    const secondPage = await request(app)
      .get(`/api/fleetgraph/findings?limit=1&cursor=${encodeURIComponent(firstPage.body.next_cursor)}`)
      .set('Cookie', [`session_id=${sessionId}`]);

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items.map((finding: { id: string }) => finding.id)).toEqual([openFinding.id]);
    expect(secondPage.body.hasMore).toBe(false);
    expect(secondPage.body.next_cursor).toBeNull();
  });

  it('approves a pending finding action candidate and records an audit row', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Approval pending risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:approve`,
      createdAt: '2026-05-26T08:00:00.000Z',
    });
    const actionCandidateId = await createActionCandidate(finding.id, scopedDocumentId);

    const response = await request(app)
      .post(`/api/fleetgraph/findings/${finding.id}/approve`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ action_candidate_id: actionCandidateId });

    expect(response.status).toBe(200);
    expectFleetGraphFindingResponse(response.body);
    expect(response.body).toMatchObject({
      id: finding.id,
      lifecycle_state: 'approved',
      action_candidates: [{ id: actionCandidateId }],
    });

    const auditResult = await pool.query<ApprovalAuditRow>(
      `SELECT decision, edited_action
       FROM fleetgraph_approvals
       WHERE finding_id = $1`,
      [finding.id]
    );
    expect(auditResult.rows).toEqual([{
      decision: 'approved',
      edited_action: null,
    }]);
  });

  it('persists a human-edited recommended action on approval', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Edited approval pending risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:edited-approve`,
      createdAt: '2026-05-26T08:30:00.000Z',
    });
    const actionCandidateId = await createActionCandidate(finding.id, scopedDocumentId);
    const editedAction = {
      kind: 'draft_comment',
      title: 'Ask owner for concrete unblock plan',
      body: 'Please post the current blocker, owner, and next dated checkpoint.',
    };

    const response = await request(app)
      .post(`/api/fleetgraph/findings/${finding.id}/approve`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({
        action_candidate_id: actionCandidateId,
        edited_action: editedAction,
      });

    expect(response.status).toBe(200);
    expectFleetGraphFindingResponse(response.body);
    expect(response.body.lifecycle_state).toBe('approved');

    const auditResult = await pool.query<ApprovalAuditRow>(
      `SELECT decision, edited_action
       FROM fleetgraph_approvals
       WHERE finding_id = $1`,
      [finding.id]
    );
    expect(auditResult.rows).toHaveLength(1);
    expect(auditResult.rows[0]!.decision).toBe('edited');
    expect(JSON.parse(auditResult.rows[0]!.edited_action ?? '{}')).toEqual(editedAction);
  });

  it('rejects a pending finding and records the rejection reason', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Rejection pending risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:reject`,
      createdAt: '2026-05-26T09:00:00.000Z',
    });
    await createActionCandidate(finding.id, scopedDocumentId);
    const reason = 'Owner already resolved the blocker in standup.';

    const response = await request(app)
      .post(`/api/fleetgraph/findings/${finding.id}/reject`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ reason });

    expect(response.status).toBe(200);
    expectFleetGraphFindingResponse(response.body);
    expect(response.body).toMatchObject({
      id: finding.id,
      lifecycle_state: 'rejected',
    });

    const auditResult = await pool.query<RejectionAuditRow>(
      `SELECT decision, reason
       FROM fleetgraph_approvals
       WHERE finding_id = $1`,
      [finding.id]
    );
    expect(auditResult.rows).toEqual([{
      decision: 'rejected',
      reason,
    }]);
  });

  it('returns 409 and does not create an audit row for a terminal finding decision', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Already approved risk',
      lifecycleState: 'approved',
      materialChangeKey: `v1:inbox-${testRunId}:already-approved`,
      createdAt: '2026-05-26T10:00:00.000Z',
    });
    const actionCandidateId = await createActionCandidate(finding.id, scopedDocumentId);

    const response = await request(app)
      .post(`/api/fleetgraph/findings/${finding.id}/approve`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ action_candidate_id: actionCandidateId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'FleetGraph finding is not pending review' });

    const auditResult = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM fleetgraph_approvals
       WHERE finding_id = $1`,
      [finding.id]
    );
    expect(auditResult.rows[0]!.count).toBe('0');
  });

  it('does not allow approving a finding from another workspace', async () => {
    const finding = await createFinding({
      workspaceId: otherWorkspaceId,
      scopedDocumentId: otherScopedDocumentId,
      recipientUserId: userId,
      title: 'Cross workspace pending risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:cross-workspace`,
      createdAt: '2026-05-26T11:00:00.000Z',
    });

    const response = await request(app)
      .post(`/api/fleetgraph/findings/${finding.id}/approve`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({});

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'FleetGraph finding not found' });
  });

  it('requires an authenticated session for FleetGraph reads and mutations', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Unauthenticated mutation risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:unauthenticated`,
      createdAt: '2026-05-26T11:30:00.000Z',
    });
    const actionCandidateId = await createActionCandidate(finding.id, scopedDocumentId);
    const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();

    const responses = [
      await request(app).get('/api/fleetgraph/findings'),
      await request(app)
        .post(`/api/fleetgraph/findings/${finding.id}/approve`)
        .send({ action_candidate_id: actionCandidateId }),
      await request(app)
        .post(`/api/fleetgraph/findings/${finding.id}/reject`)
        .send({ reason: 'No session.' }),
      await request(app)
        .post(`/api/fleetgraph/findings/${finding.id}/dismiss`)
        .send({ reason: 'No session.' }),
      await request(app)
        .post(`/api/fleetgraph/findings/${finding.id}/snooze`)
        .send({ reason: 'No session.', expires_at: expiresAt }),
      await request(app)
        .post(`/api/fleetgraph/actions/${actionCandidateId}/resume`)
        .send({ idempotency_key: `unauthenticated-${testRunId}` }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: 'No session found',
        },
      });
    }
    expect(broadcastToUserMock).not.toHaveBeenCalled();
  });

  it('denies finding mutations by a non-recipient workspace member without side effects', async () => {
    const mutationCases: Array<{
      title: string;
      route: (findingId: string, actionCandidateId: string) => string;
      body: (actionCandidateId: string) => object;
      auditKind: FindingAuditKind;
    }> = [
      {
        title: 'approve',
        route: (findingId: string) => `/api/fleetgraph/findings/${findingId}/approve`,
        body: (actionCandidateId: string) => ({ action_candidate_id: actionCandidateId }),
        auditKind: 'approval',
      },
      {
        title: 'reject',
        route: (findingId: string) => `/api/fleetgraph/findings/${findingId}/reject`,
        body: () => ({ reason: 'The recipient should decide this.' }),
        auditKind: 'approval',
      },
      {
        title: 'dismiss',
        route: (findingId: string) => `/api/fleetgraph/findings/${findingId}/dismiss`,
        body: () => ({ reason: 'The recipient should decide this.' }),
        auditKind: 'suppression',
      },
      {
        title: 'snooze',
        route: (findingId: string) => `/api/fleetgraph/findings/${findingId}/snooze`,
        body: () => ({
          reason: 'The recipient should decide this.',
          expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        }),
        auditKind: 'suppression',
      },
    ];

    for (const mutationCase of mutationCases) {
      const finding = await createFinding({
        workspaceId,
        scopedDocumentId,
        recipientUserId: userId,
        title: `Unauthorized ${mutationCase.title} risk`,
        lifecycleState: 'pending_review',
        materialChangeKey: `v1:inbox-${testRunId}:unauthorized-${mutationCase.title}`,
        createdAt: '2026-05-26T11:40:00.000Z',
      });
      const actionCandidateId = await createActionCandidate(finding.id, scopedDocumentId);
      const beforeAuditCount = await countFindingAuditRows(mutationCase.auditKind, finding.id);

      const response = await request(app)
        .post(mutationCase.route(finding.id, actionCandidateId))
        .set('Cookie', [`session_id=${otherSessionId}`])
        .send(mutationCase.body(actionCandidateId));

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'FleetGraph finding decision requires the recipient or workspace admin',
      });
      await expect(countFindingAuditRows(mutationCase.auditKind, finding.id)).resolves.toBe(beforeAuditCount);
      await expect(loadFindingLifecycleState(finding.id)).resolves.toBe('pending_review');
    }
    expect(broadcastToUserMock).not.toHaveBeenCalled();
  });

  it('does not allow mutating findings or actions from another workspace', async () => {
    const finding = await createFinding({
      workspaceId: otherWorkspaceId,
      scopedDocumentId: otherScopedDocumentId,
      recipientUserId: userId,
      title: 'Cross workspace mutation risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:cross-workspace-mutations`,
      createdAt: '2026-05-26T11:50:00.000Z',
    });
    const actionCandidateId = await createActionCandidate(finding.id, otherScopedDocumentId);
    const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const beforeCommentCount = await countDocumentCommentsInWorkspace(otherScopedDocumentId, otherWorkspaceId);

    const responses = [
      await request(app)
        .post(`/api/fleetgraph/findings/${finding.id}/approve`)
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ action_candidate_id: actionCandidateId }),
      await request(app)
        .post(`/api/fleetgraph/findings/${finding.id}/reject`)
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ reason: 'Wrong workspace.' }),
      await request(app)
        .post(`/api/fleetgraph/findings/${finding.id}/dismiss`)
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ reason: 'Wrong workspace.' }),
      await request(app)
        .post(`/api/fleetgraph/findings/${finding.id}/snooze`)
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ reason: 'Wrong workspace.', expires_at: expiresAt }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'FleetGraph finding not found' });
    }

    const resumeResponse = await request(app)
      .post(`/api/fleetgraph/actions/${actionCandidateId}/resume`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ idempotency_key: `cross-workspace-resume-${testRunId}` });

    expect(resumeResponse.status).toBe(404);
    expect(resumeResponse.body).toEqual({ error: 'FleetGraph action candidate not found' });
    await expect(loadFindingLifecycleState(finding.id)).resolves.toBe('pending_review');
    await expect(countDocumentCommentsInWorkspace(otherScopedDocumentId, otherWorkspaceId)).resolves.toBe(beforeCommentCount);
    expect(broadcastToUserMock).not.toHaveBeenCalled();
  });

  it('dismisses a pending finding and records an indefinite suppression', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Dismiss pending risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:dismiss`,
      createdAt: '2026-05-26T12:00:00.000Z',
    });
    const reason = 'The team accepted this risk for the current Week.';

    const response = await request(app)
      .post(`/api/fleetgraph/findings/${finding.id}/dismiss`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ reason });

    expect(response.status).toBe(200);
    expectFleetGraphFindingResponse(response.body);
    expect(response.body).toMatchObject({
      id: finding.id,
      lifecycle_state: 'dismissed',
    });

    const suppressionResult = await pool.query<SuppressionAuditRow>(
      `SELECT suppression_type, reason, expires_at
       FROM fleetgraph_suppressions
       WHERE finding_id = $1`,
      [finding.id]
    );
    expect(suppressionResult.rows).toEqual([{
      suppression_type: 'dismissed',
      reason,
      expires_at: null,
    }]);
  });

  it('snoozes an open finding until a future expiry', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Snooze open risk',
      lifecycleState: 'open',
      materialChangeKey: `v1:inbox-${testRunId}:snooze`,
      createdAt: '2026-05-26T13:00:00.000Z',
    });
    const reason = 'Waiting for the owner update later today.';
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const response = await request(app)
      .post(`/api/fleetgraph/findings/${finding.id}/snooze`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ reason, expires_at: expiresAt });

    expect(response.status).toBe(200);
    expectFleetGraphFindingResponse(response.body);
    expect(response.body).toMatchObject({
      id: finding.id,
      lifecycle_state: 'snoozed',
      expires_at: expiresAt,
    });

    const suppressionResult = await pool.query<SuppressionAuditRow>(
      `SELECT suppression_type, reason, expires_at
       FROM fleetgraph_suppressions
       WHERE finding_id = $1`,
      [finding.id]
    );
    expect(suppressionResult.rows).toHaveLength(1);
    expect(suppressionResult.rows[0]).toMatchObject({
      suppression_type: 'snoozed',
      reason,
    });
    expect(suppressionResult.rows[0]!.expires_at?.toISOString()).toBe(expiresAt);
  });

  it('rejects snooze requests whose expiry is not in the future', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Expired snooze risk',
      lifecycleState: 'open',
      materialChangeKey: `v1:inbox-${testRunId}:expired-snooze`,
      createdAt: '2026-05-26T14:00:00.000Z',
    });
    const expiresAt = new Date(Date.now() - 60 * 1000).toISOString();

    const response = await request(app)
      .post(`/api/fleetgraph/findings/${finding.id}/snooze`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({
        reason: 'This expiry is stale.',
        expires_at: expiresAt,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'expires_at must be in the future' });

    const suppressionResult = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM fleetgraph_suppressions
       WHERE finding_id = $1`,
      [finding.id]
    );
    expect(suppressionResult.rows[0]!.count).toBe('0');
  });

  it('returns 409 and does not suppress a terminal finding', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Terminal suppression risk',
      lifecycleState: 'approved',
      materialChangeKey: `v1:inbox-${testRunId}:terminal-suppression`,
      createdAt: '2026-05-26T15:00:00.000Z',
    });

    const response = await request(app)
      .post(`/api/fleetgraph/findings/${finding.id}/dismiss`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ reason: 'Already approved.' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'FleetGraph finding cannot be suppressed from its current state',
    });

    const suppressionResult = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM fleetgraph_suppressions
       WHERE finding_id = $1`,
      [finding.id]
    );
    expect(suppressionResult.rows[0]!.count).toBe('0');
  });

  it('returns 409 for stale lifecycle transitions without creating side effects', async () => {
    const rejectedFinding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Already rejected risk',
      lifecycleState: 'rejected',
      materialChangeKey: `v1:inbox-${testRunId}:already-rejected`,
      createdAt: '2026-05-26T15:05:00.000Z',
    });

    const rejectResponse = await request(app)
      .post(`/api/fleetgraph/findings/${rejectedFinding.id}/reject`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ reason: 'Already rejected.' });

    expect(rejectResponse.status).toBe(409);
    expect(rejectResponse.body).toEqual({ error: 'FleetGraph finding is not pending review' });
    await expect(countFindingAuditRows('approval', rejectedFinding.id)).resolves.toBe(0);

    const executedFinding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Executed suppression risk',
      lifecycleState: 'executed',
      materialChangeKey: `v1:inbox-${testRunId}:executed-suppression`,
      createdAt: '2026-05-26T15:06:00.000Z',
    });

    const snoozeResponse = await request(app)
      .post(`/api/fleetgraph/findings/${executedFinding.id}/snooze`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({
        reason: 'Already executed.',
        expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      });

    expect(snoozeResponse.status).toBe(409);
    expect(snoozeResponse.body).toEqual({
      error: 'FleetGraph finding cannot be suppressed from its current state',
    });
    await expect(countFindingAuditRows('suppression', executedFinding.id)).resolves.toBe(0);

    const actionCandidateId = await createActionCandidate(executedFinding.id, scopedDocumentId);
    const beforeCommentCount = await countDocumentComments(scopedDocumentId);

    const resumeResponse = await request(app)
      .post(`/api/fleetgraph/actions/${actionCandidateId}/resume`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ idempotency_key: `stale-resume-${testRunId}` });

    expect(resumeResponse.status).toBe(409);
    expect(resumeResponse.body).toEqual({ error: 'FleetGraph action has already been executed' });
    await expect(countDocumentComments(scopedDocumentId)).resolves.toBe(beforeCommentCount);
    expect(broadcastToUserMock).not.toHaveBeenCalled();
  });

  it('broadcasts workspace invalidations after successful FleetGraph mutations', async () => {
    const approvedFinding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Broadcast approval risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:broadcast-approve`,
      createdAt: '2026-05-26T15:10:00.000Z',
    });
    const approvedActionCandidateId = await createActionCandidate(approvedFinding.id, scopedDocumentId);

    const approveResponse = await request(app)
      .post(`/api/fleetgraph/findings/${approvedFinding.id}/approve`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ action_candidate_id: approvedActionCandidateId });

    expect(approveResponse.status).toBe(200);
    expectFleetGraphFindingResponse(approveResponse.body);
    expectFleetGraphWorkspaceBroadcast({
      findingId: approvedFinding.id,
      lifecycleState: 'approved',
      mutation: 'approved',
      actionCandidateId: approvedActionCandidateId,
    });

    const rejectedFinding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Broadcast rejection risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:broadcast-reject`,
      createdAt: '2026-05-26T15:20:00.000Z',
    });

    const rejectResponse = await request(app)
      .post(`/api/fleetgraph/findings/${rejectedFinding.id}/reject`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ reason: 'Broadcast rejection reason.' });

    expect(rejectResponse.status).toBe(200);
    expectFleetGraphFindingResponse(rejectResponse.body);
    expectFleetGraphWorkspaceBroadcast({
      findingId: rejectedFinding.id,
      lifecycleState: 'rejected',
      mutation: 'rejected',
      actionCandidateId: null,
    });

    const dismissedFinding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Broadcast dismissal risk',
      lifecycleState: 'open',
      materialChangeKey: `v1:inbox-${testRunId}:broadcast-dismiss`,
      createdAt: '2026-05-26T15:30:00.000Z',
    });

    const dismissResponse = await request(app)
      .post(`/api/fleetgraph/findings/${dismissedFinding.id}/dismiss`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ reason: 'Broadcast dismissal reason.' });

    expect(dismissResponse.status).toBe(200);
    expectFleetGraphFindingResponse(dismissResponse.body);
    expectFleetGraphWorkspaceBroadcast({
      findingId: dismissedFinding.id,
      lifecycleState: 'dismissed',
      mutation: 'dismissed',
      actionCandidateId: null,
    });

    const snoozedFinding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Broadcast snooze risk',
      lifecycleState: 'open',
      materialChangeKey: `v1:inbox-${testRunId}:broadcast-snooze`,
      createdAt: '2026-05-26T15:40:00.000Z',
    });
    const snoozeExpiresAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();

    const snoozeResponse = await request(app)
      .post(`/api/fleetgraph/findings/${snoozedFinding.id}/snooze`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ reason: 'Broadcast snooze reason.', expires_at: snoozeExpiresAt });

    expect(snoozeResponse.status).toBe(200);
    expectFleetGraphFindingResponse(snoozeResponse.body);
    expectFleetGraphWorkspaceBroadcast({
      findingId: snoozedFinding.id,
      lifecycleState: 'snoozed',
      mutation: 'snoozed',
      actionCandidateId: null,
    });

    const executedFinding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Broadcast resume risk',
      lifecycleState: 'approved',
      materialChangeKey: `v1:inbox-${testRunId}:broadcast-resume`,
      createdAt: '2026-05-26T15:50:00.000Z',
    });
    const executedActionCandidateId = await createActionCandidate(executedFinding.id, scopedDocumentId);
    await createApproval(executedFinding.id, executedActionCandidateId, userId, 'approved', null);

    const resumeResponse = await request(app)
      .post(`/api/fleetgraph/actions/${executedActionCandidateId}/resume`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ idempotency_key: `broadcast-resume-${testRunId}` });

    expect(resumeResponse.status).toBe(200);
    expectFleetGraphFindingResponse(resumeResponse.body);
    expectFleetGraphWorkspaceBroadcast({
      findingId: executedFinding.id,
      lifecycleState: 'executed',
      mutation: 'executed',
      actionCandidateId: executedActionCandidateId,
    });
  });

  it('resumes an approved draft comment action exactly once for a repeated idempotency key', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Resume approved comment risk',
      lifecycleState: 'approved',
      materialChangeKey: `v1:inbox-${testRunId}:resume-comment`,
      createdAt: '2026-05-26T16:00:00.000Z',
    });
    const actionCandidateId = await createActionCandidate(finding.id, scopedDocumentId);
    await createApproval(finding.id, actionCandidateId, userId, 'approved', null);
    const idempotencyKey = `resume-comment-${testRunId}`;
    const beforeCommentCount = await countDocumentComments(scopedDocumentId);

    const firstResponse = await request(app)
      .post(`/api/fleetgraph/actions/${actionCandidateId}/resume`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ idempotency_key: idempotencyKey });

    expect(firstResponse.status).toBe(200);
    expectFleetGraphFindingResponse(firstResponse.body);
    expect(firstResponse.body).toMatchObject({
      id: finding.id,
      lifecycle_state: 'executed',
    });
    expectFleetGraphWorkspaceBroadcast({
      findingId: finding.id,
      lifecycleState: 'executed',
      mutation: 'executed',
      actionCandidateId,
    });

    const secondResponse = await request(app)
      .post(`/api/fleetgraph/actions/${actionCandidateId}/resume`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ idempotency_key: idempotencyKey });

    expect(secondResponse.status).toBe(200);
    expectFleetGraphFindingResponse(secondResponse.body);
    expect(secondResponse.body).toMatchObject({
      id: finding.id,
      lifecycle_state: 'executed',
    });
    expect(broadcastToUserMock).not.toHaveBeenCalled();
    await expect(countDocumentComments(scopedDocumentId)).resolves.toBe(beforeCommentCount + 1);

    const commentsResult = await pool.query<CommentRow>(
      `SELECT content, author_id
       FROM comments
       WHERE document_id = $1
         AND workspace_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [scopedDocumentId, workspaceId]
    );
    expect(commentsResult.rows).toEqual([{
      content: 'Please post the current blocker owner and next step before standup.',
      author_id: userId,
    }]);

    const executionResult = await pool.query<ActionExecutionRow>(
      `SELECT idempotency_key, result
       FROM fleetgraph_action_executions
       WHERE action_candidate_id = $1`,
      [actionCandidateId]
    );
    expect(executionResult.rows).toHaveLength(1);
    expect(executionResult.rows[0]).toMatchObject({
      idempotency_key: idempotencyKey,
    });
  });

  it('denies resume for a non-recipient workspace member without executing the action', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Unauthorized resume risk',
      lifecycleState: 'approved',
      materialChangeKey: `v1:inbox-${testRunId}:resume-denied`,
      createdAt: '2026-05-26T17:00:00.000Z',
    });
    const actionCandidateId = await createActionCandidate(finding.id, scopedDocumentId);
    await createApproval(finding.id, actionCandidateId, userId, 'approved', null);
    const beforeCommentCount = await countDocumentComments(scopedDocumentId);

    const response = await request(app)
      .post(`/api/fleetgraph/actions/${actionCandidateId}/resume`)
      .set('Cookie', [`session_id=${otherSessionId}`])
      .send({ idempotency_key: `resume-denied-${testRunId}` });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'FleetGraph action resume requires the recipient or workspace admin',
    });
    await expect(countDocumentComments(scopedDocumentId)).resolves.toBe(beforeCommentCount);
    expect(broadcastToUserMock).not.toHaveBeenCalled();
  });

  it('allows a workspace admin to resume a recipient action', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Admin resume risk',
      lifecycleState: 'approved',
      materialChangeKey: `v1:inbox-${testRunId}:resume-admin`,
      createdAt: '2026-05-26T18:00:00.000Z',
    });
    const actionCandidateId = await createActionCandidate(finding.id, scopedDocumentId);
    await createApproval(finding.id, actionCandidateId, userId, 'approved', null);
    const beforeCommentCount = await countDocumentComments(scopedDocumentId);

    const response = await request(app)
      .post(`/api/fleetgraph/actions/${actionCandidateId}/resume`)
      .set('Cookie', [`session_id=${adminSessionId}`])
      .send({ idempotency_key: `resume-admin-${testRunId}` });

    expect(response.status).toBe(200);
    expectFleetGraphFindingResponse(response.body);
    expect(response.body.lifecycle_state).toBe('executed');
    await expect(countDocumentComments(scopedDocumentId)).resolves.toBe(beforeCommentCount + 1);

    const latestCommentResult = await pool.query<CommentRow>(
      `SELECT content, author_id
       FROM comments
       WHERE document_id = $1
         AND workspace_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [scopedDocumentId, workspaceId]
    );
    expect(latestCommentResult.rows[0]).toEqual({
      content: 'Please post the current blocker owner and next step before standup.',
      author_id: adminUserId,
    });
  });

  it('returns 409 and does not execute an action whose finding is not approved', async () => {
    const finding = await createFinding({
      workspaceId,
      scopedDocumentId,
      recipientUserId: userId,
      title: 'Premature resume risk',
      lifecycleState: 'pending_review',
      materialChangeKey: `v1:inbox-${testRunId}:resume-premature`,
      createdAt: '2026-05-26T19:00:00.000Z',
    });
    const actionCandidateId = await createActionCandidate(finding.id, scopedDocumentId);
    const beforeCommentCount = await countDocumentComments(scopedDocumentId);

    const response = await request(app)
      .post(`/api/fleetgraph/actions/${actionCandidateId}/resume`)
      .set('Cookie', [`session_id=${sessionId}`])
      .send({ idempotency_key: `resume-premature-${testRunId}` });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'FleetGraph action can only resume from an approved finding',
    });
    await expect(countDocumentComments(scopedDocumentId)).resolves.toBe(beforeCommentCount);
  });

  async function createFinding(input: {
    workspaceId: string;
    scopedDocumentId: string;
    recipientUserId: string;
    title: string;
    lifecycleState: string;
    materialChangeKey: string;
    createdAt: string;
  }): Promise<SeededFinding> {
    const result = await pool.query<IdRow>(
      `INSERT INTO fleetgraph_findings (
         workspace_id, scoped_document_id, detector_type, severity, evidence,
         recipient_user_id, lifecycle_state, material_change_key, created_at, updated_at
       )
       VALUES (
         $1, $2, 'at_risk_week', 'high',
         jsonb_build_array(jsonb_build_object('sourceType', 'issue', 'quote', $3::text)),
         $4, $5, $6, $7, $7
       )
       RETURNING id`,
      [
        input.workspaceId,
        input.scopedDocumentId,
        input.title,
        input.recipientUserId,
        input.lifecycleState,
        input.materialChangeKey,
        input.createdAt,
      ]
    );

    return {
      id: result.rows[0]!.id,
      title: input.title,
      lifecycleState: input.lifecycleState,
    };
  }

  async function createUsageTrace(input: {
    findingId: string;
    runId: string;
    traceUrl: string;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO fleetgraph_usage (
         run_id, workspace_id, trigger, detector, model_name,
         input_tokens, output_tokens, estimated_cost_usd, trace_metadata
       )
       VALUES ($1, $2, 'proactive', 'at_risk_week', 'gpt-4.1-mini', 1180, 260, 0.000900, $3::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        input.runId,
        workspaceId,
        JSON.stringify({
          findingId: input.findingId,
          branchPath: 'output',
          traceUrl: input.traceUrl,
        }),
      ]
    );
  }

  async function createActionCandidate(findingId: string, targetDocumentId: string): Promise<string> {
    const result = await pool.query<IdRow>(
      `INSERT INTO fleetgraph_action_candidates (
         finding_id, target_document_id, owner_user_id, role_reason, urgency, evidence,
         recommended_action, approval_level, reversibility
       )
       VALUES (
         $1, $2, $3,
         'Week owner is responsible for resolving at-risk Week blockers.',
         'high',
         '[{"sourceType":"issue","quote":"New pending risk"}]'::jsonb,
         $4,
         'approval_required',
         'reversible'
       )
       RETURNING id`,
      [
        findingId,
        targetDocumentId,
        userId,
        JSON.stringify({
          kind: 'draft_comment',
          title: 'Ask for blocker update',
          body: 'Please post the current blocker owner and next step before standup.',
        }),
      ]
    );

    return result.rows[0]!.id;
  }

  async function createApproval(
    findingId: string,
    actionCandidateId: string,
    actorUserId: string,
    decision: 'approved' | 'edited',
    editedAction: TestRecommendedAction | null
  ): Promise<void> {
    await pool.query(
      `INSERT INTO fleetgraph_approvals (
         finding_id, action_candidate_id, actor_user_id, decision, edited_action
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        findingId,
        actionCandidateId,
        actorUserId,
        decision,
        editedAction ? JSON.stringify(editedAction) : null,
      ]
    );
  }

  async function countDocumentComments(documentId: string): Promise<number> {
    return countDocumentCommentsInWorkspace(documentId, workspaceId);
  }

  async function countDocumentCommentsInWorkspace(
    documentId: string,
    documentWorkspaceId: string
  ): Promise<number> {
    const result = await pool.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM comments
       WHERE document_id = $1
         AND workspace_id = $2`,
      [documentId, documentWorkspaceId]
    );

    return Number.parseInt(result.rows[0]!.count, 10);
  }

  async function countFindingAuditRows(auditKind: FindingAuditKind, findingId: string): Promise<number> {
    const queryByAuditKind: Record<FindingAuditKind, string> = {
      approval: `SELECT COUNT(*)::text AS count FROM fleetgraph_approvals WHERE finding_id = $1`,
      suppression: `SELECT COUNT(*)::text AS count FROM fleetgraph_suppressions WHERE finding_id = $1`,
    };
    const result = await pool.query<CountRow>(queryByAuditKind[auditKind], [findingId]);

    return Number.parseInt(result.rows[0]!.count, 10);
  }

  async function loadFindingLifecycleState(findingId: string): Promise<string> {
    const result = await pool.query<{ lifecycle_state: string }>(
      `SELECT lifecycle_state
       FROM fleetgraph_findings
       WHERE id = $1`,
      [findingId]
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error(`FleetGraph finding not found in test fixture: findingId=${findingId}`);
    }

    return row.lifecycle_state;
  }

  function expectFleetGraphFindingListResponse(body: object): void {
    const parsed = FleetGraphFindingListResponseSchema.safeParse(body);

    if (!parsed.success) {
      throw new Error(`FleetGraph finding list response does not match OpenAPI schema: ${parsed.error.message}`);
    }
  }

  function expectFleetGraphFindingResponse(body: object): void {
    const parsed = FleetGraphFindingSchema.safeParse(body);

    if (!parsed.success) {
      throw new Error(`FleetGraph finding response does not match OpenAPI schema: ${parsed.error.message}`);
    }
  }

  function expectFleetGraphWorkspaceBroadcast(input: {
    findingId: string;
    lifecycleState: string;
    mutation: string;
    actionCandidateId: string | null;
  }): void {
    const payload = expect.objectContaining({
      workspaceId,
      findingId: input.findingId,
      lifecycleState: input.lifecycleState,
      mutation: input.mutation,
      actionCandidateId: input.actionCandidateId,
    });

    expect(broadcastToUserMock).toHaveBeenCalledTimes(3);
    expect(broadcastToUserMock).toHaveBeenCalledWith(userId, 'fleetgraph:finding_updated', payload);
    expect(broadcastToUserMock).toHaveBeenCalledWith(adminUserId, 'fleetgraph:finding_updated', payload);
    expect(broadcastToUserMock).toHaveBeenCalledWith(otherUserId, 'fleetgraph:finding_updated', payload);
    broadcastToUserMock.mockClear();
  }
});
