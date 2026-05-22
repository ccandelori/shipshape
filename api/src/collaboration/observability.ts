// Collaboration integrity observability — keeps the silent-data-loss class loud.
//
// Phase 2 added two structural guards (yjsToJson NULL guard, WS 4401 session
// re-validation). This module instruments their runtime behaviour so a future
// regression surfaces immediately via /health/collaboration or /metrics
// instead of being discovered later by users.
//
// State is process-local (in-memory counters + ring buffer). Across pod
// restarts the counters reset; the SQL-derived parts of the health endpoint
// (documents_content_null_count, documents_with_recent_persist) survive a
// restart because they reflect the durable DB state.

export interface PersistFailure {
  docName: string;
  docId: string;
  error: string;
  at: string; // ISO timestamp
}

export interface CollabObservabilitySnapshot {
  ws_session_4401_count_5m: number;
  ws_session_4401_count_total: number;
  persist_failure_count_total: number;
  last_persist_failures: PersistFailure[];
}

const WINDOW_MS = 5 * 60_000;
const MAX_PERSIST_FAILURES = 10;

let totalWsSession4401Count = 0;
let totalPersistFailureCount = 0;

const wsSession4401Timestamps: number[] = [];
const persistFailures: PersistFailure[] = [];

// Drop entries from the sliding-window array that are older than the window.
// Pure helper extracted so callers can re-apply on read without a setInterval.
function pruneWindow(ts: number[], cutoff: number): void {
  while (ts.length > 0 && ts[0]! < cutoff) ts.shift();
}

export function recordWsSession4401(): void {
  totalWsSession4401Count += 1;
  wsSession4401Timestamps.push(Date.now());
  pruneWindow(wsSession4401Timestamps, Date.now() - WINDOW_MS);
}

export function recordPersistFailure(
  docName: string,
  docId: string,
  error: unknown
): void {
  totalPersistFailureCount += 1;
  persistFailures.push({
    docName,
    docId,
    error: error instanceof Error ? error.message : String(error),
    at: new Date().toISOString(),
  });
  if (persistFailures.length > MAX_PERSIST_FAILURES) persistFailures.shift();
}

export function getCollabObservability(): CollabObservabilitySnapshot {
  pruneWindow(wsSession4401Timestamps, Date.now() - WINDOW_MS);
  return {
    ws_session_4401_count_5m: wsSession4401Timestamps.length,
    ws_session_4401_count_total: totalWsSession4401Count,
    persist_failure_count_total: totalPersistFailureCount,
    last_persist_failures: [...persistFailures],
  };
}

// Test helper — resets all counters/buffers. Production code should never call
// this; exported under the _ prefix to flag it as a test-only escape hatch.
export function _resetCollabObservability(): void {
  totalWsSession4401Count = 0;
  totalPersistFailureCount = 0;
  wsSession4401Timestamps.length = 0;
  persistFailures.length = 0;
}
