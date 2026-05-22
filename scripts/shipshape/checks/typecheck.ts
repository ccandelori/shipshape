// Cat 1 — Type Safety
// Replays the ripgrep methodology from orientation/baselines/type-safety/counts.txt
// to produce the current grand total of typed-bypass markers across the audit scope.
//
// Baseline: 747 (Phase 1, 2026-05-19). Target: <= 560 (>= 25% reduction).

import type { CategoryCheck } from '../types.ts';
import { REPO_ROOT, safe, shTry } from '../util.ts';

const BASELINE_TOTAL = 747;
const TARGET_REDUCTION_PCT = 25;
const TARGET_MAX = Math.floor(BASELINE_TOTAL * (1 - TARGET_REDUCTION_PCT / 100)); // 560

// Manual de-duplication constants from counts.txt §3 (non-null assertions)
// and §4 (@ts-expect-error). Held stable across runs because these need
// human judgment to disambiguate from false positives (e.g. `![…].includes`).
const NON_NULL_BASELINE = 66;
const TS_EXPECT_ERROR_COUNT = 1;

const DIRS = ['web/src', 'api/src', 'shared/src', 'e2e'] as const;

function rg(args: string[]): number {
  const cmd = `rg ${args.map((a) => JSON.stringify(a)).join(' ')}`;
  const { stdout, code } = shTry(cmd, { cwd: REPO_ROOT });
  // ripgrep exits 1 when no matches; that's not an error.
  if (code !== 0 && code !== 1) {
    throw new Error(`rg failed with code ${code}: ${cmd}`);
  }
  if (!stdout.trim()) return 0;
  return stdout.split('\n').filter((l) => l.length > 0).length;
}

const typecheck: CategoryCheck = (_ctx) =>
  safe(
    1,
    'Type Safety',
    `<= ${TARGET_MAX} total typed-bypass markers (>= ${TARGET_REDUCTION_PCT}% reduction from ${BASELINE_TOTAL})`,
    'orientation/improvements/type-safety.md',
    'rg-based count — see scripts/shipshape/checks/typecheck.ts or orientation/baselines/type-safety/counts.txt',
    async () => {
      // 1) ': any' (strict colon-form type position).
      let anyTotal = 0;
      for (const d of DIRS) {
        // Per counts.txt §1: rg ' any' raw → grep -c ': any' strict.
        const cmd = `rg -n ' any' --type ts ${JSON.stringify(d)} | grep -c ': any' || true`;
        const { stdout } = shTry(cmd);
        anyTotal += parseInt(stdout.trim() || '0', 10);
      }

      // 2) ' as Type' assertions, excluding `as const` and `import .* as`.
      let asTotal = 0;
      for (const d of DIRS) {
        const cmd =
          `rg -n ' as ' --type ts ${JSON.stringify(d)} ` +
          `| grep -v 'as const' | grep -v 'import .* as' ` +
          `| grep -cE ' as ([A-Z][a-zA-Z_0-9]*|any|unknown|string|number|boolean|never|void)' || true`;
        const { stdout } = shTry(cmd);
        asTotal += parseInt(stdout.trim() || '0', 10);
      }

      // 3) @ts-expect-error: trust the manually-verified count (no production drift expected).
      const tsExpectErr = TS_EXPECT_ERROR_COUNT;

      // 4) Non-null assertions: held at the manually-validated 66.
      const nonNull = NON_NULL_BASELINE;

      const total = anyTotal + asTotal + tsExpectErr + nonNull;
      const delta = BASELINE_TOTAL - total;
      const deltaPct = (delta / BASELINE_TOTAL) * 100;
      const pass = total <= TARGET_MAX;
      const breakdown = `: any=${anyTotal} + as=${asTotal} + ts-expect-error=${tsExpectErr} + non-null=${nonNull}`;

      const actual =
        `${total} markers (${breakdown}); ` +
        `${delta >= 0 ? '▼' : '▲'} ${Math.abs(delta)} (${deltaPct.toFixed(1)}%) vs ${BASELINE_TOTAL} baseline`;

      return {
        actual,
        status: pass ? 'pass' : 'fail',
        notes: pass
          ? undefined
          : `Total ${total} exceeds threshold ${TARGET_MAX}. Revert recent ': any' or ' as Type' additions.`,
      };
    }
  );

export default typecheck;
