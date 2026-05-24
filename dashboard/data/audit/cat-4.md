## Category 4: Database Query Efficiency

### Methodology

Static-analysis pass over all 28 non-test route modules in `api/src/routes/` (25 contain SQL, **589 `pool.query` / `client.query` call-sites**) plus `api/src/services/accountability.ts` and `api/src/middleware/visibility.ts`. For every JSONB property predicate in a WHERE/JOIN/ORDER BY clause, the audit checked `api/src/db/schema.sql` plus the 42 migration files for matching expression indexes. N+1 detection used two passes: (a) awaited `pool.query` / `client.query` calls lexically inside loops, and (b) sequential awaited queries inside hot handlers that could be folded into one JOIN/CTE.

Live evidence comes in two layers. **Layer A (initial walk 2026-05-19 morning):** query logging enabled on the Docker Postgres container via `ALTER SYSTEM SET log_statement='all'` + `pg_reload_conf()`; five flows walked with `curl`. The resulting docker-log counts are **lower bounds** — Postgres's stderr buffer dropped lines under burst. **Layer B (exact recapture 2026-05-19 evening):** enabled `pg_stat_statements` (added to `shared_preload_libraries`, restarted the container, `CREATE EXTENSION`), then re-walked each flow with `pg_stat_statements_reset()` between flows. The pg_stat_statements snapshots are **exact**. Live `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` plans now exist for the slowest query in every flow, captured against realistic seed-data parameters.

### Baseline metrics

**Status:** static analysis complete; **exact per-flow query counts captured via `pg_stat_statements`**; full EXPLAIN ANALYZE plan for each flow's slowest query saved at `baselines/explain-flow-{1..5}.txt`.

**Taskmaster acceptance:** The expected artifacts (`db-baseline.txt`, `queries-flow-{1..5}.log`, `explain-flow-{1..5}.txt`) now all exist at the root-level `orientation/baselines/` paths the task spec named. See `orientation/baselines/db-baseline.txt` for the index and methodology.

| # | User Flow | Endpoints walked | Exact calls (pg_stat_statements) | Unique stmts | Lower bound (docker log) | Drop ratio | Main risk |
|---|---|---|---:|---:|---:|---:|---|
| 1 | Load main page | `/api/auth/me` + `/api/dashboard/my-week` + `/api/dashboard/my-work` + `/api/standups?date=` + `/api/weekly-plans?date=` | **26** | 16 | 19 | docker dropped ~27% | Accountability N+1 + JSONB filters (5× session lookup is a separate finding) |
| 2 | View a document | `/api/documents/<id>` + `/api/documents/<id>/content` | **7** | 5 | 4 | docker dropped ~43% | Sequential dependent queries in `documents.ts` (visibility + associations + content) |
| 3 | List issues | `/api/issues` (default filters) | **5** | 5 | 4 | docker dropped ~20% | JSONB assignee join + CASE-priority sort over 104 rows |
| 4 | Sprint/team board | `/api/team/grid` + `/api/team/accountability` + `/api/team/projects` + `/api/team/people` | **21** | 11 | 10 | docker dropped ~52% | Seq Scan on `document_associations` + JSONB sprint/assignee filters |
| 5 | Search content | `/api/search/mentions?q=test` | **5** | 5 | 7 (likely keystroke-inflated) | n/a | Leading-wildcard ILIKE → Seq Scan over all candidate docs |

The lower-bound docker-log numbers are preserved in `baselines/db-efficiency/per-flow/*.txt` for evidence-of-process; the **exact `pg_stat_statements` snapshots in `baselines/queries-flow-{1..5}.log` are the authoritative source** for Phase 2 before/after work.

**PDF-format deliverable table:**

