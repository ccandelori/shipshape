# Next-Session Handoff — Phase 3 / ShipShape Quality Dashboard

**Last touched:** 2026-05-22 (late morning CT, written before context clear)
**Phase 2 status:** ✅ All 7 PRD category gates met; 4 follow-up audit rounds with the human reviewer closed. Docs honest.
**Phase 2 deadline:** Friday 2026-05-22 11:59 PM CT — **TODAY (still has runway)**
**Final submission deadline:** Sunday 2026-05-24 10:59 PM CT
**Branch:** `master` (48 commits ahead of `origin/master`, not pushed yet)
**Local Postgres:** Docker container `ship-postgres-1` (per memory: Ship's local Postgres is Docker; CLAUDE.md's "not Docker" line is stale)

---

## Where Phase 2 ended (everything you need before context-clear)

### The numbers that should be in your head

| Cat | Target | Result |
|---|---|---|
| 1 — Type Safety | 25% violation reduction | **26.6%** (747 → 548) |
| 2 — Bundle | 20% initial load | **76%** (587 → 142 kB gzip on entry chunk) |
| 3 — API | 20% P95 on ≥2 endpoints | **35-88%** P90/P97.5 across all 5 endpoints |
| 4 — DB | 50% slowest query | **73%** on dashboard "my-work" issues |
| 5 — Tests | 3 critical-path tests | 30 new (3 regression + 12 Task 14 + 18 mapper) |
| 6 — Errors | 3 gaps, ≥1 data-loss | 3 (yjsToJson NULL guard, global error handler, WS 60s re-validation) |
| 7 — A11y | 10+ Lighthouse OR Critical/Serious fixed | **0/0** Critical+Serious on all 8 axe routes |
| + CI | (cross-cutting) | `.github/workflows/test.yml` exists with type-check + api-tests + Postgres service |

**Total tests:** 494 across 35 files. All gates green per-package (`pnpm --filter @ship/* type-check / test / build`). Web entry chunk: 142.66 kB gzip.

### The 30 Taskmaster tasks at clear-context time

| Range | Status |
|---|---|
| 1-19 | done — Phase 1 audit + orientation work |
| 20 | in-progress — AI cost analysis (needs $ figures + reflection) |
| 21 | in-progress — Demo video (needs re-record + hosted URL) |
| 22 | in-progress — Deployed fork URL |
| 23 | in-progress — Social post (drafts ready, needs to post) |
| 24 | in-progress — Repository hygiene & final submission (blocked on 20-23) |
| 25-26 | done — Phase 1 gate repair + orientation checklist (Task 26 just had inconsistency cleaned) |
| **27** | **pending — `pnpm shipshape` orchestrator** ← **PRIMARY NEW WORK** |
| **28** | **pending — `pnpm shipshape:ci` lite mode + GitHub Actions wiring** |
| **29** | pending — (stretch) Typed document contracts via Zod |
| **30** | pending — (stretch) Collaboration integrity observability |

Run `jq -r '.master.tasks[] | "[\(.status)] \(.id): \(.title)"' .taskmaster/tasks/tasks.json | head -35` to see the current shape.

### Critical files written this session that you should know about

