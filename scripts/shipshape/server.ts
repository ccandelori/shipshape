// Helper: ensure a local HTTP service is reachable before a check runs.
// If absent, spawn it via a configurable command, poll until ready,
// and return a teardown function the caller invokes when done.
//
// Used by the axe check (auto-starts pnpm dev:web on :5173) so the
// orchestrator can run a full audit on a fresh machine without operator setup.

import { spawn, type ChildProcess } from 'node:child_process';

export interface EnsuredService {
  alreadyRunning: boolean;
  teardown: () => Promise<void>;
}

interface EnsureOpts {
  url: string;          // health-probe URL (HTTP GET; any 2xx/3xx/4xx counts as alive)
  spawnCmd: string;     // e.g. "pnpm"
  spawnArgs: string[];  // e.g. ["dev:web"]
  cwd: string;
  startupTimeoutMs: number;
  pollIntervalMs?: number;
  logPrefix?: string;
}

async function probe(url: string, timeoutMs: number): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'manual' });
    // Anything that isn't a network error counts as "the port is alive".
    return res.status < 600;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureService(opts: EnsureOpts): Promise<EnsuredService> {
  // Already up? Don't try to start a sibling.
  if (await probe(opts.url, 2000)) {
    return {
      alreadyRunning: true,
      teardown: async () => {},
    };
  }

  const prefix = opts.logPrefix ?? '[ensureService]';
  console.log(`${prefix} ${opts.url} unreachable — spawning \`${opts.spawnCmd} ${opts.spawnArgs.join(' ')}\``);

  const child: ChildProcess = spawn(opts.spawnCmd, opts.spawnArgs, {
    cwd: opts.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Drain the child's stdio so its pipes don't fill up and stall the process,
  // but keep the output quiet (only echo on failure).
  const tail: string[] = [];
  const collect = (chunk: Buffer): void => {
    const s = chunk.toString('utf8');
    tail.push(s);
    while (tail.length > 200) tail.shift();
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);

  let crashed: Error | null = null;
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      crashed = new Error(`${opts.spawnCmd} exited ${code}`);
    }
  });
  child.on('error', (e) => {
    crashed = e;
  });

  const deadline = Date.now() + opts.startupTimeoutMs;
  const pollMs = opts.pollIntervalMs ?? 750;
  while (Date.now() < deadline) {
    if (crashed) {
      console.error(`${prefix} child process failed:\n${tail.join('').slice(-1500)}`);
      throw crashed;
    }
    if (await probe(opts.url, 1500)) {
      console.log(`${prefix} ${opts.url} ready after ${Math.round((Date.now() - (deadline - opts.startupTimeoutMs)) / 1000)}s`);
      return {
        alreadyRunning: false,
        teardown: () => teardown(child, prefix),
      };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  await teardown(child, prefix);
  console.error(`${prefix} timed out waiting for ${opts.url}. Last output:\n${tail.join('').slice(-1500)}`);
  throw new Error(`timeout after ${opts.startupTimeoutMs}ms waiting for ${opts.url}`);
}

async function teardown(child: ChildProcess, prefix: string): Promise<void> {
  if (child.killed || child.exitCode !== null) return;
  child.kill('SIGTERM');
  // Give it 3s to wind down gracefully, then SIGKILL.
  await new Promise<void>((resolve) => {
    const finish = (): void => resolve();
    const timer = setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        console.log(`${prefix} child did not exit on SIGTERM, sending SIGKILL`);
        child.kill('SIGKILL');
      }
      finish();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      finish();
    });
  });
}