| User Flow | Total Queries | Slowest Query (ms) | N+1 Detected? |
|---|---:|---:|---|
| Load main page | 26 | 0.28 | **Yes** — accountability service N+1 (`services/accountability.ts:175–437`); 30–80 queries projected at production volume |
| View a document | 7 | 0.11 | No (sequential dependent queries in `documents.ts:244–323`; folds cleanly to one CTE/JOIN — not loop N+1) |
| List issues | 5 | 0.26 | No (single query, but post-filter scan: 92 of 104 rows filtered AFTER index scan via JSONB `state`/`assignee_id`) |
| Sprint/team board | 21 | 0.26 | **Yes** — per-row conflict-sprint UPDATE loop in `team.ts:561–577`; also Seq Scan on `document_associations` |
| Search content | 5 | 0.19 | No (single query, but Seq Scan via leading-wildcard `title ILIKE '%test%'`: 491 of 500 rows filtered) |

Slowest-query ms values are localhost warm-cache execution times (all `Buffers: shared hit`); production cold-cache will be materially slower. The query *shapes* (Seq Scan, post-filter row counts, Memoize 0/139) are the load-bearing findings.

### Index coverage analysis

The live Docker database has **13 indexes** on `documents`: the primary key, 10 scalar/partial btree indexes, one JSONB GIN index on `properties`, and one dedicated expression index (`idx_documents_person_user_id` on `(properties->>'user_id')` for person docs). The GIN index helps `?` / `@>` containment, but it does not cover casted scalar predicates like `(properties->>'assignee_id')::uuid = $1`.

| Column / Expression | Existing index? | Verdict |
|---|---|---|
| `documents.workspace_id` | `idx_documents_workspace_id` | covered |
| `documents.document_type` | `idx_documents_document_type` | covered |
| `documents.parent_id` | `idx_documents_parent_id` | covered |
| `documents.visibility` / `(visibility, created_by)` | `idx_documents_visibility`, `idx_documents_visibility_created_by` | covered |
| `archived_at IS NULL` / `deleted_at IS NULL` | `idx_documents_active(workspace_id, document_type) WHERE …` | covered (partial) |
| `properties` (containment) | `idx_documents_properties` GIN | partial — `?`/`@>` only |
| `properties->>'user_id'` (person docs) | `idx_documents_person_user_id` expression | covered |
| `(properties->>'assignee_id')::uuid` | **none** | **UNCOVERED** — dashboard, issues, team grid, programs, admin |
| `properties->>'state'` (eq + IN + NOT IN) | none | UNCOVERED — every issues query |
| `(properties->>'owner_id')::uuid` | none | UNCOVERED — projects, programs, sprints |
| `(properties->>'sprint_number')::int` | none | UNCOVERED — weeks, projects, team grid |
| `properties->>'project_id'` | none | UNCOVERED — sprint→project lookups |
| `properties->>'person_id'` | none | UNCOVERED — every weekly_plan/retro/standup |
| `properties->>'week_number'` (cast int) | none | UNCOVERED |
| `properties->>'author_id'` (standups) | none | UNCOVERED |
| `properties->>'date'` (standups) | none | UNCOVERED |
| `properties->'assignee_ids'` (array containment) | GIN on `properties` | partial — planner-dependent |
| `properties->>'priority'` (sort) | none | UNCOVERED — issues sort uses CASE |
| `documents.title ILIKE '%q%'` | impossible (leading wildcard) | UNCOVERED — needs `pg_trgm` GIN |
| `document_associations` keys / `relationship_type` | all covered |   |
| `documents.ticket_number` (per workspace) | none | UNCOVERED — `GET /api/issues/by-ticket/:number` scans |

**Summary:** of the JSONB property expressions used in route SQL, **only 1 hot path has a dedicated expression index** (person→user_id). The live dashboard active-issues EXPLAIN confirms the planner scans all issue documents and filters `state`/`assignee_id` from JSONB afterward.

### N+1 patterns found in code