| Path | What it is |
|---|---|
| `SUBMISSION.md` | Top-level grader pointer. Scoreboard + every deliverable linked. Includes "Push status" section explaining the 48-commit delta. |
| `orientation/improvements/*.md` | 8 files: type-safety, bundle-size, api-response-time, database-query-efficiency, test-coverage, runtime-error-handling, accessibility, ci-workflow. |
| `orientation/baselines/api-response-time/after-*.json` | Phase 2 autocannon after-numbers (5 endpoints × c=25) |
| `orientation/baselines/db-efficiency/after-*.txt` | Phase 2 EXPLAIN ANALYZE after-plans for the 4 hot queries |
| `orientation/baselines/bundle/after-build.txt` + `after-bundle.html` | Phase 2 vite build output + rollup-plugin-visualizer treemap |
| `orientation/baselines/accessibility/after-axe-*.json` + `after-axe-summary.md` + `axe-scan-after.mjs` | Phase 2 axe re-scan artifacts + driver script |
| `orientation/compliance-scan.md` + `orientation/compliance/gitleaks-*.json` | Local gitleaks scan (substitute for upstream `comply opensource`) |
| `orientation/social-post.md` | X + LinkedIn drafts tagged @GauntletAI |
| `orientation/ai-cost-analysis.md` | Doc scaffold; $ figures + reflection paragraph still needed from Cameron |
| `orientation/deployment.md` | Deploy runbook; URL slot empty |
| `orientation/demo-video.md` | Re-record outline (previous attempt was ~10 min, target ≤5) |
| `shared/src/mappers/document-mappers.ts` | Task 10 mapper layer (Phase 2) |
| `api/src/test-utils/pgMock.ts` | `pgResult` + `mockedPool` typed helpers |
| `api/src/utils/queryParams.ts` | `requireParam`, `requireQueryString`, `queryInt` helpers |
| `web/src/lib/httpError.ts` | `HttpError extends Error` class |
| `api/src/__tests__/cascade-delete.test.ts` | Task 14 — cascade safety on person archive |
| `api/src/__tests__/document-sync.test.ts` | Task 14 — body/properties drift |
| `api/src/collaboration/__tests__/session-timeout.test.ts` | Task 14 — WS expiry close-code |
| `api/src/__tests__/phase2-regressions.test.ts` | C-1 / C-2 / DB-1 regression coverage |
| `api/src/__tests__/document-mappers.test.ts` | Task 10 mapper layer unit tests |

---

## The mission for this next session: build `pnpm shipshape`

Cameron's framing (the impetus for context-clear):

> The 10x move is: turn this from a one-time audit into a permanent quality system. A rockstar would not just say "we passed Phase 2." They'd make it hard for Ship to ever silently regress again.
>
> I'd build a single command, `pnpm shipshape`, that produces a fresh, reproducible quality report — type-safety violation count, bundle size + budget, API benchmark deltas, DB EXPLAIN checks, test status, runtime/error probes, axe scan, a generated markdown scoreboard with pass/fail thresholds. Then wire the light version into CI.

Full specs in **Task 27** + **Task 28** in `.taskmaster/tasks/tasks.json`. The short version:

### What `pnpm shipshape` produces

`orientation/shipshape-report.md` — a versioned scoreboard with:

- Top table: 7 categories × {target, actual, pass/fail}
- Per-category sections: raw numbers, evidence-path link, reproduction command
- "Last run" timestamp + the git SHA it ran against

### Architecture (proposed — open to revision)

```
scripts/shipshape/
  run.ts                # entry point — invoked by `pnpm shipshape`
  run-ci.ts             # entry point — invoked by `pnpm shipshape:ci`
  types.ts              # shared CheckResult = { category, target, actual, pass, evidence_path }
  report-template.md    # markdown skeleton
  checks/
    typecheck.ts        # Cat 1 — re-run baseline grep methodology
    bundle.ts           # Cat 2 — run vite build, parse entry chunk gzip
    api.ts              # Cat 3 — autocannon against 5 baseline endpoints
    db.ts               # Cat 4 — EXPLAIN ANALYZE + pg_indexes check
    tests.ts            # Cat 5 — pnpm --filter @ship/api test, parse output
    errors.ts           # Cat 6 — filtered run of phase2-regressions + Task 14 tests
    axe.ts              # Cat 7 — invoke axe-scan-after.mjs, parse summary
```

Each `checks/*.ts` exports a default async function returning `CheckResult`. `run.ts` calls them in parallel where safe (typecheck + tests + bundle are safe; axe + api need the dev stack up — sequence those).

### Pass/fail thresholds (lifted from the PRD)

