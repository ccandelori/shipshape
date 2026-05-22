import type { Request } from 'express';
import { pool } from '../db/client.js';

/**
 * Check if user is a workspace admin.
 *
 * When `req` is supplied, this reads from `req.membership` populated by
 * authMiddleware (one query per request) instead of re-querying. Otherwise
 * falls back to a direct DB lookup for backward compatibility with call sites
 * that don't have a Request handy.
 */
export async function isWorkspaceAdmin(
  userId: string,
  workspaceId: string,
  req?: Request
): Promise<boolean> {
  if (req?.membership) {
    return req.membership.role === 'admin';
  }
  const result = await pool.query<{ role: 'admin' | 'member' }>(
    'SELECT role FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId]
  );
  return result.rows[0]?.role === 'admin';
}

/**
 * Get visibility filter context for SQL queries.
 * Returns the isAdmin boolean that should be used with visibility filter SQL.
 *
 * The visibility filter pattern is:
 *   (visibility = 'workspace' OR created_by = $userId OR $isAdmin = TRUE)
 *
 * This allows:
 * - All workspace-visible documents to be seen by everyone
 * - Private documents to be seen only by their creator
 * - Admins to see all documents
 *
 * Pass `req` to reuse the membership lookup already done in authMiddleware.
 */
export async function getVisibilityContext(
  userId: string,
  workspaceId: string,
  req?: Request
): Promise<{ isAdmin: boolean }> {
  const isAdmin = await isWorkspaceAdmin(userId, workspaceId, req);
  return { isAdmin };
}

/**
 * SQL fragment for visibility filtering.
 * Use with parameterized queries where:
 * - $N is userId
 * - $N+1 is isAdmin boolean
 *
 * Example:
 *   const { isAdmin } = await getVisibilityContext(userId, workspaceId);
 *   const query = `
 *     SELECT * FROM documents d
 *     WHERE d.workspace_id = $1
 *       AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
 *   `;
 *   await pool.query(query, [workspaceId, userId, isAdmin]);
 */
export function VISIBILITY_FILTER_SQL(
  tableAlias: string,
  userIdParam: string,
  isAdminParam: string
): string {
  return `(${tableAlias}.visibility = 'workspace' OR ${tableAlias}.created_by = ${userIdParam} OR ${isAdminParam} = TRUE)`;
}
