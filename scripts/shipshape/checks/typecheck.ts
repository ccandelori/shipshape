// Cat 1 — Type Safety
// Replays the ripgrep methodology from orientation/baselines/type-safety/counts.txt
// to produce the current grand total of typed-bypass markers across the audit scope.
//
// Baseline: 747 (Phase 1, 2026-05-19). Target: <= 560 (>= 25% reduction).
//
// Secondary metric (appendix, NOT the gate): if ESLint is installed, this
// check also runs eslint.config.mjs's Cat 1 rules and reports the result as
// supplementary context. The ripgrep count above remains the PRD-comparable
// gate; the ESLint count is the wider typed-bypass surface (including
// hidden `any` flows) made visible. Skipped silently if ESLint isn't on the
// machine, so this never blocks shipshape on a fresh checkout.

import fs from 'node:fs';
import path from 'node:path';
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

// Cat 1 rules tracked under the ESLint methodology. Mirrors the merged
// eslint.config.mjs design: explicit annotations + hidden flow + redundant
// assertions. Kept here as a string list so this file stays self-contained.
const ESLINT_EXPLICIT_RULES = [
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-non-null-assertion',
  '@typescript-eslint/consistent-type-assertions',
  '@typescript-eslint/ban-ts-comment',
  '@typescript-eslint/prefer-as-const',
] as const;

const ESLINT_FLOW_RULES = [
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-return',
] as const;

const ESLINT_REDUNDANT_RULES = ['@typescript-eslint/no-unnecessary-type-assertion'] as const;

interface EslintMessage {
  ruleId: string | null;
}
interface EslintFileReport {
  messages: EslintMessage[];
}

interface EslintCat1Counts {
  explicit: number;
  flow: number;
  redundant: number;
  total: number;
}

// Best-effort ESLint Cat 1 count. Returns null if ESLint isn't installed
// or the run fails — the shipshape Cat 1 result stays based purely on the
// ripgrep count in that case.
function eslintCat1Counts(): EslintCat1Counts | null {
  // Skip if ESLint isn't on the machine. Don't fail shipshape; just omit.
  const eslintBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'eslint');
  if (!fs.existsSync(eslintBin)) return null;

  const { stdout, code } = shTry('pnpm exec eslint . --format json', { cwd: REPO_ROOT });
  // ESLint exits 1 when there are warnings/errors — that's expected, not a failure.
  if (code !== 0 && code !== 1) return null;
  if (!stdout.trim().startsWith('[')) return null;

  let report: EslintFileReport[];
  try {
    report = JSON.parse(stdout) as EslintFileReport[];
  } catch {
    return null;
  }

  const counts = { explicit: 0, flow: 0, redundant: 0 };
  for (const file of report) {
    for (const msg of file.messages) {
      if (!msg.ruleId) continue;
      if ((ESLINT_EXPLICIT_RULES as readonly string[]).includes(msg.ruleId)) counts.explicit++;
      else if ((ESLINT_FLOW_RULES as readonly string[]).includes(msg.ruleId)) counts.flow++;
      else if ((ESLINT_REDUNDANT_RULES as readonly string[]).includes(msg.ruleId)) counts.redundant++;
    }
  }
  return { ...counts, total: counts.explicit + counts.flow + counts.redundant };
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

      // Secondary metric: ESLint Cat 1 count (informational, not the gate).
      const eslint = eslintCat1Counts();
      const eslintNote = eslint
        ? `ESLint appendix — explicit: ${eslint.explicit}, hidden flow: ${eslint.flow}, redundant: ${eslint.redundant}; total: ${eslint.total}. ` +
          `(Wider surface than the ripgrep gate; ripgrep is what the PRD target was set against.)`
        : 'ESLint appendix unavailable (eslint not installed in node_modules — run `pnpm install` to enable).';

      const failNote = !pass
        ? `Total ${total} exceeds threshold ${TARGET_MAX}. Revert recent ': any' or ' as Type' additions. `
        : '';

      return {
        actual,
        status: pass ? 'pass' : 'fail',
        notes: `${failNote}${eslintNote}`,
      };
    }
  );

export default typecheck;