- **Cat 1:** total violations ≤ 560 (= 25% reduction from 747)
- **Cat 2:** entry chunk ≤ 200 KB gzip (currently 142)
- **Cat 3:** P90 of each baseline endpoint ≤ 1.1 × after-number (no regression > 10%)
- **Cat 4:** dashboard slowest query ≤ 0.1 ms AND all 4 migration-038 indexes present + used
- **Cat 5:** 0 test failures
- **Cat 6:** 0 failures in the filtered critical-path subset
- **Cat 7:** 0 Critical + 0 Serious across all 8 axe routes

### `pnpm shipshape:ci` lite mode (Task 28)

CI runs the cheap subset only (no dev stack required):
- Cat 1 (type-safety count) ✅
- Cat 2 (bundle build) ✅
- Cat 5 (full test suite) ✅
- Cat 6 (critical-path filtered tests) ✅
- Cat 4 static parts only (index existence in pg_indexes — needs Postgres service container, already in CI)

Skipped in CI:
- Cat 3 autocannon (needs dev:api up with E2E_TEST=1)
- Cat 7 axe scan (needs dev:web up + Playwright + chromium)

These two stay as `pnpm shipshape` full-run (manual / nightly) for now.

### Self-test (Task 27 subtask 10)

To prove the gate works, intentionally regress one category:
- Delete migration 038 → Cat 4 fails (indexes missing)
- Remove a `lazy()` wrapper in `web/src/main.tsx` → Cat 2 fails (entry chunk grows)
- Add `as any` cast to a hot file → Cat 1 fails (count regresses)

Document the self-test in a new `orientation/improvements/shipshape.md`.

---

## Recurring gotchas (preserve from Phase 2 work)

### Environment

- **Postgres lives in Docker, currently running under OrbStack** (Cameron migrated from Docker Desktop late on 2026-05-22). Container: `ship-postgres-1`. Env: `POSTGRES_USER=ship`, `POSTGRES_PASSWORD=ship_dev_password`, `POSTGRES_DB=ship_dev`. Connect via `docker exec ship-postgres-1 psql -U ship -d ship_dev`.
- **OrbStack socket gotcha.** If `docker ps` returns "no such file or directory" pointing at `~/.docker/run/docker.sock`, the shell context is still on Docker Desktop. Fix: `docker context use orbstack`. Check with `docker context ls` — the `*` should be on `orbstack`, endpoint `unix:///Users/sheep/.orbstack/run/docker.sock`.
- **OrbStack-fresh volume reminder.** The Docker Desktop → OrbStack migration created a fresh `postgres_data` volume; the original seed data did NOT carry across. After a fresh OrbStack start: `docker compose up -d && pnpm --filter @ship/api exec tsx src/db/migrate.ts && pnpm db:seed`. After this re-seed, `SELECT COUNT(*) FROM users` should be 11; documents = 257.
- **Dev API port** is 3000. Web is 5173 by default (changes if another worktree holds it).
- **Seed credentials**: `dev@ship.local` / `admin123`. Documented in README and surfaced by `pnpm db:seed` output.
- **For benchmark runs** start API with `E2E_TEST=1 pnpm dev:api` — this enables the `X-Bench: 1` rate-limit bypass in `api/src/app.ts:92`. Without it, autocannon at c=25 will hit the dev rate limit (1000/min).
- **Fresh runs need `pnpm db:seed`** — earlier in this session we had axe re-run pass with `0/0` falsely because the DB was empty and every authed route redirected to `/setup`. Always verify seed data exists before benchmarking or scanning.

### pnpm

- **Root `pnpm type-check` is environment-sensitive.** It calls `pnpm --recursive run type-check`. One reviewer hit `[ERROR] fetch failed` on this on their machine; it works fine on the author's. The per-package `pnpm --filter @ship/{shared,api,web} type-check` commands run `tsc --noEmit` directly with no network call and are the **reproducible** gate. Use those in scripts.
- **`comply` CLI is not on PyPI.** The Treasury internal package `compliance-toolkit` is not publicly installable. We installed `gitleaks` directly (`brew install gitleaks`) and ran it manually; that record is at `orientation/compliance-scan.md`. The `.husky/pre-commit` hook will continue to warn-and-skip on machines without comply.

