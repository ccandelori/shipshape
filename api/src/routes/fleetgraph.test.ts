import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { pool } from '../db/client.js';
import fleetGraphRouter from './fleetgraph.js';

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

describe('FleetGraph inbox API', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sessionId = `fleetgraph-inbox-${testRunId}`;
  let app: express.Express;
  let workspaceId = '';
  let otherWorkspaceId = '';
  let userId = '';
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

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [workspaceId, userId]
    );

    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at, last_activity, created_at)
       VALUES ($1, $2, $3, now() + interval '1 hour', now(), now())`,
      [sessionId, userId, workspaceId]
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
  });

  it('lists current-workspace findings sorted by created_at desc with nested recipient and action candidates', async () => {
    const response = await request(app)
      .get('/api/fleetgraph/findings')
      .set('Cookie', [`session_id=${sessionId}`]);

    expect(response.status).toBe(200);
    expect(response.body.items.map((finding: { id: string }) => finding.id)).toEqual([
      pendingFinding.id,
      openFinding.id,
    ]);
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
});
