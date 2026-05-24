# Improvement — Collaboration integrity observability (Phase 3 / Task 30)

> Companion to the seven Phase 2 category writeups. Phase 2 added two
> structural guards for the silent-data-loss class (yjsToJson NULL guard +
> WS 4401 session re-validation). This one makes the runtime behaviour of
> those guards visible: a regression now surfaces in monitoring instead of
> being discovered later by users.

## What it is

Two new read-only endpoints on the api process:

| Endpoint | Format | Purpose |
|---|---|---|
| `GET /health/collaboration` | JSON | Ops dashboard, manual debugging |
| `GET /metrics` | Prometheus text exposition (v0.0.4) | Scrape target for any Prom-compatible monitor |

Both surface the same six signals.

## The signals

| Signal | Type | What it means | Regression class it catches |
|---|---|---|---|
| `documents_content_null_count` | gauge (SQL) | Rows where `content IS NULL` AND `yjs_state IS NOT NULL` | C-1 silent data loss — yjsToJson returned the wrong shape and the NULL guard wasn't there to skip the write |
| `documents_with_recent_persist` | gauge (SQL) | Rows updated in the last hour | Liveness — if 0 while users are active, persistence is silently broken |
| `ws_connections_open` | gauge (in-memory) | `conns.size + eventConns.size` | Connection leak detection — should track DAU; sudden divergence means a close handler isn't firing |
| `ws_session_4401_count_5m` | gauge (in-memory sliding window) | WS closes with code 4401 in the last 5 minutes | C-2 session expiry — sustained nonzero means clients aren't getting their session-expired UX |
| `ws_session_4401_count_total` | counter (process lifetime) | Same, since process start | Long-term tracking + alert threshold base |
| `persist_failure_count_total` + `last_persist_failures` | counter + ring buffer of 10 | `persistDocument()` catch-block invocations | Persistence error rate — was previously logged-only |

## Architecture

```
api/src/collaboration/
├── observability.ts        # NEW: counters, sliding window, ring buffer, snapshot getter
└── index.ts                # MODIFIED: imports recordPersistFailure + recordWsSession4401,
                            #   calls them at the two regression-class sites; exports
                            #   getCollabConnectionCount() for the health route

api/src/routes/
└── health-collaboration.ts # NEW: GET /health/collaboration (JSON) + GET /metrics (Prom)
                            #   Both share a buildSnapshot() helper that does the two
                            #   SQL queries in parallel.

api/src/app.ts              # MODIFIED: mount the router at '/' (full paths in the router)
api/src/__tests__/
└── collaboration-health.test.ts  # NEW: 3 integration tests, one per regression class
```

The observability state is process-local (in-memory). Across pod restarts the
counters reset but the SQL-derived parts of the health endpoint survive — they
reflect the durable DB state, which is what matters for the C-1 class.

## The three tests (one per regression class)

1. **`documents_content_null_count` reflects DB state.** Inserts a row with
   `content=NULL` and `yjs_state` set (the exact silent-loss shape). Verifies
   the endpoint count went up + the Prom surface also shows the new value.
   Catches: a future PR that re-introduces the bug fixed by the `isTipTapDoc`
   guard in `persistDocument`.

2. **`ws_session_4401_count` increments on session-expired close.** Drives
   `revalidateWsSessions` with a fake conn whose session isn't in the DB.
   Asserts the close fires with code 4401 AND the counter ticks AND the
   5-minute window reflects it. Catches: a future PR that disables / breaks
   the re-validation tick.

3. **`last_persist_failures` captures a thrown persistDocument error.** Calls
   the observability hook directly with a synthetic error (same call the
   catch block makes in `persistDocument`). Verifies the ring buffer captures
   the docName / docId / error message / ISO timestamp AND the Prom counter
   ticks. Catches: silent persistence failures becoming silent.

