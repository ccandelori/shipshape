// Shipshape — small shared helpers used by multiple checks.

import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CheckResult, CheckStatus } from './types.ts';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');
export const CACHE_DIR = path.join(HERE, '.cache');

export function getGitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

export function getGitBranch(): string {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

// Run a shell command, capturing stdout. Throws on non-zero exit.
export function sh(cmd: string, opts?: { cwd?: string; env?: NodeJS.ProcessEnv }): string {
  return execSync(cmd, {
    cwd: opts?.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    env: opts?.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 50 * 1024 * 1024,
  });
}

// Run a command and return { stdout, stderr, code } without throwing.
export function shTry(
  cmd: string,
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv }
): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(cmd, {
      cwd: opts?.cwd ?? REPO_ROOT,
      encoding: 'utf8',
      env: opts?.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    });
    return { stdout, stderr: '', code: 0 };
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    return {
      stdout: typeof err.stdout === 'string' ? err.stdout : (err.stdout?.toString('utf8') ?? ''),
      stderr: typeof err.stderr === 'string' ? err.stderr : (err.stderr?.toString('utf8') ?? ''),
      code: err.status ?? 1,
    };
  }
}

export function statusEmoji(status: CheckStatus): string {
  if (status === 'pass') return 'PASS';
  if (status === 'fail') return 'FAIL';
  return 'SKIP';
}

export function durationLine(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// Wrap a check fn to catch unhandled errors and return a SKIP/FAIL CheckResult.
export async function safe(
  category: number,
  name: string,
  target: string,
  evidence_path: string,
  reproduction: string,
  fn: () => Promise<Omit<CheckResult, 'category' | 'name' | 'target' | 'evidence_path' | 'reproduction' | 'durationMs'>>
): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const partial = await fn();
    return {
      category,
      name,
      target,
      evidence_path,
      reproduction,
      durationMs: Date.now() - startedAt,
      ...partial,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      category,
      name,
      target,
      actual: 'check crashed',
      status: 'fail',
      evidence_path,
      reproduction,
      notes: `Unhandled error: ${msg.slice(0, 500)}`,
      durationMs: Date.now() - startedAt,
    };
  }
}