| # | File | Lines | Pattern | Severity |
|---|---|---|---|---|
| 1 | `api/src/services/accountability.ts` | 175–230 | `for (const sprint of activeSprintsResult.rows)` then 2 awaited queries (today-standup + last-standup). Backs `/api/accountability/action-items` and dashboard. | **Critical** |
| 2 | `api/src/services/accountability.ts` | 262–319 | `for (const sprint of sprintsResult.rows)` with awaited issue-count query per sprint. | **Critical** |
| 3 | `api/src/services/accountability.ts` | 374–437 | `for (const allocation of allocations)` with 2 awaited queries (weekly_plan + weekly_retro). Multiplies by allocations × persons × sprints. | **Critical** |
| 4 | `api/src/routes/team.ts` | 561–577 | `for (const conflicting of conflictingSprints.rows) { await pool.query(UPDATE...) }` in `POST /api/team/assign`. Should be `UPDATE ... WHERE id = ANY($ids)` with `jsonb_set`. | High |
| 5 | `api/src/routes/issues.ts` | 627–634 | Per-row association INSERT loop in `POST /api/issues`. Folds into a single multi-row INSERT. | Medium |
| 6 | `api/src/routes/issues.ts` | 638–653 | Per-sprint `SELECT COUNT(*)` fan-out post-commit. | Medium |
| 7 | `api/src/routes/issues.ts` | 944–952 | Same multi-row INSERT antipattern in `PATCH`. | Medium |
| 8 | `api/src/routes/issues.ts` | 971–982 | Per-sprint count fan-out in `PATCH`. | Medium |
| 9 | `api/src/routes/documents.ts` | 244–323 | `GET /api/documents/:id` — `canAccessDocument` + up to 4 sequential dependent queries. Same shape in PATCH at 519–574, 760, 847–905, 952–1018. Sequential-await chain that JOINs cleanly. | Medium |
| 10 | `api/src/routes/documents.ts` | 544–574 | Per-row association INSERT in `POST /api/documents`. | Medium |
| 11 | `api/src/routes/programs.ts` | 814–826 | Program merge history is inserted one child at a time inside a transaction. Not hot-path, but batchable with `INSERT … SELECT` from the captured child set. | Low |
| 12 | `api/src/routes/caia-auth.ts` | 203–219 | Per-invite acceptance loop calls `linkUserToWorkspaceViaInvite(...)`; cold auth path, but query work may multiply by pending invites. | Low |
| 13 | `api/src/middleware/visibility.ts` | 6–11, 30 | Every list call runs `isWorkspaceAdmin` — extra `SELECT role FROM workspace_memberships`. Cacheable per request. | Medium |

### Live EXPLAIN Samples

The authoritative flow-specific plans are `orientation/baselines/explain-flow-{1..5}.txt`. The four targeted samples below are retained because they illustrate the hottest reusable query shapes. They fit in `shared_buffers` (no disk reads), so the execution times are localhost lower bounds; the scan shapes are still meaningful.

**1. `/api/issues` main query** (`issues.ts:115`) — joins `documents` ↔ `users` ↔ person documents via `(properties->>'assignee_id')::uuid` and `(properties->>'user_id')::uuid`:

```
Hash Right Join (cost=5.84..37.22 rows=24 width=56) (actual time=0.037..0.084 rows=20)
  Hash Cond: (((p.properties ->> 'user_id'::text))::uuid = u.id)
  -> Bitmap Heap Scan on documents p  (cost=4.30..35.62 rows=20)
       Recheck Cond: (document_type = 'person'::document_type)
       -> Bitmap Index Scan on idx_documents_document_type  (cost=0.00..4.30 rows=20)
  -> Hash → Seq Scan on users u  (rows=20)
Planning Time: 2.010 ms
Execution Time: 0.545 ms
```

Notable: **planning time (2.010 ms) is ~4x execution time**. With 20 users and 20 live person docs, the seq scan on `users` is cheap, but the query still scans all 104 issues and sorts with a CASE expression on JSONB priority.

**2. `/api/projects` correlated summary subqueries** — per project row, the plan re-enters `document_associations` and documents:

