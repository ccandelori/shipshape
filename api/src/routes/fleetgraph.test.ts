import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { pool } from '../db/client.js';
import fleetGraphRouter from './fleetgraph.js';

type IdRow = {
  id: string;
};

type SeededFinding = {
  id: string;
  title: string;
  lifecycleState: string;
};

describe('FleetGraph inbox API', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sessionId = `fleetgraph-inbox-${testRunId}`;
  let app: express.Express;
  let workspaceId = '';
  let otherWorkspaceId = '';
  let userId = '';
  let scopedDocumentId = '';
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

  async function createActionCandidate(findingId: string, targetDocumentId: string): Promise<void> {
    await pool.query(
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
       )`,
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
  }
});
