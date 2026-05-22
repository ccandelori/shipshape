// Shipshape CI-mode orchestrator — `pnpm shipshape:ci`.
// Lite subset: skips dev-stack-requiring categories (Cat 3 autocannon, Cat 7 axe).
// CI runner only needs Node + pnpm + Postgres service — no Playwright, no autocannon.
//
// Cat 4 runs in "ci" mode — index existence check only (no seeded data to EXPLAIN).

import path from 'node:path';
import type { CheckResult, ShipshapeContext } from './types.ts';
import { REPO_ROOT, durationLine, getGitBranch, getGitSha, statusEmoji } from './util.ts';
import { emitReport } from './report.ts';

import typeSafety from './checks/typecheck.ts';
import bundle from './checks/bundle.ts';
import db from './checks/db.ts';
import tests from './checks/tests.ts';
import errors from './checks/errors.ts';

async function main() {
  const ctx: ShipshapeContext = {
    mode: 'ci',
    repoRoot: REPO_ROOT,
    startedAt: new Date(),
    gitSha: getGitSha(),
    branch: getGitBranch(),
  };

  console.log(`shipshape:ci — ${ctx.branch}@${ctx.gitSha}`);

  const batch1 = await Promise.all([typeSafety(ctx), bundle(ctx), db(ctx), tests(ctx)]);
  const cat6 = await errors(ctx);

  const results: CheckResult[] = [...batch1, cat6];

  const { overallPass, reportPath } = await emitReport(ctx, results);

  console.log('');
  console.log(`shipshape:ci results:`);
  for (const r of results.sort((a, b) => a.category - b.category)) {
    console.log(
      `  Cat ${r.category} ${r.name.padEnd(24, ' ')} ${statusEmoji(r.status).padEnd(6, ' ')} ${r.actual}`
    );
  }
  console.log('');
  console.log(`Report written to ${path.relative(REPO_ROOT, reportPath)}`);
  console.log(`Wall-clock: ${durationLine(Date.now() - ctx.startedAt.getTime())}`);

  if (!overallPass) {
    console.error('shipshape:ci: FAIL — one or more categories regressed.');
    process.exit(1);
  }
  console.log('shipshape:ci: PASS — all CI-mode categories within threshold.');
}

main().catch((e) => {
  console.error('shipshape:ci orchestrator crashed:', e);
  process.exit(2);
});
