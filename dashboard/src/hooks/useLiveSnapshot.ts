// Hybrid data hook: on mount, hit /api/shipshape/latest for fresher data.
// "Run live check" POSTs to /api/shipshape/run (bearer-gated), then polls.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { DashboardSnapshot, ShipshapeRun } from '../data/types';

const TOKEN_KEY = 'shipshape:dashboard-token';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export type RunState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running'; runId: string; startedAt: string }
  | { kind: 'error'; message: string };

interface LiveLatestResponse {
  shipshape: ShipshapeRun;
  updatedAt: string;
}

interface RunStartResponse {
  runId: string;
  startedAt: string;
}

interface RunPollResponse {
  status: 'pending' | 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt?: string;
  shipshape?: ShipshapeRun;
  error?: string;
}

export function useLiveSnapshot(
  baked: DashboardSnapshot,
  setSnapshot: (s: DashboardSnapshot) => void
) {
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>({ kind: 'idle' });

  // On mount: try to fetch data from the live API. Anonymous, no auth.
  // LIVE badge fires whenever the endpoint responds — it signals "API is
  // healthy and serving data," not "data is fresher than the bundle." The
  // data-swap is still gated on the timestamp comparison so a stale rsync
  // can't overwrite a newer bundle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/shipshape/latest', { credentials: 'omit' });
        if (!res.ok) return;
        const data = (await res.json()) as LiveLatestResponse;
        if (cancelled) return;

        setIsLive(true);
        setLastUpdated(data.updatedAt);

        // Swap snapshot data only if the live run is genuinely newer.
        if (
          new Date(data.shipshape.startedAt).getTime() >
          new Date(baked.shipshape.startedAt).getTime()
        ) {
          setSnapshot({
            ...baked,
            meta: { ...baked.meta, source: 'live', liveUpdatedAt: data.updatedAt },
            shipshape: data.shipshape,
          });
        }
      } catch {
        // Endpoint unreachable — stay on baked snapshot, leave isLive false.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baked, setSnapshot]);

  const runLive = useCallback(async () => {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = window.prompt(
        'Enter the dashboard bearer token to trigger a live shipshape run.\n(Set on the droplet as SHIPSHAPE_DASHBOARD_TOKEN.)'
      );
      if (!token) return;
      localStorage.setItem(TOKEN_KEY, token);
    }
    setRunState({ kind: 'starting' });
    try {
      const res = await fetch('/api/shipshape/run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setRunState({ kind: 'error', message: 'Invalid token — cleared. Try again.' });
        toast.error('Invalid token');
        return;
      }
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        setRunState({ kind: 'error', message: msg });
        toast.error(`Run failed: ${msg}`);
        return;
      }
      const { runId, startedAt } = (await res.json()) as RunStartResponse;
      setRunState({ kind: 'running', runId, startedAt });
      toast.message('Live shipshape run started', {
        description: 'Polling for completion…',
      });
      pollRun(runId, startedAt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRunState({ kind: 'error', message: msg });
      toast.error(`Run failed: ${msg}`);
    }
  }, []);

  const pollRun = useCallback(
    async (runId: string, startedAt: string) => {
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        try {
          const res = await fetch(`/api/shipshape/runs/${encodeURIComponent(runId)}`);
          if (!res.ok) continue;
          const data = (await res.json()) as RunPollResponse;
          if (data.status === 'done' && data.shipshape) {
            setSnapshot({
              ...baked,
              meta: {
                ...baked.meta,
                source: 'live',
                liveUpdatedAt: data.finishedAt ?? new Date().toISOString(),
              },
              shipshape: data.shipshape,
            });
            setIsLive(true);
            setLastUpdated(data.finishedAt ?? new Date().toISOString());
            setRunState({ kind: 'idle' });
            toast.success('Live shipshape run complete', {
              description: `Overall: ${data.shipshape.overallStatus.toUpperCase()}`,
            });
            return;
          }
          if (data.status === 'error') {
            setRunState({ kind: 'error', message: data.error ?? 'Unknown error' });
            toast.error(`Run failed: ${data.error ?? 'unknown'}`);
            return;
          }
          setRunState({ kind: 'running', runId, startedAt });
        } catch {
          // Transient — keep polling until deadline.
        }
      }
      setRunState({ kind: 'error', message: 'Timed out after 5 minutes' });
      toast.error('Run timed out');
    },
    [baked, setSnapshot]
  );

  return { isLive, lastUpdated, runLive, runState };
}
