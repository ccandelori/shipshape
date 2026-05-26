import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import {
  FleetGraphChatScopeNotFoundError,
  resolveFleetGraphChatScope,
} from './chat.js';

type IdRow = {
  id: string;
};

describe('FleetGraph chat scope authorization', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let workspaceId = '';
  let otherWorkspaceId = '';
  let userId = '';
  let weekDocumentId = '';
  let projectDocumentId = '';
  let otherWorkspaceIssueId = '';
  let deletedIssueId = '';

  beforeAll(async () => {
    const workspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`FleetGraph Chat Scope ${testRunId}`]
    );
    workspaceId = workspaceResult.rows[0]!.id;

    const otherWorkspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`Other FleetGraph Chat Scope ${testRunId}`]
    );
    otherWorkspaceId = otherWorkspaceResult.rows[0]!.id;

    const userResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Chat Scope User')
       RETURNING id`,
      [`fleetgraph-chat-scope-${testRunId}@test.local`]
    );
    userId = userResult.rows[0]!.id;

    weekDocumentId = await createDocument(workspaceId, 'sprint', 'Scoped Week');
    projectDocumentId = await createDocument(workspaceId, 'project', 'Scoped Project');
    otherWorkspaceIssueId = await createDocument(otherWorkspaceId, 'issue', 'Other Workspace Issue');
    deletedIssueId = await createDocument(workspaceId, 'issue', 'Deleted Issue');

    await pool.query(
      `UPDATE documents SET deleted_at = now() WHERE id = $1`,
      [deletedIssueId]
    );
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

  it('resolves a supported document only inside the active workspace', async () => {
    await expect(resolveFleetGraphChatScope(pool, workspaceId, {
      documentId: weekDocumentId,
      documentType: 'sprint',
      question: 'What changed?',
      conversationHistory: [],
    })).resolves.toEqual({
      documentId: weekDocumentId,
      documentType: 'sprint',
      workspaceId,
      title: 'Scoped Week',
    });

    await expect(resolveFleetGraphChatScope(pool, workspaceId, {
      documentId: projectDocumentId,
      documentType: 'project',
      question: 'What changed?',
      conversationHistory: [],
    })).resolves.toMatchObject({
      documentId: projectDocumentId,
      documentType: 'project',
      workspaceId,
    });
  });

  it('fails closed for cross-workspace, type-mismatched, and deleted documents', async () => {
    const requests = [
      {
        documentId: otherWorkspaceIssueId,
        documentType: 'issue' as const,
      },
      {
        documentId: weekDocumentId,
        documentType: 'project' as const,
      },
      {
        documentId: deletedIssueId,
        documentType: 'issue' as const,
      },
    ];

    for (const request of requests) {
      await expect(resolveFleetGraphChatScope(pool, workspaceId, {
        documentId: request.documentId,
        documentType: request.documentType,
        question: 'What changed?',
        conversationHistory: [],
      })).rejects.toThrow(FleetGraphChatScopeNotFoundError);
    }
  });

  async function createDocument(
    documentWorkspaceId: string,
    documentType: 'sprint' | 'project' | 'issue',
    title: string
  ): Promise<string> {
    const result = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, $2, $3, 'workspace', $4, '{}'::jsonb)
       RETURNING id`,
      [documentWorkspaceId, documentType, title, userId]
    );

    return result.rows[0]!.id;
  }
});