### Test discipline (per memory)

- **Empty test footgun.** `test.fixme()` for unimplemented tests; pre-commit hook catches empty test files via `scripts/check-empty-tests.sh`. Don't write `it('does X', () => { /* TODO */ })` — vitest treats it as passing.
- **E2E tests** always via `/e2e-test-runner` skill; never `pnpm test:e2e` directly (output explosion).
- **`fileParallelism: false`** in `api/vitest.config.ts` means files run sequentially in the same process. Mock leakage across files is a documented gotcha. If a test passes alone but fails in the full suite, suspect shared-process state.
- **`vi.resetAllMocks()`** in `beforeEach` is the right call (not `vi.clearAllMocks()`) when the test file uses `mockResolvedValueOnce` queues. Discovered while fixing the auth.test.ts session-throttle pollution.

### Type-safety methodology

- **The audit count uses ripgrep**, not `tsc`. Methodology in `orientation/baselines/type-safety/counts.txt` §2 + §7. To recount:
  ```bash
  total=0
  for d in web/src api/src shared/src e2e; do
    c=$(rg -n ' as ' --type ts "$d" | grep -v 'as const' | grep -v 'import .* as' \
        | grep -cE ' as ([A-Z][a-zA-Z_0-9]*|any|unknown|string|number|boolean|never|void)')
    total=$((total + c))
  done
  any=$(rg -t ts ': any' web/src api/src shared/src e2e | wc -l)
  echo $((total + any + 1 + 66))   # +1 ts-expect-error, +66 non-null baseline
  ```
- **Baseline**: 747. **Current**: 548. **Target**: ≤560.

### git workflow

- **Per-category branches with `--no-ff` merges** per the brief's "labeled branches" criterion. Naming: `feat/phase2-<category>` for Phase 2 work, `feat/phase3-<feature>` for Phase 3 going forward.
- **`master` is 48 commits ahead of `origin/master`.** Not pushed. Reasoning: pushing publishes the placeholder URLs in SUBMISSION.md before Cameron deploys the fork + records the demo video. Push sequence (from SUBMISSION.md):
  1. Cameron deploys → fills `orientation/deployment.md` + SUBMISSION.md
  2. Cameron re-records demo → fills `orientation/demo-video.md` + SUBMISSION.md
  3. Cameron pulls Claude $ figures → fills `orientation/ai-cost-analysis.md`
  4. `git push origin master`
  5. Cameron posts X + LinkedIn → fills `orientation/social-post.md`
- **Never `git commit --no-verify`** — see `CLAUDE.md` security compliance. Hook warnings about missing `comply` CLI are non-fatal; the commit proceeds.

### What's intentionally not tracked

