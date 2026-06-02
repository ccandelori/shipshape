import { CursorPayload, Cursor, PUBLIC_ERROR_CODES } from '@ship/shared';

// Pure cursor encode/decode for stable pagination on (ts, id).
// Uses base64url for opaque cursor. ts is ISO string for created_at or updated_at.
// Throws typed error shape compatible with PublicApiError (caller maps to response).

export function encodeCursor(payload: CursorPayload): Cursor {
  const json = JSON.stringify({ id: payload.id, ts: payload.ts });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    if (!cursor || typeof cursor !== 'string') {
      throw new Error('empty');
    }
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (typeof parsed.id !== 'string' || typeof parsed.ts !== 'string') {
      throw new Error('shape');
    }
    // Basic sanity: id looks uuid-ish, ts iso-ish
    if (!/^[0-9a-f-]{8,}$/i.test(parsed.id) || !parsed.ts.includes('T')) {
      throw new Error('format');
    }
    return { id: parsed.id, ts: parsed.ts } as CursorPayload;
  } catch {
    const err: any = new Error('Invalid cursor');
    err.code = PUBLIC_ERROR_CODES.INVALID_CURSOR;
    err.status = 400;
    err.details = { cursor };
    throw err;
  }
}

// Helper to build the WHERE clause for stable pagination (for created_at or updated_at).
// Usage in SQL: ... AND (created_at > $ts OR (created_at = $ts AND id > $id)) ORDER BY created_at ASC, id ASC LIMIT ...
export function buildCursorWhere(column: 'created_at' | 'updated_at', cursor: CursorPayload | null): { clause: string; params: any[] } {
  if (!cursor) {
    return { clause: '', params: [] };
  }
  // Note: caller supplies the param placeholders correctly in full query.
  // We return the condition snippet; params are [cursor.ts, cursor.id]
  return {
    clause: ` AND (${column} > $1::timestamptz OR (${column} = $1::timestamptz AND id > $2)) `,
    params: [cursor.ts, cursor.id],
  };
}
