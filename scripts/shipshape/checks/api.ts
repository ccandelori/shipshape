// Cat 3 — API Response Time
// Runs a short autocannon pass against the 5 baseline endpoints at c=25
// and compares P90 + P97.5 to the Phase 2 "after-*" numbers. Pass if every
// endpoint stays within 1.1x the after-number (no regression > 10%).
//
// Requires: API up on :3000 with E2E_TEST=1 (X-Bench bypass) AND a valid
// SHIPSHAPE_SESSION_COOKIE env var. Returns SKIP with clear instructions
// if either is missing — we don't want the full audit to error on a fresh
// machine that hasn't seeded a session.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CategoryCheck } from '../types.ts';
import { CACHE_DIR, REPO_ROOT, safe, shTry } from '../util.ts';
import { loginAndGetSessionCookie } from '../login.ts';

const REGRESSION_FACTOR = 1.1; // 10% slowdown allowance vs after-* number…
const ABSOLUTE_TOLERANCE_MS = 10; // …OR +10ms absolute, whichever is larger.
// Why both: on single-digit-ms baselines (3-4ms), 10% is sub-ms — within
// run-to-run jitter. The absolute floor keeps the check honest without
// flagging benign noise on local hardware.
const DURATION_S = 10; // shorter than the 30s baseline to keep `pnpm shipshape` < 5min
const CONCURRENCY = 25;
const API_URL = process.env.SHIPSHAPE_API_URL ?? 'http://localhost:3000';

function allowed(baseline: number): number {
  return Math.max(baseline * REGRESSION_FACTOR, baseline + ABSOLUTE_TOLERANCE_MS);
}

// Permissive enough for Express signed session cookies (URL-encoded "s%3A<id>.<sig>")
// while excluding every shell metacharacter. SHIPSHAPE_SESSION_COOKIE is operator-
// supplied via env, so we treat it as untrusted input before it touches any shell
// string. The autocannon call uses execFileSync (no shell) for defense in depth.
const SESSION_COOKIE_RE = /^[A-Za-z0-9._%-]{16,1024}$/;

const ENDPOINTS = [
  { path: '/api/auth/me', slug: 'api_auth_me' },
  { path: '/api/documents?type=wiki', slug: 'api_documents_type_wiki' },
  { path: '/api/issues', slug: 'api_issues' },
  { path: '/api/projects', slug: 'api_projects' },
  { path: '/api/weeks', slug: 'api_weeks' },
] as const;

interface AutocannonJson {
  latency: { p90: number; p97_5: number; p99: number; mean: number };
  errors: number;
  timeouts: number;
}

async function readBaselineP90P975(slug: string): Promise<{ p90: number; p97_5: number }> {
  const file = path.join(
    REPO_ROOT,
    'orientation/baselines/api-response-time',
    `after-${slug}-c25.json`
  );
  const raw = await fs.readFile(file, 'utf8');
  const json = JSON.parse(raw) as AutocannonJson;
  return { p90: json.latency.p90, p97_5: json.latency.p97_5 };
}

