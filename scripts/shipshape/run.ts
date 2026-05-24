// Shipshape full-mode orchestrator — `pnpm shipshape`.
// Runs all 7 PRD categories and emits orientation/shipshape-report.md.
// Exits nonzero if any check fails its PRD threshold.

import path from 'node:path';
import type { CheckResult, ShipshapeContext } from './types.ts';
import { REPO_ROOT, durationLine, getGitBranch, getGitSha, shTry, statusEmoji } from './util.ts';
import { emitReport } from './report.ts';

import typeSafety from './checks/typecheck.ts';
import bundle from './checks/bundle.ts';
import api from './checks/api.ts';
import db from './checks/db.ts';
import tests from './checks/tests.ts';
import errors from './checks/errors.ts';
import axe from './checks/axe.ts';

async function main() {
  const ctx: ShipshapeContext = {
    mode: 'full',
    repoRoot: REPO_ROOT,
    startedAt: new Date(),
    gitSha: getGitSha(),
    branch: getGitBranch(),
  };

  console.log(`shipshape: full mode — ${ctx.branch}@${ctx.gitSha}`);

  // Preflight: ensure the dev DB has data before running Cat 4. A prior
  // shipshape run's Cat 5 (vitest) wipes the DB via the test setup's TRUNCATE;
  // if the operator hasn't re-seeded, Cat 4 would skip on a still-empty DB.
  // Idempotent — `pnpm db:seed` tears down first, so re-seeding is safe.
  if (process.env.SHIPSHAPE_NO_RESEED !== '1') {
    const docCount = shTry(
      `docker exec ship-postgres-1 psql -U ship -d ship_dev -tA -c "SELECT COUNT(*) FROM documents;"`
    );
    if (docCount.code === 0 && parseInt(docCount.stdout.trim() || '0', 10) === 0) {
      console.log('Preflight: dev DB empty — seeding before checks…');
      const seed = shTry('pnpm db:seed');
      if (seed.code !== 0) {
        console.warn(`  preflight seed failed (exit ${seed.code}); Cat 4 will SKIP.`);
      } else {
        console.log('  preflight seed complete.');
      }
    }
  }

  // Batch 1 — read-only checks that don't touch the dev DB beyond reading.
  // Cat 4 (DB) MUST complete before Cat 5 (tests) starts: the vitest setup
  // TRUNCATEs every table in the dev DB on first beforeAll(), which would
  // empty the data Cat 4 needs to EXPLAIN against.
  const batch1 = await Promise.all([typeSafety(ctx), bundle(ctx), db(ctx)]);

  // Cat 5 (full vitest) — wipes the dev DB as a side effect of test setup.
  // Cat 6 (errors) reads the JSON cache Cat 5 writes.
  const cat5 = await tests(ctx);
  const cat6 = await errors(ctx);

  // Cat 5 wiped the dev DB. Cat 3 needs a seed user to auto-login + real data
  // for the autocannon endpoints to return non-trivial payloads. Reseed before
  // the stack-dependent checks unless the operator opted out.
  if (process.env.SHIPSHAPE_NO_RESEED !== '1') {
    console.log('\nMid-run reseed (Cat 5 wiped the dev DB; Cat 3 needs login + data)…');
    const seed = shTry('pnpm db:seed');
    if (seed.code !== 0) {
      console.warn(`  mid-run seed failed (exit ${seed.code}); Cat 3 will skip if it can't auth.`);
    } else {
      console.log('  mid-run reseed complete.');
    }
  }

  // Stack-dependent checks last (sequential).
  const cat3 = await api(ctx);
  const cat7 = await axe(ctx);

  const results: CheckResult[] = [...batch1, cat5, cat6, cat3, cat7];

  // Final reseed for dev session continuity — the mid-run seed above usually
  // covers it, but Cat 3's autocannon (which writes via /api/standups, etc.) can
  // leave the DB in a different shape than a fresh dev seed expects. Skipping if
  // SHIPSHAPE_NO_RESEED=1 or if the mid-run reseed already happened recently.
  if (process.env.SHIPSHAPE_NO_RESEED !== '1') {
    console.log('\nFinal dev DB reseed (post-Cat 3 cleanup)…');
    const seed = shTry('pnpm db:seed');
    if (seed.code !== 0) {
      console.warn(`  seed failed (exit ${seed.code}); run \`pnpm db:seed\` manually if you need dev data.`);
    } else {
      console.log('  reseed complete.');
    }
  }

  const { overallPass, reportPath } = await emitReport(ctx, results);

  // Console summary.
  console.log('');
  console.log(`shipshape results:`);
  for (const r of results.sort((a, b) => a.category - b.category)) {
    console.log(
      `  Cat ${r.category} ${r.name.padEnd(24, ' ')} ${statusEmoji(r.status).padEnd(6, ' ')} ${r.actual}`
    );
  }
  console.log('');
  console.log(`Report written to ${path.relative(REPO_ROOT, reportPath)}`);
  console.log(`Wall-clock: ${durationLine(Date.now() - ctx.startedAt.getTime())}`);

  if (!overallPass) {
    console.error('shipshape: FAIL — one or more categories regressed.');
    process.exit(1);
  }
  console.log('shipshape: PASS — all categories within threshold.');
}

main().catch((e) => {
  console.error('shipshape orchestrator crashed:', e);
  process.exit(2);
});
