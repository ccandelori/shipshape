// Cat 7 — Accessibility (axe-core deep scan)
// Reuses orientation/baselines/accessibility/axe-scan-after.mjs as the driver
// (chromium via playwright, walks 8 routes, writes after-axe-summary.json).
// Pass: 0 Critical + 0 Serious across every route.
//
// Auto-starts pnpm dev:web on :5173 if the web server isn't already up,
// runs the scan, then tears it down. Set SHIPSHAPE_NO_AUTO_WEB=1 to disable
// the autostart and require the operator to bring up :5173 themselves.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CategoryCheck } from '../types.ts';
import { REPO_ROOT, safe, shTry } from '../util.ts';
import { ensureService, type EnsuredService } from '../server.ts';

const WEB_URL = process.env.SHIPSHAPE_WEB_URL ?? 'http://localhost:5173';
const DRIVER = 'orientation/baselines/accessibility/axe-scan-after.mjs';
const SUMMARY_FILE = 'orientation/baselines/accessibility/after-axe-summary.json';
const AUTO_WEB_TIMEOUT_MS = 90_000;

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
    `node ${DRIVER} (auto-starts pnpm dev:web on :5173 if needed; chromium via playwright)`,
    async () => {
      let webService: EnsuredService | null = null;
      const allowAutoStart = process.env.SHIPSHAPE_NO_AUTO_WEB !== '1';

      try {
        if (allowAutoStart) {
          try {
            webService = await ensureService({
              url: WEB_URL,
              spawnCmd: 'pnpm',
              spawnArgs: ['--filter', '@ship/web', 'dev'],
              cwd: REPO_ROOT,
              startupTimeoutMs: AUTO_WEB_TIMEOUT_MS,
              logPrefix: '[axe:web]',
            });
          } catch (e) {
            return {
              actual: `auto-start of web server failed: ${(e as Error).message.slice(0, 200)}`,
              status: 'skip' as const,
              notes:
                'Tried to spawn `pnpm --filter @ship/web dev`. Start it manually (pnpm dev:web) and re-run, or set SHIPSHAPE_NO_AUTO_WEB=1 to disable autostart.',
            };
          }
        } else {
          // Operator opted out of autostart — fall back to a simple reachability check.
          const probe = shTry(`curl -sf --max-time 3 ${WEB_URL} -o /dev/null`);
          if (probe.code !== 0) {
            return {
              actual: `web not reachable at ${WEB_URL} (autostart disabled)`,
              status: 'skip' as const,
              notes: 'SHIPSHAPE_NO_AUTO_WEB=1 is set. Start the web server manually with `pnpm dev:web`.',
            };
          }
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
      } finally {
        // Always tear down the auto-started web server. If the operator
        // had it running already, we leave it alone.
        if (webService && !webService.alreadyRunning) {
          await webService.teardown();
        }
      }
    }
  );

export default axe;
