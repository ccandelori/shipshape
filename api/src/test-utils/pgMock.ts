import type { QueryResult, QueryResultRow } from 'pg'

/**
 * Typed helper for mocking pg `Pool.query` return values in tests.
 *
 * Before this helper, every test had to write `mockResolvedValue({ rows: […] } as any)`
 * because `pool.query`'s overload signatures expect a full `QueryResult` shape.
 * The cast hid real type errors (e.g., wrong row shape) and bloated the
 * type-safety baseline by ~100 violations across 4 test files.
 *
 * Usage:
 *   import { pgResult } from '@/test-utils/pgMock'
 *   vi.mocked(pool.query).mockResolvedValue(pgResult([{ id: 1, name: 'x' }]))
 */
export function pgResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  }
}

/**
 * `pgResult` for an empty result set.
 */
export const pgEmpty: QueryResult<QueryResultRow> = pgResult<QueryResultRow>([])