```
Index Scan using idx_documents_active on documents d (actual time=0.205..0.608 rows=15)
  SubPlan 1 ... loops=15
  SubPlan 2 ...
    Nested Loop (actual time=0.013..0.025 rows=7 loops=15)
  -> Bitmap Heap Scan on document_associations ia  (rows=3 actual rows=9 loops=15)
        Recheck Cond: ((related_id = d.id) AND (relationship_type = 'project'))
        -> Bitmap Index Scan on idx_document_associations_related_type
  -> Memoize  (Hits: 0  Misses: 139  Evictions: 134)
        Cache Key: ia.document_id
        -> Index Scan using documents_pkey on documents i  (loops=139)
Planning Time: 2.085 ms
Execution Time: 0.742 ms
```

**Memoize cache: 0 hits / 139 misses / 134 evictions.** The correlated shape has unique outer keys, so Memoize does not help. Collapse this into grouped joins or a summary CTE before using it as a Phase 2 target.

**3. Dashboard "my active issues"** (`dashboard.ts:95–114`) — `WHERE document_type='issue' AND (properties->>'assignee_id')::uuid = $user AND properties->>'state' NOT IN ('done','cancelled')`:

```
Sort (Memory: 28kB)
  Sort Key: updated_at DESC
  -> Bitmap Heap Scan on documents d  (rows=1 actual rows=12)
       Recheck Cond: (document_type = 'issue')
       Filter: ((archived_at IS NULL) AND (deleted_at IS NULL)
                AND (workspace_id = …)
                AND ((properties ->> 'state') <> ALL ('{done,cancelled}'))
                AND (((properties ->> 'assignee_id'))::uuid = …))
       Rows Removed by Filter: 92  ← 88% of issues filtered AFTER index scan
       Heap Blocks: exact=7
       -> Bitmap Index Scan on idx_documents_document_type  (rows=104)
Planning Time: 0.906 ms
Execution Time: 0.149 ms
```

**Confirmed:** the planner uses `idx_documents_document_type`, scans all 104 issue docs, then filters to 12. At larger workspaces this is the cleanest expression-index target: a partial assignee/state index should avoid fetching every issue heap tuple before filtering.

**4. Search ILIKE `%test%`** (`search.ts`):

```
Limit  (rows=8 actual rows=9)
  -> Seq Scan on documents d  (rows=8 actual rows=9)
       Filter: ((archived_at IS NULL) AND (deleted_at IS NULL)
                AND (title ~~* '%test%'::text)
                AND (workspace_id = …))
       Rows Removed by Filter: 491
Planning Time: 0.854 ms
Execution Time: 0.604 ms
```

**Seq Scan confirmed.** Leading-wildcard `ILIKE` is not sargable on btree. The query removed 491 of 500 docs by filter. At 50K docs this becomes a 50K-row scan per keystroke unless search uses `pg_trgm` or a separate search index.

### Methodology caveats (read alongside the numbers)

1. **All buffers are `shared hit`** — every page Postgres needed was in memory. Production Aurora/RDS cold-cache misses will add latency the local run cannot show.
2. **Seed volume now meets the brief's floor but is still small**: 500 documents, 104 issues, 20 users, 35 sprints. Bad scan shapes look cheap at this size.
3. **Planning time is often comparable to execution time** on this dataset; production risk is more about plan shape and row growth than the local millisecond totals.
4. **Docker log counts are lower bounds; pg_stat_statements counts are exact.** The `baselines/db-efficiency/per-flow/*` files are kept as evidence-of-process; the authoritative per-flow counts live in `baselines/queries-flow-{1..5}.log`.
5. **N+1 accountability findings remain static-confirmed.** Even with the exact pg_stat_statements totals (26 for `/my-week`, 21 for the team board), the call attribution to individual loops still depends on reading the code; pg_stat_statements aggregates by query *shape*, not by call site.

### Top findings

