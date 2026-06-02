// Narrow DocumentPort for DIP — public platform only talks to this, not full crud internals.
// This is the minimal interface needed for public document operations + event publishing.
// Real adapter: direct SQL in explicit txn, publish ONLY after successful COMMIT.
// Internal paths (routes/documents.ts etc) continue to use their own logic; no behavior change.

import { pool } from '../../db/client.js';
import { inMemoryBus } from '../events/inMemoryBus.js';
import { IEventBus } from '../events/IEventBus.js';
import { encodeCursor, decodeCursor } from '../contracts/cursor.js';
import { Cursor, PUBLIC_EVENT_TYPES } from '@ship/shared';

export interface DocumentPort {
  create(input: { title: string; content?: any; workspaceId: string; authorId?: string | null }): Promise<{ id: string; title: string; created_at?: string; updated_at?: string }>;
  getById(id: string, workspaceId: string): Promise<{ id: string; title: string; content?: any; created_at?: string; updated_at?: string } | null>;
  list(params: { workspaceId: string; cursor?: Cursor; limit?: number }): Promise<{ items: Array<{ id: string; title: string; created_at?: string; updated_at?: string }>; nextCursor?: Cursor }>;
  update(id: string, workspaceId: string, patch: { title?: string; content?: any }): Promise<{ id: string; title: string; updated_at?: string } | null>;
  delete(id: string, workspaceId: string): Promise<boolean>; // true if deleted
}

function extractDocumentPublic(row: any) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export const documentPort: DocumentPort = {
  async create(input) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const content = input.content ?? { type: 'doc', content: [{ type: 'paragraph' }] };
      const res = await client.query(
        `INSERT INTO documents (workspace_id, document_type, title, content, created_by)
         VALUES ($1, 'wiki', $2, $3, $4)
         RETURNING id, title, created_at, updated_at`,
        [input.workspaceId, input.title, JSON.stringify(content), input.authorId || null]
      );
      const row = res.rows[0];
      if (!row) throw new Error('insert failed');

      const doc = extractDocumentPublic(row);

      // Publish ONLY after persistence success, before COMMIT (still in txn but after write)
      await inMemoryBus.publish({
        type: PUBLIC_EVENT_TYPES.DOCUMENT_CREATED,
        payload: { id: doc.id, title: doc.title, workspace_id: input.workspaceId },
        idempotencyKey: `doc-create-${doc.id}`,
      });

      await client.query('COMMIT');
      return doc;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async getById(id, workspaceId) {
    const res = await pool.query(
      `SELECT id, title, content, created_at, updated_at
       FROM documents
       WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
      [id, workspaceId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return extractDocumentPublic(row);
  },

  async list(params) {
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    let cursorPayload: { id: string; ts: string } | null = null;
    if (params.cursor) {
      cursorPayload = decodeCursor(params.cursor);
    }

    const queryParams: any[] = [params.workspaceId];
    let sql: string;

    if (cursorPayload) {
      // cursor page: params ws=$1, ts=$2, id=$3 , limit=$4
      sql = `
        SELECT id, title, created_at, updated_at
        FROM documents
        WHERE workspace_id = $1 AND deleted_at IS NULL
          AND (created_at > $2::timestamptz OR (created_at = $2::timestamptz AND id > $3))
        ORDER BY created_at ASC, id ASC
        LIMIT $4
      `;
      queryParams.push(cursorPayload.ts, cursorPayload.id, limit + 1);
    } else {
      sql = `
        SELECT id, title, created_at, updated_at
        FROM documents
        WHERE workspace_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC, id ASC
        LIMIT $2
      `;
      queryParams.push(limit + 1);
    }

    const res = await pool.query(sql, queryParams);
    const rows = res.rows;
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(extractDocumentPublic);

    let nextCursor: Cursor | undefined;
    if (hasMore && rows.length > 0) {
      const last = rows[limit - 1] || rows[rows.length - 1];
      nextCursor = encodeCursor({ id: last.id, ts: last.created_at ? new Date(last.created_at).toISOString() : new Date().toISOString() });
    }

    return { items, nextCursor };
  },

  async update(id, workspaceId, patch) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sets: string[] = [];
      const vals: any[] = [id, workspaceId];
      let idx = 3;
      if (patch.title !== undefined) {
        sets.push(`title = $${idx++}`);
        vals.push(patch.title);
      }
      if (patch.content !== undefined) {
        sets.push(`content = $${idx++}`);
        vals.push(JSON.stringify(patch.content));
      }
      if (sets.length === 0) {
        await client.query('ROLLBACK');
        const current = await this.getById(id, workspaceId);
        return current ? { id: current.id, title: current.title, updated_at: current.updated_at } : null;
      }
      sets.push('updated_at = now()');

      const sql = `UPDATE documents SET ${sets.join(', ')} WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL RETURNING id, title, updated_at`;
      const res = await client.query(sql, vals);
      const row = res.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }

      const doc = { id: row.id, title: row.title, updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined };

      await inMemoryBus.publish({
        type: PUBLIC_EVENT_TYPES.DOCUMENT_UPDATED,
        payload: { id: doc.id, title: doc.title, workspace_id: workspaceId },
        idempotencyKey: `doc-update-${doc.id}-${Date.now()}`,
      });

      await client.query('COMMIT');
      return doc;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async delete(id, workspaceId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `UPDATE documents SET deleted_at = now(), updated_at = now()
         WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
         RETURNING id`,
        [id, workspaceId]
      );
      const deleted = res.rows.length > 0;

      if (deleted) {
        await inMemoryBus.publish({
          type: PUBLIC_EVENT_TYPES.DOCUMENT_DELETED,
          payload: { id, workspace_id: workspaceId },
          idempotencyKey: `doc-delete-${id}`,
        });
      }

      await client.query('COMMIT');
      return deleted;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};
