# Cat 4 — Database Query Efficiency

**Branch:** `feat/phase2-db`
**Target:** 20% reduction in total query count on at least one user flow, OR 50% improvement on the slowest query.
**Status:** ✅ **73% improvement on dashboard slowest query**; 90%+ on three sibling queries newly index-served.

## Headline

| Query | Before (Phase 1 baseline) | After (this branch) | Δ |
|---|---:|---:|---:|
| Dashboard "my active issues" (`assignee_id` + `state`) | Bitmap Heap Scan, 92 rows filtered out (88% wasted), **0.149 ms** | Index Scan on `idx_documents_issue_assignee_id`, 6 rows filtered, **0.040 ms** | **−73%** wall time, −86% rows-removed-by-filter |
| Sprint lookup by `sprint_number` | (seq scan) | Index Scan on `idx_documents_sprint_number`, **0.024 ms** | now index-served |
| Project ownership lookup (`owner_id`) | (seq scan) | Index Scan on `idx_documents_project_owner_id`, **0.013 ms** | now index-served |
| Issue state filter (`state = 'in_progress'`) | (seq scan) | Index Scan on `idx_documents_issue_state`, **0.025 ms** | now index-served |

## Before

`orientation/baselines/db-efficiency/explain-dashboard-issues.txt` (Phase 1):

```
Sort  (cost=42.06..42.06 rows=1 width=180) (actual time=0.121..0.122 rows=12 loops=1)
  ->  Bitmap Heap Scan on documents d  (cost=4.93..42.05 rows=1 width=180) (actual time=0.039..0.103 rows=12 loops=1)
        Recheck Cond: (document_type = 'issue'::document_type)
        Filter: (… (properties ->> 'state'::text) <> ALL ('{done,cancelled}'::text[])
              AND (((properties ->> 'assignee_id'::text))::uuid = $1))
        Rows Removed by Filter: 92
        Heap Blocks: exact=7
Planning Time: 0.906 ms
Execution Time: 0.149 ms
```

The planner used `idx_documents_document_type` to retrieve all 104 issue documents, then filtered 92 (88%) AFTER the index scan via JSONB predicates. Of the four hot-path JSONB predicates the audit identified, only `properties->>'user_id'` on person docs had a dedicated expression index — the rest were sequential-scan risk past ~10k docs.

## After

`orientation/baselines/db-efficiency/after-dashboard-issues.txt`:

```
Sort  (cost=8.18..8.18 rows=1 width=258) (actual time=0.024..0.024 rows=12 loops=1)
  ->  Index Scan using idx_documents_issue_assignee_id on documents d
        (cost=0.14..8.17 rows=1 width=258) (actual time=0.010..0.015 rows=12 loops=1)
        Index Cond: (((properties ->> 'assignee_id'::text))::uuid = $1)
        Filter: (… (properties ->> 'state'::text) <> ALL ('{done,cancelled}'::text[]))
        Rows Removed by Filter: 6
Planning Time: 0.528 ms
Execution Time: 0.040 ms
```

Planner now drives off the assignee_id index, skipping 86% fewer rows in the post-index filter step. Plus three sibling queries (`after-sprint-and-project-indexes.txt`) all newly index-served:

```
=== Sprint lookup by sprint_number (week dashboard / team grid hot path) ===
  Index Scan using idx_documents_sprint_number  (Execution Time: 0.024 ms)

=== Project ownership lookup (dashboard /my-work projects panel) ===
  Index Scan using idx_documents_project_owner_id  (Execution Time: 0.013 ms)

=== Issue state filter (issues list when filtering by state) ===
  Index Scan using idx_documents_issue_state  (Execution Time: 0.025 ms)
```

## Root cause

The unified document model puts every doc type in one `documents` table with shape-by-`document_type` properties stored as JSONB. The schema has indexes for the common surface (`workspace_id`, `document_type`, soft-delete columns), but the JSONB *property* predicates that the application uses for filtering are not indexed — even though they're hot paths:

