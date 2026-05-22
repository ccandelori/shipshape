import type { QueryResult, QueryResultRow } from 'pg'
import type { Mock } from 'vitest'
import { vi } from 'vitest'
import { pool } from '../db/client.js'

/**
 * Typed helper for mocking pg `Pool.query` return values in tests.
 *
 * Before this helper, every test had to write `mockResolvedValue({ rows: […] } as any)`
 * because `pool.query`'s overload signatures expect a full `QueryResult` shape.
 * The cast hid real type errors (e.g., wrong row shape) and bloated the
 * type-safety baseline by ~100 violations across 4 test files.
 */
export function pgResult<T extends QueryResultRow = QueryResultRow>(
  rows: T[]
): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  }
}

/**
 * A simplified pg.Pool.query mock surface. Vitest's overload inference on the
 * real `Pool.query` typing infers `Promise<void>` once any chained call passes
 * an `any` parameter, which then forces every subsequent chained
 * `mockResolvedValueOnce(pgResult(...))` to also need an `as any` cast — defeating
 * the point of the typed helper.
 *
 * Acquiring `pool.query` through this single typed alias once at the top of each
 * test file collapses the chain to a uniform `Mock<args, Promise<QueryResult>>`,
 * letting every per-call `mockResolvedValueOnce(pgResult([...]))` be cast-free.
 */
export type MockedPgQuery = Mock<
  (text: string, params?: unknown[]) => Promise<QueryResult<QueryResultRow>>
>

/**
 * Acquire a typed handle on the mocked `pool.query`. Use this once per test
 * file (typically inside `beforeEach` or as a module-level const) and reuse
 * across all per-test mock chains.
 *
 * Example:
 *   const mockQuery = mockedPool()
 *   mockQuery
 *     .mockResolvedValueOnce(pgResult([{ id: '1' }]))
 *     .mockResolvedValueOnce(pgResult([]))
 */
export function mockedPool(): MockedPgQuery {
  return vi.mocked(pool.query) as unknown as MockedPgQuery
}

/**
 * `pgResult` for an empty result set.
 */
export const pgEmpty: QueryResult<QueryResultRow> = pgResult([])
