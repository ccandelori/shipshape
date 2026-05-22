// Cat 7 — Accessibility (axe-core deep scan)
// Reuses orientation/baselines/accessibility/axe-scan-after.mjs as the driver
// (chromium via playwright, walks 8 routes, writes after-axe-summary.json).
// Pass: 0 Critical + 0 Serious across every route.
//
// Requires: web dev server on :5173. SKIPs if unreachable rather than failing,
// since the orchestrator can't realistically boot the web stack itself.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CategoryCheck } from '../types.ts';
import { REPO_ROOT, safe, shTry } from '../util.ts';

const WEB_URL = process.env.SHIPSHAPE_WEB_URL ?? 'http://localhost:5173';
const DRIVER = 'orientation/baselines/accessibility/axe-scan-after.mjs';
const SUMMARY_FILE = 'orientation/baselines/accessibility/after-axe-summary.json';

interface AxeRoute {
  name: string;
  path: string;
  critical?: number;
  serious?: number;
  moderate?: number;
  minor?: number;
  total?: number;
  error?: string;
}
interface AxeSummary {
  capturedAt: string;
  routes: AxeRoute[];
}

const axe: CategoryCheck = (_ctx) =>
  safe(
    7,
    'Accessibility',
    '0 Critical + 0 Serious across all 8 baseline routes',
    'orientation/improvements/accessibility.md',
    `node ${DRIVER} (requires pnpm dev:web running + chromium via playwright)`,
    async () => {
      // Probe web first.
      const probe = shTry(`curl -sf --max-time 3 ${WEB_URL} -o /dev/null`);
      if (probe.code !== 0) {
        return {
          actual: `web not reachable at ${WEB_URL}`,
          status: 'skip' as const,
          notes: 'Start with: pnpm dev:web (then re-run shipshape).',
        };
      }

      // Run the existing driver — it writes after-axe-summary.json.
      const run = shTry(`node ${DRIVER}`, { cwd: REPO_ROOT });
      if (run.code !== 0) {
        return {
          actual: `axe driver exited ${run.code}`,
          status: 'fail' as const,
          notes: `stderr tail: ${run.stderr.slice(-300)}`,
        };
      }

      const raw = await fs.readFile(path.join(REPO_ROOT, SUMMARY_FILE), 'utf8');
      const summary = JSON.parse(raw) as AxeSummary;

      let totalCritical = 0;
      let totalSerious = 0;
      const offenders: string[] = [];
      for (const r of summary.routes) {
        if (r.error) {
          offenders.push(`${r.name}: ERR ${r.error}`);
          continue;
        }
        totalCritical += r.critical ?? 0;
        totalSerious += r.serious ?? 0;
        if ((r.critical ?? 0) > 0 || (r.serious ?? 0) > 0) {
          offenders.push(`${r.name}: ${r.critical} crit / ${r.serious} serious`);
        }
      }

      const pass = totalCritical === 0 && totalSerious === 0 && offenders.length === 0;

      return {
        actual: `${totalCritical} Critical + ${totalSerious} Serious across ${summary.routes.length} routes (captured ${summary.capturedAt})`,
        status: pass ? ('pass' as const) : ('fail' as const),
        notes: offenders.length > 0 ? offenders.join(' | ') : undefined,
      };
    }
  );

export default axe;
