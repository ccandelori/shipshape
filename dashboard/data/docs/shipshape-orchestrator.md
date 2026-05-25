# Improvement — ShipShape Quality Dashboard (Phase 3 / Task 27 + 28)

> Companion to the seven Phase 2 spec-category writeups in this folder. This one
> documents the orchestrator that turns those seven one-time measurements into
> a permanent gate.

## What it is

A single command — `pnpm shipshape` — that reproduces every Phase 2 measurement
and emits `orientation/shipshape-report.md` with a pass/fail line per category.
Any of the seven audit categories silently regressing makes the orchestrator exit
nonzero, so the command is suitable as a release gate.

`pnpm shipshape:ci` is a lite variant — drops the two checks that need a dev
stack up (autocannon against the live API; axe against the live web) and runs
in <60s on a GitHub Actions runner.

## Why

Phase 2 hit all seven target, but those numbers are a snapshot. Without a
mechanical gate, a future PR could regress (a) the bundle by removing a
`lazy()` wrapper, (b) the type-safety count by adding `as any` casts during a
refactor, (c) the dashboard query by dropping an index in a migration. The
audit caught these once; shipshape catches them every time.

The brief asked for a "10x move" beyond the seven categories. The 10x move is
not finding an eighth thing to optimize — it's making the seven things hard to
backslide on.

## The seven gates (thresholds & sources)

| # | Category | threshold | Source of truth |
|---|---|---|---|
| 1 | Type Safety | total markers ≤ 560 (≥ 25% reduction from 747) | `orientation/baselines/type-safety/counts.txt` |
| 2 | Bundle Size | entry chunk ≤ 200 KB gzip | `orientation/baselines/bundle/after-build.txt` |
| 3 | API Response Time | every endpoint P90/P97.5 within 10% of Phase 2 after-* | `orientation/baselines/api-response-time/after-*-c25.json` |
| 4 | DB Query Efficiency | dashboard "my-work" query ≤ 0.1 ms AND 4 migration-038 indexes present | `orientation/baselines/db-efficiency/after-dashboard-issues.txt` |
| 5 | Test Coverage | 0 failures across the api vitest suite (494/35 expected) | `pnpm --filter @ship/api test` |
| 6 | Runtime Error Handling | 0 failures in the 5-file critical-path subset | `api/src/__tests__/phase2-regressions.test.ts` + Task 14 files |
| 7 | Accessibility | 0 Critical + 0 Serious across all 8 axe routes | `orientation/baselines/accessibility/after-axe-summary.json` |

The orchestrator reads each baseline file at run time, so updating the baseline
(legitimate improvement) automatically updates the threshold.

## Architecture

```
scripts/shipshape/
├── package.json          # type: module marker so NodeNext resolves .ts imports
├── tsconfig.json         # strict TS check for the orchestrator itself
├── types.ts              # CheckResult shape returned by every check
├── util.ts               # shTry, git helpers, safe() wrapper for crash-safety
├── report.ts             # markdown emitter
├── report-template.md    # template with {{PLACEHOLDERS}}
├── run.ts                # entry point — `pnpm shipshape`
├── run-ci.ts             # entry point — `pnpm shipshape:ci`
└── checks/
    ├── typecheck.ts      # Cat 1 — ripgrep methodology from counts.txt §1-4
    ├── bundle.ts         # Cat 2 — pnpm build, parse entry chunk gzip
    ├── api.ts            # Cat 3 — autocannon at c=25 × 10s × 5 endpoints
    ├── db.ts             # Cat 4 — psql via docker exec + EXPLAIN
    ├── tests.ts          # Cat 5 — vitest --reporter=json --outputFile.json
    ├── errors.ts         # Cat 6 — filter Cat 5's JSON to critical-path files
    └── axe.ts            # Cat 7 — invoke axe-scan-after.mjs, parse summary
```