const api: CategoryCheck = (_ctx) =>
  safe(
    3,
    'API Response Time',
    `every endpoint P90 + P97.5 within ${(REGRESSION_FACTOR * 100 - 100).toFixed(0)}% or +${ABSOLUTE_TOLERANCE_MS}ms of post-remediation baseline`,
    'orientation/improvements/api-response-time.md',
    `tsx scripts/shipshape/checks/api.ts (auto-login as dev@ship.local, autocannon c=${CONCURRENCY} × ${DURATION_S}s × ${ENDPOINTS.length} endpoints)`,
    async () => {
      // Validate API_URL — must be a parseable http(s) URL. SHIPSHAPE_API_URL
      // is operator-supplied; reject anything that would inject into the
      // curl burst probe's shell command.
      let apiUrlParsed: URL;
      try {
        apiUrlParsed = new URL(API_URL);
      } catch {
        return {
          actual: `SHIPSHAPE_API_URL not a valid URL: ${API_URL}`,
          status: 'skip' as const,
          notes: 'Set SHIPSHAPE_API_URL to a full http(s) URL like http://localhost:3000.',
        };
      }
      if (apiUrlParsed.protocol !== 'http:' && apiUrlParsed.protocol !== 'https:') {
        return {
          actual: `SHIPSHAPE_API_URL must be http(s); got ${apiUrlParsed.protocol}`,
          status: 'skip' as const,
        };
      }
      const safeApiBase = `${apiUrlParsed.protocol}//${apiUrlParsed.host}${apiUrlParsed.pathname.replace(/\/+$/, '')}`;

      // Health probe — fail fast if API isn't running.
      const probe = shTry(`curl -sf --max-time 3 ${safeApiBase}/health`);
      if (probe.code !== 0) {
        return {
          actual: `API not reachable at ${safeApiBase}`,
          status: 'skip' as const,
          notes: `Start the API with: E2E_TEST=1 pnpm dev:api (so the X-Bench rate-limit bypass is active).`,
        };
      }

      // Resolve the session cookie. Operator-provided SHIPSHAPE_SESSION_COOKIE wins
      // for environments where auto-login can't be used (e.g. third-party SSO).
      // Otherwise we log in as the seed user dev@ship.local / admin123, which the
      // dev seed always creates. Override via SHIPSHAPE_LOGIN_EMAIL / _PASSWORD.
      let cookie = process.env.SHIPSHAPE_SESSION_COOKIE ?? '';
      let cookieSource = 'env';
      if (!cookie) {
        try {
          const login = await loginAndGetSessionCookie({ apiUrl: safeApiBase });
          cookie = login.sessionCookie;
          cookieSource = 'auto-login';
        } catch (e) {
          return {
            actual: `auto-login failed: ${(e as Error).message.slice(0, 200)}`,
            status: 'skip' as const,
            notes:
              'Tried logging in as dev@ship.local (seed user). Override creds with SHIPSHAPE_LOGIN_EMAIL + SHIPSHAPE_LOGIN_PASSWORD, or paste a session_id into SHIPSHAPE_SESSION_COOKIE.',
          };
        }
      }
      if (!SESSION_COOKIE_RE.test(cookie)) {
        return {
          actual: `session cookie (${cookieSource}) has unexpected shape`,
          status: 'skip' as const,
          notes:
            'Expected 16-1024 chars of [A-Za-z0-9._%-] (URL-safe base64 or URL-encoded signed cookie). Refusing to pass non-conforming input to the shell.',
        };
      }

      // Confirm X-Bench bypass is active — burst probe. cookie + safeApiBase
      // have both been validated against the regex / URL parser above, so
      // shell interpolation here can't introduce metacharacters.
      const burst = shTry(
        `for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code} ' -H 'Cookie: session_id=${cookie}' -H 'X-Bench: 1' ${safeApiBase}/api/auth/me; done`
      );
      if (/429/.test(burst.stdout)) {
        return {
          actual: 'rate-limit hit on burst probe',
          status: 'skip' as const,
          notes: 'API not started with E2E_TEST=1; the X-Bench bypass is inactive. Restart: E2E_TEST=1 pnpm dev:api',
        };
      }

      await fs.mkdir(CACHE_DIR, { recursive: true });

      // Run autocannon against each endpoint sequentially (parallel runs would
      // contend on the same DB connection pool and skew percentiles).
      // baseline is null on a crash so we don't pretend 0/0 was the target.
      const per: Array<{
        slug: string;
        path: string;
        current: AutocannonJson | null;
        baseline: { p90: number; p97_5: number } | null;
        regressedFields: string[];
      }> = [];

      for (const ep of ENDPOINTS) {
        const outFile = path.join(CACHE_DIR, `api-${ep.slug}-c${CONCURRENCY}.json`);

        // execFileSync with array args — no shell, so even if cookie / URL
        // bypassed validation, they couldn't introduce metacharacters here.
        let stdout: string;
        let crashed = false;
        try {
          stdout = execFileSync(
            'pnpm',
            [
              'exec',
              'autocannon',
              '-c', String(CONCURRENCY),
              '-d', String(DURATION_S),
              '-H', `Cookie: session_id=${cookie}`,
              '-H', 'X-Bench: 1',
              '--json',
              `${safeApiBase}${ep.path}`,
            ],
            { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
          );
        } catch (e) {
          const err = e as { stdout?: string | Buffer; status?: number };
          stdout =
            typeof err.stdout === 'string' ? err.stdout : (err.stdout?.toString('utf8') ?? '');
          crashed = true;
        }
        await fs.writeFile(outFile, stdout, 'utf8');

        if (crashed) {
          per.push({
            slug: ep.slug,
            path: ep.path,
            current: null,
            baseline: null,
            regressedFields: ['autocannon crashed'],
          });
          continue;
        }

        const current = JSON.parse(stdout) as AutocannonJson;
        const baseline = await readBaselineP90P975(ep.slug);
        const regressedFields: string[] = [];
        if (current.latency.p90 > allowed(baseline.p90)) {
          regressedFields.push(
            `P90 ${current.latency.p90}ms > ${allowed(baseline.p90).toFixed(1)}ms (baseline ${baseline.p90}ms)`
          );
        }
        if (current.latency.p97_5 > allowed(baseline.p97_5)) {
          regressedFields.push(
            `P97.5 ${current.latency.p97_5}ms > ${allowed(baseline.p97_5).toFixed(1)}ms (baseline ${baseline.p97_5}ms)`
          );
        }
        per.push({ slug: ep.slug, path: ep.path, current, baseline, regressedFields });
      }

      const regressed = per.filter((p) => p.regressedFields.length > 0);
      const pass = regressed.length === 0;
      const summary = per
        .map((p) =>
          p.current
            ? `${p.path}: P90=${p.current.latency.p90}ms / P97.5=${p.current.latency.p97_5}ms`
            : `${p.path}: ERR`
        )
        .join('; ');

      return {
        actual: summary,
        status: pass ? ('pass' as const) : ('fail' as const),
        notes: regressed.length > 0
          ? `Regressed endpoints: ${regressed.map((r) => `${r.path} [${r.regressedFields.join(', ')}]`).join(' | ')}`
          : undefined,
      };
    }
  );

export default api;
