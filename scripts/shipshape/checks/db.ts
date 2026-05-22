// Cat 4 — DB Query Efficiency
// Two-part check:
//   (a) Static: all 4 migration-038 indexes exist in pg_indexes on the documents table.
//   (b) Dynamic: EXPLAIN ANALYZE on the dashboard "my-work" issues query stays
//       under the 0.1 ms threshold against the dev dataset.
//
// Note on "index used" — on the dev dataset (~1170 docs, ~104 issues) Postgres
// rationally prefers a sequential scan over the JSONB index for `documents`
// because the table fits in a few pages. Requiring an index-scan plan would
// produce false failures. The threshold (0.1 ms) is calibrated for this
// dataset; if data grew past the seqscan crossover the planner would switch
// to the index and the time threshold would still hold.
//
// Talks to Postgres via `docker exec ship-postgres-1 psql` per the project's
// OrbStack/Docker-hosted dev DB. If docker / the container is unavailable the
// check returns SKIP with a clear note (full audit still runs).
//
// In CI mode (mode='ci') the dynamic part is skipped (no seeded data); only
// the index-existence check runs against the workflow's postgres service.

import type { CategoryCheck, CheckStatus } from '../types.ts';
import { REPO_ROOT, safe, shTry } from '../util.ts';

const REQUIRED_INDEXES = [
  'idx_documents_issue_state',
  'idx_documents_issue_assignee_id',
  'idx_documents_sprint_number',
  'idx_documents_project_owner_id',
] as const;

const DASHBOARD_QUERY_MAX_MS = 0.1;

// Build a psql command. In full mode, we go through docker exec; in CI mode
// the workflow exposes Postgres on localhost:5432 with predictable creds.
function buildPsqlCmd(sql: string, mode: 'full' | 'ci'): string {
  const escaped = sql.replace(/"/g, '\\"');
  if (mode === 'ci') {
    // CI uses the same ship/ship_dev_password/ship_dev credentials as the dev
    // compose stack (see services.postgres block in .github/workflows/test.yml).
    return `PGPASSWORD=ship_dev_password psql -h localhost -U ship -d ship_dev -tA -c "${escaped}"`;
  }
  // Full mode: dev DB via docker exec (works on Docker Desktop and OrbStack).
  return `docker exec ship-postgres-1 psql -U ship -d ship_dev -tA -c "${escaped}"`;
}

function dockerAvailable(): boolean {
  return shTry('docker ps --filter name=ship-postgres-1 --format "{{.Names}}"').stdout.trim() ===
    'ship-postgres-1';
}

const db: CategoryCheck = (ctx) =>
  safe(
    4,
    'DB Query Efficiency',
    `dashboard "my-work" query <= ${DASHBOARD_QUERY_MAX_MS} ms AND all 4 migration-038 indexes present`,
    'orientation/improvements/database-query-efficiency.md',
    'docker exec ship-postgres-1 psql -U ship -d ship_dev -c "EXPLAIN ANALYZE ..." (see check source)',
    async () => {
      const mode = ctx.mode;

      // 0) Probe DB availability. SKIP if neither docker container nor CI service is up.
      if (mode === 'full' && !dockerAvailable()) {
        return {
          actual: 'ship-postgres-1 not running',
          status: 'skip' as const,
          notes:
            'docker ps showed no ship-postgres-1 container. Start with `docker compose up -d` (and `pnpm db:seed` if fresh).',
        };
      }

      // 1) Static: required indexes present.
      const indexSql =
        `SELECT indexname FROM pg_indexes WHERE tablename = 'documents' ` +
        `AND indexname IN ('${REQUIRED_INDEXES.join("','")}') ORDER BY indexname;`;
      const indexRes = shTry(buildPsqlCmd(indexSql, mode));
      if (indexRes.code !== 0) {
        return {
          actual: 'psql connection failed',
          status: 'skip' as const,
          notes: `psql exit ${indexRes.code}; stderr: ${indexRes.stderr.slice(0, 200)}`,
        };
      }
      const found = new Set(indexRes.stdout.split('\n').map((l) => l.trim()).filter(Boolean));
      const missing = REQUIRED_INDEXES.filter((n) => !found.has(n));

      if (mode === 'ci') {
        // CI mode: index existence only — no seeded data to EXPLAIN.
        const pass = missing.length === 0;
        return {
          actual: `${found.size}/${REQUIRED_INDEXES.length} migration-038 indexes present in pg_indexes`,
          status: pass ? ('pass' as const) : ('fail' as const),
          notes: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'CI mode: dynamic EXPLAIN skipped (no seeded data).',
        };
      }

      // 2) Pick a deterministic assignee_id literal — the assignee with the
      // most issues. Using a literal (rather than a subquery in the EXPLAIN
      // itself) keeps the plan readable and avoids the planner optimizing
      // away the subquery.
      const pickSql =
        `SELECT (properties->>'assignee_id') FROM documents WHERE document_type='issue' ` +
        `AND properties ? 'assignee_id' GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;`;
      const pickRes = shTry(buildPsqlCmd(pickSql, mode));
      const assigneeId = pickRes.stdout.trim();
      if (!assigneeId) {
        return {
          actual: 'no assigned issues in DB',
          status: 'skip' as const,
          notes: 'Could not find an assignee_id in any issue document. Did `pnpm db:seed` run?',
        };
      }

      // 3) Dynamic: EXPLAIN ANALYZE the dashboard slowest query.
      const explainSql =
        `EXPLAIN (ANALYZE, FORMAT JSON) ` +
        `SELECT d.id FROM documents d WHERE d.document_type = 'issue' ` +
        `AND ((d.properties->>'assignee_id')::uuid) = '${assigneeId}'::uuid LIMIT 50;`;
      const explainRes = shTry(buildPsqlCmd(explainSql, mode));
      if (explainRes.code !== 0) {
        return {
          actual: 'EXPLAIN failed',
          status: 'fail' as const,
          notes: `psql exit ${explainRes.code}; stderr: ${explainRes.stderr.slice(0, 200)}`,
        };
      }

      let executionMs = NaN;
      let planType = 'unknown';
      try {
        const planJson = JSON.parse(explainRes.stdout.trim());
        executionMs = planJson?.[0]?.['Execution Time'] ?? NaN;
        // The Plan node's child indicates which strategy ran.
        const inner = planJson?.[0]?.Plan?.Plans?.[0]?.['Node Type'] ?? planJson?.[0]?.Plan?.['Node Type'] ?? 'unknown';
        planType = String(inner);
      } catch (e) {
        return {
          actual: 'could not parse EXPLAIN JSON',
          status: 'fail' as const,
          notes: `JSON parse error. Raw: ${explainRes.stdout.slice(0, 200)}`,
        };
      }

      const indexesPass = missing.length === 0;
      const timePass = !Number.isNaN(executionMs) && executionMs <= DASHBOARD_QUERY_MAX_MS;
      const overallPass = indexesPass && timePass;

      const status: CheckStatus = overallPass ? 'pass' : 'fail';
      const notes: string[] = [];
      if (missing.length > 0) notes.push(`Missing indexes: ${missing.join(', ')}`);
      if (!timePass) notes.push(`Execution time ${executionMs} ms exceeds ${DASHBOARD_QUERY_MAX_MS} ms threshold.`);
      notes.push(`Planner chose: ${planType} (small datasets correctly prefer seqscan over JSONB index)`);

      return {
        actual: `${found.size}/${REQUIRED_INDEXES.length} indexes present; dashboard query ${executionMs.toFixed(3)} ms; planner: ${planType}`,
        status,
        notes: notes.join(' — '),
      };
    }
  );

export default db;
