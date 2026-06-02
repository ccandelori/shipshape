// Narrow SprintPort for public DIP. Uses document_type='sprint'.
// Publish after success. Minimal.

import { pool } from '../../db/client.js';
import { inMemoryBus } from '../events/inMemoryBus.js';
import { encodeCursor, decodeCursor } from '../contracts/cursor.js';
import { Cursor, PUBLIC_EVENT_TYPES } from '@ship/shared';

export interface SprintPort {
  create(input: { title: string; workspaceId: string; authorId?: string | null; start_date?: string; end_date?: string }): Promise<{ id: string; title: string; start_date?: string; end_date?: string; created_at?: string }>;
  getById(id: string, workspaceId: string): Promise<{ id: string; title: string; start_date?: string; end_date?: string; created_at?: string; updated_at?: string } | null>;
  list(params: { workspaceId: string; cursor?: Cursor; limit?: number }): Promise<{ items: Array<{ id: string; title: string; start_date?: string; end_date?: string; created_at?: string }>; nextCursor?: Cursor }>;
  update(id: string, workspaceId: string, patch: { title?: string; start_date?: string; end_date?: string }): Promise<{ id: string; title: string; updated_at?: string } | null>;
  delete(id: string, workspaceId: string): Promise<boolean>;
}

function extractSprintPublic(row: any) {
  const props = row.properties || {};
  return {
    id: row.id,
    title: row.title,
    start_date: props.start_date,
    end_date: props.end_date,
    status: props.sprint_status || props.status,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export const sprintPort: SprintPort = {
  async create(input) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const props: any = {};
      if (input.start_date) props.start_date = input.start_date;
      if (input.end_date) props.end_date = input.end_date;
      props.sprint_status = 'planned';

      const res = await client.query(
        `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
         VALUES ($1, 'sprint', $2, $3, $4)
         RETURNING id, title, created_at, updated_at, properties`,
        [input.workspaceId, input.title, JSON.stringify(props), input.authorId || null]
      );
      const row = res.rows[0];
      if (!row) throw new Error('insert failed');

      const sprint = extractSprintPublic(row);

      await inMemoryBus.publish({
        type: PUBLIC_EVENT_TYPES.SPRINT_STARTED,
        payload: { id: sprint.id, title: sprint.title, workspace_id: input.workspaceId },
        idempotencyKey: `sprint-create-${sprint.id}`,
      });

      await client.query('COMMIT');
      return sprint;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async getById(id, workspaceId) {
    const res = await pool.query(
      `SELECT id, title, created_at, updated_at, properties
       FROM documents
       WHERE id = $1 AND workspace_id = $2 AND document_type = 'sprint' AND deleted_at IS NULL`,
      [id, workspaceId]
    );
    const row = res.rows[0];
    return row ? extractSprintPublic(row) : null;
  },

  async list(params) {
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    let cursorPayload: { id: string; ts: string } | null = null;
    if (params.cursor) cursorPayload = decodeCursor(params.cursor);

    const queryParams: any[] = [params.workspaceId];
    let sql: string;
    if (cursorPayload) {
      sql = `
        SELECT id, title, created_at, updated_at, properties
        FROM documents
        WHERE workspace_id = $1 AND document_type = 'sprint' AND deleted_at IS NULL
          AND (created_at > $2::timestamptz OR (created_at = $2::timestamptz AND id > $3))
        ORDER BY created_at ASC, id ASC
        LIMIT $4
      `;
      queryParams.push(cursorPayload.ts, cursorPayload.id, limit + 1);
    } else {
      sql = `
        SELECT id, title, created_at, updated_at, properties
        FROM documents
        WHERE workspace_id = $1 AND document_type = 'sprint' AND deleted_at IS NULL
        ORDER BY created_at ASC, id ASC
        LIMIT $2
      `;
      queryParams.push(limit + 1);
    }

    const res = await pool.query(sql, queryParams);
    const rows = res.rows;
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(extractSprintPublic);

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

      const curRes = await client.query(`SELECT properties FROM documents WHERE id=$1 AND workspace_id=$2 AND document_type='sprint' AND deleted_at IS NULL`, [id, workspaceId]);
      if (curRes.rows.length === 0) { await client.query('ROLLBACK'); return null; }
      const curProps = curRes.rows[0].properties || {};
      const newProps = { ...curProps };
      if (patch.start_date !== undefined) newProps.start_date = patch.start_date;
      if (patch.end_date !== undefined) newProps.end_date = patch.end_date;

      const sets: string[] = ['properties = $3', 'updated_at = now()'];
      const vals: any[] = [id, workspaceId, JSON.stringify(newProps)];
      if (patch.title !== undefined) { sets.unshift('title = $4'); vals.push(patch.title); }

      const sql = `UPDATE documents SET ${sets.join(', ')} WHERE id = $1 AND workspace_id = $2 AND document_type = 'sprint' AND deleted_at IS NULL RETURNING id, title, updated_at, properties`;
      const res = await client.query(sql, vals);
      const row = res.rows[0];
      if (!row) { await client.query('ROLLBACK'); return null; }

      const sprint = { id: row.id, title: row.title, updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined };

      await inMemoryBus.publish({
        type: PUBLIC_EVENT_TYPES.SPRINT_COMPLETED, // or started; generic for update
        payload: { id: sprint.id, title: sprint.title, workspace_id: workspaceId },
        idempotencyKey: `sprint-update-${sprint.id}`,
      });

      await client.query('COMMIT');
      return sprint;
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
         WHERE id = $1 AND workspace_id = $2 AND document_type = 'sprint' AND deleted_at IS NULL
         RETURNING id`,
        [id, workspaceId]
      );
      const deleted = res.rows.length > 0;
      if (deleted) {
        await inMemoryBus.publish({
          type: PUBLIC_EVENT_TYPES.SPRINT_COMPLETED,
          payload: { id, workspace_id: workspaceId },
          idempotencyKey: `sprint-delete-${id}`,
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