Per SUBMISSION.md "What's deliberately not tracked":
- `.agents/`, `.codex/`, `AGENTS.md` — peer-agent scratch + Codex instructions
- `.env.example` — local env template; Ship's own `.gitignore` excludes `.env*`
- `api/coverage/`, `web/coverage/` — vitest coverage artifacts
- `orientation/next-session.md` — the Phase 1→2 handoff file (deliberately kept as the auditor's working memo); this new file (`next-session-phase3.md`) is the Phase 2→3 handoff
- `orientation/audit-edge-cases-notes.md` — auditor's edge-case notes

---

## How to start the next session cold

1. **`cd /Users/sheep/Desktop/Gauntlet/ship && git log --oneline -3`** to verify you're at the right HEAD. Top commit should be `9e6fe87 docs: clean stale claims and Task 26 inconsistency` or later.

2. **Read this file**, then `cat SUBMISSION.md | head -80` for the at-a-glance scoreboard.

3. **Verify gates are still green**:
   ```bash
   pnpm --filter @ship/api type-check  # exit 0
   pnpm --filter @ship/web type-check  # exit 0
   pnpm --filter @ship/api test        # 35 files / 494 tests
   ```
   If any fail, that's a regression to fix before starting Task 27 work.

4. **Read Task 27 spec**:
   ```bash
   jq '.master.tasks[] | select(.id == "27")' .taskmaster/tasks/tasks.json
   ```

5. **Branch**: `git checkout -b feat/phase3-shipshape master` per the per-task convention.

6. **First implementation move**: scaffold `scripts/shipshape/` per the architecture sketch above. The shared `CheckResult` type + `run.ts` orchestrator + `report-template.md` come first; the per-category checks plug in one at a time.

7. **The smallest possible end-to-end demonstrator**: wire just Cat 5 (test suite pass/fail) first. That proves the orchestrator + report shape work before sinking time into the harder per-category logic.

8. **Once shipshape itself works**, the self-test (subtask 10) — break Cat 4 by dropping the indexes from a transient SQL block, verify `pnpm shipshape` exits nonzero, restore. Document in `orientation/improvements/shipshape.md`.

9. **Then Task 28** — wire `:ci` lite mode into `.github/workflows/test.yml`.

10. **If there's time after both Tasks 27 + 28**, Tasks 29 (Zod contracts) and 30 (collab observability) are bigger. Plan one or the other; don't try both.

---

## Open questions queued for Cameron

These didn't need to block Phase 2 but should be settled before the Sunday submission:

1. **Demo video hosting choice** — YouTube unlisted, Loom, Vimeo? Affects the URL in SUBMISSION.md + demo-video.md.
2. **Deployed fork target** — `./scripts/deploy.sh prod` (Elastic Beanstalk per CLAUDE.md), or Vercel/Railway/Cloudflare Pages? The current deployment.md is structured for the former.
3. **Push timing** — push `master → origin/master` before or after demo recording? Pushing now publishes "FILL IN" placeholders to the public fork. Recommended order is in SUBMISSION.md.
4. **AI cost-analysis $ figures** — Cameron pulls from billing dashboard.
5. **Reflection paragraph in ai-cost-analysis.md** — Cameron's personal voice; auditor shouldn't ghostwrite.

---

## Memory / skill notes for this transition

- **Memory file `feedback_narrated_demo_timing.md`** (Phase 1): for any demo script, multiply silent-read time by ~1.7× to predict recording time. The Phase 1 demo overshot 5min target → 10min recording for this reason. The re-record outline at `orientation/demo-video.md` accounts for this.
- **Memory file `feedback_branch_per_task.md`**: always `git checkout -b feat/<scope>-<slug>` before starting any top-level Taskmaster task; subtasks share the branch.
- **Memory file `feedback_parallel_subagents.md`**: when N siblings unblock simultaneously, spawn worktree-isolated subagents in one message. Phase 2 used this for the 3-way DB/TS/A11y kickoff. **Gotcha discovered:** worktree-isolated subagents wrote to the main repo path (Edit uses absolute paths), defeating the isolation. If you spawn subagents for the shipshape work, give them explicit instructions to write to their worktree's working directory or fold this constraint into the system prompt.

---

## What "done" looks like for the next session

If you want a green Task 27 (`pnpm shipshape`):

- `scripts/shipshape/run.ts` exists, is callable via `pnpm shipshape`, and exits 0 on a clean master.
- `orientation/shipshape-report.md` is generated, 7 sections, top-line "pass" with all category targets hit.
- One self-test demonstrating the gate (regress + verify nonzero exit + restore).
- `orientation/improvements/shipshape.md` documents the system + how to read the report.

If you want a green Task 28 (`pnpm shipshape:ci`):

- `pnpm shipshape:ci` runs in the GitHub Actions environment in <2 minutes.
- `.github/workflows/test.yml` uploads `shipshape-report.md` as a workflow artifact.
- `orientation/improvements/ci-workflow.md` updated with the new gate description.

If both land, the institutional-memory loop is closed: every future PR has a downloadable scoreboard, and any of the 7 PRD categories silently regressing triggers a CI failure.

That's the multiplier Cameron asked for.
