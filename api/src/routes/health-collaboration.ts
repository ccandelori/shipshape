// Collaboration integrity observability — exposes the runtime counters and
// SQL-derived health signals on GET /health/collaboration (JSON) and
// GET /metrics (Prometheus text format). Phase 3 / Task 30.

import { Router, type Request, type Response } from 'express';
import { pool } from '../db/client.js';
import { getCollabObservability } from '../collaboration/observability.js';
import { getCollabConnectionCount } from '../collaboration/index.js';

const router = Router();

interface HealthSnapshot {
  documents_content_null_count: number;
  documents_with_recent_persist: number;
  ws_connections_open: { collab: number; events: number; total: number };
  ws_session_4401_count_5m: number;
  ws_session_4401_count_total: number;
  persist_failure_count_total: number;
  last_persist_failures: ReturnType<typeof getCollabObservability>['last_persist_failures'];
}

// Common snapshot builder used by both /health/collaboration and /metrics.
// Doing the two SQL queries in parallel keeps the endpoint snappy enough to
// be polled at ~5s intervals by a sidecar (typical Prometheus scrape).
async function buildSnapshot(): Promise<HealthSnapshot> {
  const [nullCountRes, recentPersistRes] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM documents
       WHERE content IS NULL AND yjs_state IS NOT NULL`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM documents
       WHERE updated_at > now() - interval '1 hour'`
    ),
  ]);

  const obs = getCollabObservability();
  return {
    documents_content_null_count: parseInt(nullCountRes.rows[0]?.count ?? '0', 10),
    documents_with_recent_persist: parseInt(recentPersistRes.rows[0]?.count ?? '0', 10),
    ws_connections_open: getCollabConnectionCount(),
    ws_session_4401_count_5m: obs.ws_session_4401_count_5m,
    ws_session_4401_count_total: obs.ws_session_4401_count_total,
    persist_failure_count_total: obs.persist_failure_count_total,
    last_persist_failures: obs.last_persist_failures,
  };
}

router.get('/health/collaboration', async (_req: Request, res: Response) => {
  try {
    const snapshot = await buildSnapshot();
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({
      error: 'collab_observability_query_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// Prometheus exposition format helper. Hand-written rather than pulling in
// prom-client — five metrics doesn't justify the dep surface and the text
// format is stable.
function fmtMetric(args: {
  name: string;
  help: string;
  type: 'counter' | 'gauge';
  value: number;
}): string {
  return [
    `# HELP ${args.name} ${args.help}`,
    `# TYPE ${args.name} ${args.type}`,
    `${args.name} ${args.value}`,
    '',
  ].join('\n');
}

router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const snapshot = await buildSnapshot();
    const body =
      fmtMetric({
        name: 'ship_documents_content_null_count',
        help: 'Documents with NULL content and non-NULL yjs_state (silent-loss signal)',
        type: 'gauge',
        value: snapshot.documents_content_null_count,
      }) +
      fmtMetric({
        name: 'ship_documents_with_recent_persist',
        help: 'Documents persisted in the last hour (liveness signal)',
        type: 'gauge',
        value: snapshot.documents_with_recent_persist,
      }) +
      fmtMetric({
        name: 'ship_ws_connections_open',
        help: 'Currently open WS connections (collab rooms + events)',
        type: 'gauge',
        value: snapshot.ws_connections_open.total,
      }) +
      fmtMetric({
        name: 'ship_ws_session_4401_count_5m',
        help: 'WS closes with code 4401 (session expired/revoked) in the last 5 minutes',
        type: 'gauge',
        value: snapshot.ws_session_4401_count_5m,
      }) +
      fmtMetric({
        name: 'ship_ws_session_4401_count_total',
        help: 'WS closes with code 4401 since process start',
        type: 'counter',
        value: snapshot.ws_session_4401_count_total,
      }) +
      fmtMetric({
        name: 'ship_persist_failure_count_total',
        help: 'Document persist failures since process start',
        type: 'counter',
        value: snapshot.persist_failure_count_total,
      });

    res.type('text/plain; version=0.0.4').send(body);
  } catch (err) {
    res.status(500).type('text/plain').send(`# ERROR\n# ${err instanceof Error ? err.message : String(err)}\n`);
  }
});

export default router;