All three pass against the dev DB in 200 ms total. They run as part of the
api vitest suite (`pnpm --filter @ship/api test`) → 36 files / 497 tests
(was 35 / 494 in Phase 2).

## Sample output

```bash
$ curl -s localhost:3000/health/collaboration | jq .
{
  "documents_content_null_count": 0,
  "documents_with_recent_persist": 42,
  "ws_connections_open": { "collab": 3, "events": 5, "total": 8 },
  "ws_session_4401_count_5m": 0,
  "ws_session_4401_count_total": 12,
  "persist_failure_count_total": 0,
  "last_persist_failures": []
}

$ curl -s localhost:3000/metrics
# HELP ship_documents_content_null_count Documents with NULL content and non-NULL yjs_state (silent-loss signal)
# TYPE ship_documents_content_null_count gauge
ship_documents_content_null_count 0

# HELP ship_documents_with_recent_persist Documents persisted in the last hour (liveness signal)
# TYPE ship_documents_with_recent_persist gauge
ship_documents_with_recent_persist 42

# HELP ship_ws_connections_open Currently open WS connections (collab rooms + events)
# TYPE ship_ws_connections_open gauge
ship_ws_connections_open 8

# HELP ship_ws_session_4401_count_5m WS closes with code 4401 (session expired/revoked) in the last 5 minutes
# TYPE ship_ws_session_4401_count_5m gauge
ship_ws_session_4401_count_5m 0

# HELP ship_ws_session_4401_count_total WS closes with code 4401 since process start
# TYPE ship_ws_session_4401_count_total counter
ship_ws_session_4401_count_total 12

# HELP ship_persist_failure_count_total Document persist failures since process start
# TYPE ship_persist_failure_count_total counter
ship_persist_failure_count_total 0
```

## Tradeoffs

1. **No external Prom-client dependency.** Six metrics doesn't justify the
   surface area of `prom-client`; the exposition format is stable enough that
   the hand-written formatter in `health-collaboration.ts` is fewer than 20
   lines and has no third-party drift risk. If we ever need histograms or
   labels, switch to `prom-client` — but until then, no.

2. **In-memory counters, not durable.** A pod restart resets
   `ws_session_4401_count_total` and the failure ring buffer. The SQL-backed
   gauges (`documents_content_null_count`, `documents_with_recent_persist`)
   are durable. For Ship's single-process deployment this is the right
   tradeoff; if we shard the api across multiple processes, the in-memory
   counters become per-pod, which Prometheus already handles via `sum by
   (instance)` aggregation.

3. **No auth on `/metrics`.** Standard Prometheus convention — metrics live
   on the same port as the app and are scraped from the cluster. If exposed
   publicly, the only thing leaked is aggregate counts. The endpoint is read-only.

4. **Test #2 calls `revalidateWsSessions` with mocked WS instead of a real
   WebSocket.** This is the same approach `session-timeout.test.ts` uses
   (the underlying function takes a `ClosableWebSocketLike` interface
   precisely so tests can drive it without booting the WS server). Catches
   the regression at the function boundary, not at the network boundary —
   trades realism for hermeticity.

## Reproduction

```bash
# Run the tests
pnpm --filter @ship/api exec vitest run src/__tests__/collaboration-health.test.ts

# Hit the endpoints against a running dev API
pnpm dev:api  # in one terminal
curl -s localhost:3000/health/collaboration | jq .
curl -s localhost:3000/metrics
```

## Evidence

- Observability module: `api/src/collaboration/observability.ts`
- Routes: `api/src/routes/health-collaboration.ts`
- Tests: `api/src/__tests__/collaboration-health.test.ts`
- Wired into `persistDocument` catch (`api/src/collaboration/index.ts`) and
  `revalidateWsSessions` close call (same file)
- Mount point: `api/src/app.ts` `app.use('/', healthCollaborationRoutes)`
- This document: `orientation/improvements/collab-observability.md`
- Taskmaster task: 30