Each `checks/*.ts` exports a default `CategoryCheck` returning a uniform
`CheckResult`. `run.ts` calls them with the constraint that **Cat 4 must finish
before Cat 5 starts** (vitest's setup TRUNCATEs the dev DB). The orchestrator
auto-seeds before Cat 4 if the DB looks empty, and auto-reseeds after Cat 5 so
the next `pnpm dev` session has data.

## Self-test (proves the gate works)

```
$ touch api/src/__shipshape_selftest__.ts   # 15 lines of `export const _x: any = N`
$ pnpm shipshape | tail -15
shipshape: full mode — feat/phase3-shipshape@<sha>

shipshape results:
  Cat 1 Type Safety              FAIL   563 markers (: any=119 + as=377 + ts-expect-error=1 + non-null=66); ▼ 184 (24.6%) vs 747 baseline
  Cat 2 Bundle Size              PASS   ...
  ...
shipshape: FAIL — one or more categories regressed.
$ echo $?
1

$ rm api/src/__shipshape_selftest__.ts
$ pnpm shipshape | grep "Cat 1\|shipshape:"
  Cat 1 Type Safety              PASS   548 markers ... ▼ 199 (26.6%) vs 747 baseline
shipshape: PASS — all categories within threshold.
$ echo $?
0
```

The self-test confirms (a) a 15-marker bump pushes Cat 1 past the 560 threshold
(548 → 563), (b) the orchestrator exits nonzero, (c) removing the fixture
restores PASS and exit 0. Recorded against branch `feat/phase3-shipshape`.

## What `pnpm shipshape:ci` does differently

| Cat | Full mode | CI mode | Why |
|---|---|---|---|
| 1 | yes | yes | ripgrep — runs anywhere |
| 2 | yes | yes | pnpm build — runs anywhere |
| 3 | yes | **skipped** | needs `E2E_TEST=1 pnpm dev:api` up |
| 4 | EXPLAIN + index check | **index check only** | CI Postgres has no seeded data; EXPLAIN against empty tables is meaningless |
| 5 | yes | yes | vitest — runs anywhere |
| 6 | yes | yes | reads Cat 5's JSON — no extra runtime |
| 7 | yes | **skipped** | needs `pnpm dev:web` + chromium |

CI mode finishes in under a minute on the GitHub Actions runner. Cat 3 + 7
stay as `pnpm shipshape` full-run for now — adding a Playwright-equipped
runner to CI is tracked as a follow-up.

## Reproduction

```bash
# Full audit (needs Postgres + optionally dev:api + dev:web)
pnpm shipshape

# Lite mode (CI-friendly subset)
pnpm shipshape:ci

# Self-test (regress + restore)
echo 'export const _x: any = 1' | tee api/src/__shipshape_selftest__{1..15}.ts >/dev/null
pnpm shipshape   # exit 1
rm api/src/__shipshape_selftest__*.ts
pnpm shipshape   # exit 0
```

## Tradeoffs / known limitations

1. **Dev DB side effect.** Cat 5 (vitest) TRUNCATEs the dev DB during test
   setup. The orchestrator works around this by preflight-seeding if the DB is
   empty AND re-seeding after Cat 5 completes. Set `SHIPSHAPE_NO_RESEED=1` to
   skip both if you have your own seed lifecycle.

2. **Cat 3 needs an auth cookie.** The autocannon benchmark hits authenticated
   endpoints, so the operator must export `SHIPSHAPE_SESSION_COOKIE=<session_id>`
   before running. The check SKIPs cleanly if the cookie is missing rather
   than erroring out; running through with an authenticated browser at :5173
   takes ~20 seconds.

3. **Small-dataset planner choice for Cat 4.** With ~1170 docs, Postgres
   correctly prefers a sequential scan over the JSONB index for the
   `documents` table — the table fits in a couple of pages. The check tolerates
   this (the threshold is 0.1 ms, not "index in plan") because the time-bound
   gate catches the only regression that matters: an accidental migration-038
   drop would cause the seqscan to slow on production-scale data, and even on
   the dev dataset would be far past 0.1 ms.

4. **Self-test isn't automated.** The regress-and-restore proof of work is
   captured in this document and the git history, but isn't run as a meta-test
   each shipshape invocation. Adding a `pnpm shipshape:selftest` mode is tracked
   as future work — for now the human runs it manually before merging
   significant changes to the orchestrator itself.

## Evidence

- Orchestrator source: [`scripts/shipshape/`](../../scripts/shipshape/)
- Generated report: [`orientation/shipshape-report.md`](../shipshape-report.md)
- This document: `orientation/improvements/shipshape.md`
- Taskmaster tasks: 27 (the orchestrator) + 28 (CI lite mode)
