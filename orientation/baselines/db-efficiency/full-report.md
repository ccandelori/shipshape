# Category 4: Database Query Efficiency

## Evidence Status

Static analysis is complete. Live EXPLAIN samples are complete. Exact per-flow
query counts are not authoritative yet: the Docker log capture contains
prepared-statement elisions and duplicate per-flow files with different counts.
Use pg_stat_statements reset per flow, or request-scoped API query counting,
before using query count as a Phase 2 before/after metric.

## Methodology

- Scanned all 28 non-test route modules in `api/src/routes/`.
- Counted 589 `pool.query` / `client.query` call-sites across route modules.
- Reviewed `api/src/services/accountability.ts` and
  `api/src/middleware/visibility.ts`.
- Cross-checked JSONB predicates against `api/src/db/schema.sql` and 42
  migration files.
- Captured diagnostic Docker Postgres logs during five curl-driven user flows.
- Ran live `EXPLAIN (ANALYZE, BUFFERS)` on four high-value query shapes.

## Flow Summary

| Flow | Static expectation | Log lower bound | Main risk |
|---|---:|---:|---|
| Load main page | ~14-20 + action-items fan-out | 19 | Accountability N+1 + JSONB filters |
| View a document | 4-7 | 4 | Sequential dependent document queries |
| List issues | 4-6 | 4 | JSONB assignee join + CASE priority sort |
| Sprint/team board | 4-6 route queries | 10 | JSONB sprint/assignee filters + write loops |
| Search content | 3-7 | 7 | Leading-wildcard ILIKE |
| Action items | O(sprints + allocations) | not isolated | Awaited queries inside accountability loops |

## Live EXPLAIN Findings

| Query | Plan signal | Execution |
|---|---|---:|
| Dashboard active issues | Bitmap scan on all 104 issue docs, then filters 92 rows by JSONB `state` / `assignee_id` | 0.149 ms |
| Issues list | Scans/sorts all 104 issues; planning time exceeds execution time | 0.545 ms |
| Projects summary | Correlated subplans per project; Memoize 0 hits / 139 misses / 134 evictions | 0.742 ms |
| Search `%test%` | Seq Scan over 500 docs, 491 rows removed by filter | 0.604 ms |

All buffers were shared hits, so local execution times are best-case lower
bounds. The scan shapes are still meaningful and should guide Phase 2.

## Index Coverage

The live Docker database has 13 indexes on `documents`: the primary key,
10 scalar/partial btree indexes, one GIN index on `properties`, and one
dedicated JSONB expression index for person docs:

`idx_documents_person_user_id ON ((properties->>'user_id')) WHERE document_type='person'`.

High-value gaps:

- `(properties->>'assignee_id')::uuid` for issues/dashboard/team filters.
- `properties->>'state'` for issues/dashboard filters.
- `(properties->>'owner_id')::uuid` for project/program/week ownership.
- `(properties->>'sprint_number')::int` for week and team-board filters.
- `properties->>'priority'` for issue sorting.
- `title ILIKE '%q%'`, which needs `pg_trgm` or a separate search index.

## N+1 / Query Shape Findings

1. `api/src/services/accountability.ts:175-230` checks standups per active
   sprint with two awaited queries inside a loop. Severity: Critical.
2. `api/src/services/accountability.ts:262-319` counts issues per owned sprint
   inside a loop. Severity: Critical.
3. `api/src/services/accountability.ts:374-437` checks weekly plan and retro
   per allocation with two awaited queries. Severity: Critical.
4. `api/src/routes/team.ts:561-577` updates conflicting sprints one row at a
   time. Severity: High.
5. `api/src/routes/issues.ts` and `api/src/routes/documents.ts` insert
   document associations one row at a time. Severity: Medium.
6. `api/src/routes/projects.ts` uses correlated summary subqueries per project
   row. Severity: Medium/High.
7. `api/src/middleware/visibility.ts` repeats membership lookup work that auth
   has already resolved. Severity: Medium.

## Phase 2 Measurement Path

1. Re-capture dashboard/action-items with pg_stat_statements reset before each
   flow.
2. Batch accountability loops into set-based queries.
3. Add targeted JSONB expression indexes for issues/dashboard hot paths.
4. Re-run identical captures and compare both query count and EXPLAIN plans.
