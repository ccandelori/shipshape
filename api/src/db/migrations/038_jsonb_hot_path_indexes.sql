-- Migration 038: JSONB hot-path expression indexes
--
-- Audit finding (Phase 1, Category 4 — Database Query Efficiency):
--   The dashboard "my active issues" EXPLAIN ANALYZE confirmed the planner
--   uses `idx_documents_document_type` to retrieve all 104 issue documents,
--   then filters 92 of them (88%) AFTER the index scan via JSONB predicates
--   on `properties->>'state'` and `(properties->>'assignee_id')::uuid`.
--   See orientation/baselines/db-efficiency/explain-dashboard-issues.txt.
--
--   Of the JSONB predicates that appear in route SQL, only
--   `properties->>'user_id'` on person docs has a dedicated expression
--   index (`idx_documents_person_user_id`). The remaining hot paths
--   (`state`, `assignee_id`, `sprint_number`, `owner_id`) are sequential-scan
--   risk once document volume passes ~10k.
--
-- This migration adds partial expression indexes for the four hot paths
-- identified by the audit. Each index is gated by the relevant
-- `document_type` predicate so it stays narrow and only covers the
-- document rows that can legitimately carry the property:
--
--   * issue.state                — dashboard + issues list + team board
--   * issue.assignee_id          — dashboard + issues list + team grid
--   * sprint.sprint_number       — sprint board + week dashboard + team grid
--   * project.owner_id           — dashboard "my work" + projects list
--
-- Notes:
--   - Plain `CREATE INDEX` (not CONCURRENTLY) because the migration runner
--     wraps each file in a transaction; CONCURRENTLY is incompatible with
--     transactions. Acceptable: documents table is small in dev/shadow and
--     production downtime windows already accommodate schema.sql changes.
--   - `IF NOT EXISTS` mirrors schema.sql conventions and makes the migration
--     idempotent if it has to be partially re-applied.
--   - Partial predicates intentionally match the WHERE clauses in the
--     audit-cited routes (issue/project/sprint with active/non-deleted rows)
--     so the planner picks them up without additional rewrites.

-- 1. issue.state — covers `WHERE properties->>'state' = ANY(...)` and
--    `properties->>'state' NOT IN ('done','cancelled')` filters used by
--    /api/dashboard/my-work, /api/issues list, and team board queries.
CREATE INDEX IF NOT EXISTS idx_documents_issue_state
  ON documents ((properties->>'state'))
  WHERE document_type = 'issue'
    AND archived_at IS NULL
    AND deleted_at IS NULL;

-- 2. issue.assignee_id — covers `(properties->>'assignee_id')::uuid = $1`
--    used by dashboard active-issues, /api/issues filter+join, team grid.
--    Index stores the cast uuid value so equality joins/filters use it directly.
CREATE INDEX IF NOT EXISTS idx_documents_issue_assignee_id
  ON documents (((properties->>'assignee_id')::uuid))
  WHERE document_type = 'issue'
    AND archived_at IS NULL
    AND deleted_at IS NULL;

-- 3. sprint.sprint_number — covers `(properties->>'sprint_number')::int = $N`
--    used by week dashboard, team grid, and per-sprint accountability queries.
CREATE INDEX IF NOT EXISTS idx_documents_sprint_number
  ON documents (((properties->>'sprint_number')::int))
  WHERE document_type = 'sprint'
    AND archived_at IS NULL
    AND deleted_at IS NULL;

-- 4. project.owner_id — covers `(properties->>'owner_id')::uuid = $1`
--    used by /api/dashboard/my-work projects panel and project ownership joins.
CREATE INDEX IF NOT EXISTS idx_documents_project_owner_id
  ON documents (((properties->>'owner_id')::uuid))
  WHERE document_type = 'project'
    AND archived_at IS NULL
    AND deleted_at IS NULL;