1. **Dashboard/issues JSONB filters are live-confirmed index gaps.** The dashboard active-issues EXPLAIN scans all 104 issue documents via `idx_documents_document_type`, then filters 92 rows by JSONB `state` and `assignee_id`. Expression/partial indexes on the issue hot paths are the highest-confidence DB fix. **Severity: High.**
2. **Search is a confirmed table scan.** `title ILIKE '%test%'` Seq Scans all 500 documents and removes 491 by filter. Use `pg_trgm`/GIN or a search index before document volume grows. **Severity: High.**
3. **Accountability inference is the dominant static N+1 surface.** `services/accountability.ts` has awaited queries inside loops over active sprints, owned sprints, and allocations. This still needs targeted live isolation, but the code shape is unambiguous and likely exceeds the 20% query-count reduction target when batched. **Severity: Critical.**
4. **`/api/projects` has live-confirmed correlated subquery work.** The project summary plan runs subplans per project row and Memoize has 0 hits. It is not the slowest local query at 15 projects, but it scales poorly. **Severity: Medium/High.**
5. **`documents.ts GET /:id` sequential await chain.** Up to 4 awaited dependent queries after access checks. It is not loop-N+1, but it adds round trips to a hot document-view path and can become one CTE/JOIN query. **Severity: Medium.**
6. **Multi-row writes are implemented as per-row loops.** Association inserts in `documents.ts`/`issues.ts` and conflicting-sprint updates in `team.ts` should be single batched statements. **Severity: Medium/High.**
7. **Visibility context repeats membership lookups.** `getVisibilityContext` adds a query to list endpoints even though auth has already resolved session/workspace context. Request/session caching removes this everywhere. **Severity: Medium.**

### Improvement target (per brief)

**20%** reduction in total query count on **at least 1** user flow, OR **50%** improvement on the slowest query. The most defensible Phase 2 measurement path is:

1. Re-capture the dashboard/action-items flow with pg_stat_statements reset before/after.
2. Batch the accountability loops into set-based queries.
3. Add targeted expression indexes for dashboard/issues JSONB predicates.
4. Re-run the same capture and compare query count plus the dashboard active-issues EXPLAIN.

### Raw data files

**Authoritative (Taskmaster-acceptance paths, exact `pg_stat_statements`):**

- `orientation/baselines/db-baseline.txt` — root index, methodology, exact per-flow counts, EXPLAIN highlights, recapture command
- `orientation/baselines/queries-flow-1.log` — Load main page: 26 calls, 16 unique statements
- `orientation/baselines/queries-flow-2.log` — View a document: 7 calls, 5 unique statements
- `orientation/baselines/queries-flow-3.log` — List issues: 5 calls, 5 unique statements
- `orientation/baselines/queries-flow-4.log` — Sprint/team board: 21 calls, 11 unique statements
- `orientation/baselines/queries-flow-5.log` — Search content: 5 calls, 5 unique statements
- `orientation/baselines/explain-flow-1.txt` — EXPLAIN ANALYZE on weekly_plan list with person + project joins
- `orientation/baselines/explain-flow-2.txt` — EXPLAIN ANALYZE on session lookup (the slowest in this flow)
- `orientation/baselines/explain-flow-3.txt` — EXPLAIN ANALYZE on issues list with CASE-priority sort
- `orientation/baselines/explain-flow-4.txt` — EXPLAIN ANALYZE on team-grid issue×sprint×program join (Seq Scan on document_associations confirmed)
- `orientation/baselines/explain-flow-5.txt` — EXPLAIN ANALYZE on `title ILIKE '%test%'` (Seq Scan confirmed)

**Evidence of process (kept; not load-bearing):**

- `orientation/baselines/db-efficiency/methodology.md` — runbook for live capture (Layer A)
- `orientation/baselines/db-efficiency/walk-raw.log` — docker logs capture during the 5-flow walk (diagnostic/lower-bound)
- `orientation/baselines/db-efficiency/flow-summary.txt` — repaired summary of static expectations + log lower bounds
- `orientation/baselines/db-efficiency/per-flow/*.txt` — per-flow query listings from Layer A (docker logs; partial)
- `orientation/baselines/db-efficiency/explain-issues.txt`, `explain-projects.txt`, `explain-dashboard-issues.txt`, `explain-search.txt` — earlier EXPLAIN samples with different parameter shapes; cross-check against the flow-named files above
- `orientation/baselines/db-efficiency/full-report.md` — narrative N+1 catalog and verbose findings

---
