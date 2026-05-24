// Dashboard live-data endpoints.
// - GET  /api/shipshape/latest        → last known shipshape result (anonymous)
// - POST /api/shipshape/run           → spawn a fresh shipshape run (bearer-token gated)
// - GET  /api/shipshape/runs/:id      → poll a specific run's status (anonymous)
//
// Runs are spawned only when SHIPSHAPE_RUN_ENABLED=1. The droplet leaves this
// off by default — the dashboard still shows static + last-known-live data via
// /latest, but cannot kick off subprocess work against the production droplet.
// Local dev sets SHIPSHAPE_RUN_ENABLED=1 + SHIPSHAPE_DASHBOARD_TOKEN to use
// the "Run live" button.

import { Router, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const router = Router();

const DATA_DIR =
  process.env.SHIPSHAPE_DATA_DIR ??
  path.resolve(process.cwd(), '..', '..', 'orientation');
const LATEST_PATH = path.join(DATA_DIR, 'shipshape-report.json');
const RUNS_DIR = path.join(DATA_DIR, 'shipshape-runs');

const RUN_ENABLED = process.env.SHIPSHAPE_RUN_ENABLED === '1';
const RUN_TOKEN = process.env.SHIPSHAPE_DASHBOARD_TOKEN;
const RUN_CWD = process.env.SHIPSHAPE_REPO_ROOT ?? path.resolve(process.cwd(), '..', '..');

interface RunState {
  runId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt?: string;
  error?: string;
  shipshape?: unknown; // ShipshapeReportJson when done
}

// In-process run registry. Re-reads from disk on restart by scanning RUNS_DIR.
const runRegistry = new Map<string, RunState>();

function ensureRunsDir(): void {
  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
}

function persistRun(state: RunState): void {
  ensureRunsDir();
  fs.writeFileSync(
    path.join(RUNS_DIR, `${state.runId}.json`),
    JSON.stringify(state, null, 2) + '\n',
    'utf8'
  );
}

function loadRun(runId: string): RunState | null {
  const cached = runRegistry.get(runId);
  if (cached) return cached;
  const p = path.join(RUNS_DIR, `${runId}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as RunState;
    runRegistry.set(runId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

// GET /api/shipshape/latest — anonymous
router.get('/latest', (_req: Request, res: Response) => {
  if (!fs.existsSync(LATEST_PATH)) {
    res.status(404).json({ error: 'no shipshape report yet' });
    return;
  }
  let shipshape: unknown;
  try {
    shipshape = JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8'));
  } catch (e) {
    res.status(500).json({ error: 'failed to parse shipshape-report.json', detail: (e as Error).message });
    return;
  }
  const stat = fs.statSync(LATEST_PATH);
  res.json({ shipshape, updatedAt: stat.mtime.toISOString() });
});

// GET /api/shipshape/runs/:id — anonymous poll endpoint
router.get('/runs/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== 'string' || !/^[a-f0-9]{8,64}$/.test(id)) {
    res.status(400).json({ error: 'invalid run id' });
    return;
  }
  const state = loadRun(id);
  if (!state) {
    res.status(404).json({ error: 'run not found' });
    return;
  }
  res.json(state);
});

// POST /api/shipshape/run — bearer-token gated
router.post('/run', (req: Request, res: Response) => {
  if (!RUN_ENABLED) {
    res.status(503).json({
      error: 'live runs disabled in this environment',
      hint: 'set SHIPSHAPE_RUN_ENABLED=1 (and a token) to enable. The latest snapshot is served read-only from /api/shipshape/latest.',
    });
    return;
  }
  if (!RUN_TOKEN) {
    res.status(503).json({ error: 'SHIPSHAPE_DASHBOARD_TOKEN unset on server' });
    return;
  }
  const auth = req.headers.authorization ?? '';
  const match = /^Bearer\s+(\S+)$/.exec(auth);
  if (!match || match[1] !== RUN_TOKEN) {
    res.status(401).json({ error: 'invalid or missing bearer token' });
    return;
  }

  const runId = crypto.randomBytes(16).toString('hex');
  const startedAt = new Date().toISOString();
  const state: RunState = { runId, status: 'pending', startedAt };
  runRegistry.set(runId, state);
  persistRun(state);

  // Detach and spawn. We don't await — the client polls /runs/:id.
  const child = spawn('pnpm', ['shipshape'], {
    cwd: RUN_CWD,
    env: { ...process.env, SHIPSHAPE_NO_RESEED: process.env.SHIPSHAPE_NO_RESEED ?? '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  state.status = 'running';
  persistRun(state);

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
    if (stderr.length > 50_000) stderr = stderr.slice(-50_000); // cap memory
  });

  child.on('exit', (code) => {
    const finishedAt = new Date().toISOString();
    if (code === 0 && fs.existsSync(LATEST_PATH)) {
      try {
        const shipshape = JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8'));
        const done: RunState = { ...state, status: 'done', finishedAt, shipshape };
        runRegistry.set(runId, done);
        persistRun(done);
      } catch (e) {
        const err: RunState = {
          ...state,
          status: 'error',
          finishedAt,
          error: `parse failure: ${(e as Error).message}`,
        };
        runRegistry.set(runId, err);
        persistRun(err);
      }
    } else {
      const err: RunState = {
        ...state,
        status: 'error',
        finishedAt,
        error: `shipshape exited ${code}\n${stderr.slice(-2000)}`,
      };
      runRegistry.set(runId, err);
      persistRun(err);
    }
  });

  child.on('error', (e) => {
    const err: RunState = {
      ...state,
      status: 'error',
      finishedAt: new Date().toISOString(),
      error: `failed to spawn shipshape: ${e.message}`,
    };
    runRegistry.set(runId, err);
    persistRun(err);
  });

  res.status(202).json({ runId, startedAt });
});

export default router;
