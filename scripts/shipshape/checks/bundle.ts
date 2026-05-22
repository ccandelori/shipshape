// Cat 2 — Bundle Size
// Runs `pnpm --filter @ship/web build` and parses the vite reporter output
// for the entry chunk (index-*.js) gzip size. Threshold: <= 200 KB gzip.
//
// Baseline: 587 KB gzip entry chunk (pre-lazy-loading). After Phase 2: 142 kB.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CategoryCheck } from '../types.ts';
import { CACHE_DIR, REPO_ROOT, safe, shTry } from '../util.ts';

const TARGET_MAX_KB = 200;
const BASELINE_KB = 587;

const bundle: CategoryCheck = (_ctx) =>
  safe(
    2,
    'Bundle Size',
    `entry chunk <= ${TARGET_MAX_KB} KB gzip`,
    'orientation/improvements/bundle-size.md',
    'pnpm --filter @ship/web build (parse entry chunk gzip from reporter table)',
    async () => {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      const buildLog = path.join(CACHE_DIR, 'bundle-build.txt');

      // Run the production build. vite v6 emits the chunk table to stdout.
      const result = shTry('pnpm --filter @ship/web build', { cwd: REPO_ROOT });
      const output = result.stdout + '\n' + result.stderr;
      await fs.writeFile(buildLog, output, 'utf8');
      if (result.code !== 0) {
        return {
          actual: 'build failed',
          status: 'fail' as const,
          notes: `pnpm --filter @ship/web build exited ${result.code}. See ${path.relative(REPO_ROOT, buildLog)}.`,
        };
      }

      // Parse the entry chunk line. Vite output format:
      //   dist/assets/index-XYZ.js   587.43 kB │ gzip: 142.66 kB
      const indexLines = output
        .split('\n')
        .filter((l) => /dist\/assets\/index-[^\s]+\.js/.test(l) && /gzip:/.test(l));
      if (indexLines.length === 0) {
        return {
          actual: 'no entry chunk line found in build output',
          status: 'fail' as const,
          notes: `Expected a line like 'dist/assets/index-XYZ.js ... gzip: NNN kB' in ${path.relative(REPO_ROOT, buildLog)}.`,
        };
      }

      // If multiple match, take the largest (defensive — should only be one entry chunk).
      let maxGzipKb = 0;
      let chosenLine = '';
      for (const line of indexLines) {
        const m = line.match(/gzip:\s*([0-9.]+)\s*kB/);
        if (m && m[1]) {
          const kb = parseFloat(m[1]);
          if (kb > maxGzipKb) {
            maxGzipKb = kb;
            chosenLine = line.trim();
          }
        }
      }

      const delta = BASELINE_KB - maxGzipKb;
      const deltaPct = (delta / BASELINE_KB) * 100;
      const pass = maxGzipKb <= TARGET_MAX_KB;

      return {
        actual: `${maxGzipKb.toFixed(2)} kB gzip; ${delta >= 0 ? '▼' : '▲'} ${Math.abs(delta).toFixed(2)} kB (${deltaPct.toFixed(1)}%) vs ${BASELINE_KB} kB baseline`,
        status: pass ? ('pass' as const) : ('fail' as const),
        notes: pass ? `Chunk: ${chosenLine}` : `Entry chunk ${maxGzipKb.toFixed(2)} kB exceeds ${TARGET_MAX_KB} kB.`,
      };
    }
  );

export default bundle;
