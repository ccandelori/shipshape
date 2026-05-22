// Cat 3 — API Response Time
// Runs a short autocannon pass against the 5 baseline endpoints at c=25
// and compares P90 + P97.5 to the Phase 2 "after-*" numbers. Pass if every
// endpoint stays within 1.1x the after-number (no regression > 10%).
//
// Requires: API up on :3000 with E2E_TEST=1 (X-Bench bypass) AND a valid
// SHIPSHAPE_SESSION_COOKIE env var. Returns SKIP with clear instructions
// if either is missing — we don't want the full audit to error on a fresh
// machine that hasn't seeded a session.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CategoryCheck } from '../types.ts';
import { CACHE_DIR, REPO_ROOT, safe, shTry } from '../util.ts';

const REGRESSION_FACTOR = 1.1; // allow at most 10% slowdown vs after-* number
const DURATION_S = 10; // shorter than the 30s baseline to keep `pnpm shipshape` < 5min
const CONCURRENCY = 25;
const API_URL = process.env.SHIPSHAPE_API_URL ?? 'http://localhost:3000';

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
    `every endpoint P90 + P97.5 within ${(REGRESSION_FACTOR * 100 - 100).toFixed(0)}% of Phase 2 after-* numbers`,
    'orientation/improvements/api-response-time.md',
    `SHIPSHAPE_SESSION_COOKIE=<session_id> tsx scripts/shipshape/checks/api.ts (autocannon c=${CONCURRENCY} × ${DURATION_S}s × ${ENDPOINTS.length} endpoints)`,
    async () => {
      const cookie = process.env.SHIPSHAPE_SESSION_COOKIE;
      if (!cookie) {
        return {
          actual: 'SHIPSHAPE_SESSION_COOKIE not set',
          status: 'skip' as const,
          notes:
            'Cat 3 needs a session_id cookie for an admin user. Get one by logging in to web at :5173 then DevTools → Cookies → session_id. Export as SHIPSHAPE_SESSION_COOKIE and re-run.',
        };
      }

      // Health probe — fail fast if API isn't running.
      const probe = shTry(`curl -sf --max-time 3 ${API_URL}/health`);
      if (probe.code !== 0) {
        return {
          actual: `API not reachable at ${API_URL}`,
          status: 'skip' as const,
          notes: `Start the API with: E2E_TEST=1 pnpm dev:api (so the X-Bench rate-limit bypass is active).`,
        };
      }

      // Confirm X-Bench bypass is active — burst probe.
      const burst = shTry(
        `for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code} ' -H 'Cookie: session_id=${cookie}' -H 'X-Bench: 1' ${API_URL}/api/auth/me; done`
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
      const per: Array<{
        slug: string;
        path: string;
        current: AutocannonJson | null;
        baseline: { p90: number; p97_5: number };
        regressedFields: string[];
      }> = [];

      for (const ep of ENDPOINTS) {
        const outFile = path.join(CACHE_DIR, `api-${ep.slug}-c${CONCURRENCY}.json`);
        const cmd =
          `pnpm exec autocannon ` +
          `-c ${CONCURRENCY} -d ${DURATION_S} ` +
          `-H "Cookie: session_id=${cookie}" -H "X-Bench: 1" ` +
          `--json "${API_URL}${ep.path}"`;
        const res = shTry(cmd, { cwd: REPO_ROOT });
        await fs.writeFile(outFile, res.stdout, 'utf8');

        if (res.code !== 0) {
          per.push({ slug: ep.slug, path: ep.path, current: null, baseline: { p90: 0, p97_5: 0 }, regressedFields: ['autocannon crashed'] });
          continue;
        }

        const current = JSON.parse(res.stdout) as AutocannonJson;
        const baseline = await readBaselineP90P975(ep.slug);
        const regressedFields: string[] = [];
        if (current.latency.p90 > baseline.p90 * REGRESSION_FACTOR) {
          regressedFields.push(`P90 ${current.latency.p90}ms > ${(baseline.p90 * REGRESSION_FACTOR).toFixed(1)}ms (baseline ${baseline.p90}ms)`);
        }
        if (current.latency.p97_5 > baseline.p97_5 * REGRESSION_FACTOR) {
          regressedFields.push(`P97.5 ${current.latency.p97_5}ms > ${(baseline.p97_5 * REGRESSION_FACTOR).toFixed(1)}ms (baseline ${baseline.p97_5}ms)`);
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