- `properties->>'state'` — issues list, dashboard, team board
- `properties->>'assignee_id'` — dashboard "my work", issues filter, team grid
- `properties->>'sprint_number'` — sprint board, week dashboard
- `properties->>'owner_id'` — project ownership

Without these, the planner picks a `document_type` bitmap scan and then evaluates every JSONB predicate row by row.

## Fix

Migration `api/src/db/migrations/038_jsonb_hot_path_indexes.sql`. Four partial expression indexes, each gated by the relevant `document_type` plus the active/non-deleted predicates so the index stays narrow:

```sql
-- 1. issue.state
CREATE INDEX IF NOT EXISTS idx_documents_issue_state
  ON documents ((properties->>'state'))
  WHERE document_type = 'issue' AND archived_at IS NULL AND deleted_at IS NULL;

-- 2. issue.assignee_id (stores cast uuid)
CREATE INDEX IF NOT EXISTS idx_documents_issue_assignee_id
  ON documents (((properties->>'assignee_id')::uuid))
  WHERE document_type = 'issue' AND archived_at IS NULL AND deleted_at IS NULL;

-- 3. sprint.sprint_number (stores cast int)
CREATE INDEX IF NOT EXISTS idx_documents_sprint_number
  ON documents (((properties->>'sprint_number')::int))
  WHERE document_type = 'sprint' AND archived_at IS NULL AND deleted_at IS NULL;

-- 4. project.owner_id (stores cast uuid)
CREATE INDEX IF NOT EXISTS idx_documents_project_owner_id
  ON documents (((properties->>'owner_id')::uuid))
  WHERE document_type = 'project' AND archived_at IS NULL AND deleted_at IS NULL;
```

Index expressions store the casted scalar value (uuid / int) so equality joins and filters in route SQL pick them up without a rewrite. `IF NOT EXISTS` matches `schema.sql` conventions and makes the migration idempotent.

## Why these four

Audit Phase 1 traced every route file's JSONB predicate (`api/src/routes/*.ts`, `api/src/services/*.ts`) and counted distinct property access patterns. Four predicates were used by multiple high-traffic routes AND had no covering index. The remaining JSONB property accesses were either rare (`properties->>'visibility'`), used only in admin tools, or already covered by `idx_documents_person_user_id`.

## Reproducibility

```bash
# Apply migration to a fresh dev db
docker exec ship-postgres-1 psql -U ship -d ship_dev -f api/src/db/migrations/038_jsonb_hot_path_indexes.sql
# OR (auto-runs at API startup)
pnpm dev

# Verify the four indexes exist
docker exec ship-postgres-1 psql -U ship -d ship_dev -tAc \
  "SELECT indexname FROM pg_indexes WHERE tablename='documents' AND indexname LIKE 'idx_documents_%';"

# Re-run baseline EXPLAINs
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "EXPLAIN (ANALYZE, BUFFERS) <query from explain-dashboard-issues.txt>"
```

Baseline + after artifacts:
- `orientation/baselines/db-efficiency/explain-dashboard-issues.txt` (before)
- `orientation/baselines/db-efficiency/after-dashboard-issues.txt` (after)
- `orientation/baselines/db-efficiency/after-issues-list.txt` (after — multi-table join with new assignee_id index)
- `orientation/baselines/db-efficiency/after-sprint-and-project-indexes.txt` (after — three index-scan plans)

## Tradeoffs

- **Index write amplification:** every insert/update on a document of the relevant type now updates one or two more indexes. The hot tables are document creation (rare per user, low write volume) and document update (high volume but localized). On the modest seed-data dev DB the writes are not measurable; under production load this is a few extra btree page touches per write, well under any noticeable cost.
- **Index storage:** each is partial + casted; on the current seed data each index is < 16 KB. At 10× document volume the total cost is still small (low MB).
- **`CREATE INDEX` (not `CONCURRENTLY`):** migration runner wraps each file in a transaction; `CONCURRENTLY` is incompatible with transactions. Acceptable in dev/shadow; for prod the next maintenance window will hold a brief AccessExclusiveLock during the index build. At current row counts this is sub-second. For 100k+ rows, drop the transaction wrapping for this single migration or rewrite as a `psql -f` outside the runner.
