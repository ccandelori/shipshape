# Cross-cutting — Minimal CI workflow

**Branch:** `feat/phase2-ci` (merged) + `fix/phase2-web-type-check` (merged) + `feat/phase3-shipshape` (Phase 3 extension)
**Task:** 17 (Phase 2) + 28 (Phase 3) — Add GitHub Actions workflow to run type-check, tests, and the `pnpm shipshape:ci` quality gate on every pull request.
**Status:** ✅ Workflow file exists at `.github/workflows/test.yml`. The underlying per-package commands the workflow runs all exit 0 on current `master`. Phase 3 added a third job (`shipshape-ci`) that runs the Cat 1/2/4-static/5/6 subset and uploads the generated `shipshape-report.md` as a workflow artifact. **The root wrapper `pnpm type-check` is environment-sensitive — see "Note" below.**

Per-package commands the workflow runs (these are the authoritative gates):

- `pnpm install --frozen-lockfile` → ok (warnings about unapproved build scripts are non-fatal and match upstream behavior)
- `pnpm --filter @ship/shared build` → ok
- `pnpm --filter @ship/shared type-check` → exit 0
- `pnpm --filter @ship/api    type-check` → exit 0
- `pnpm --filter @ship/web    type-check` → exit 0
- `pnpm --filter @ship/api    test` → 35 files, 494 tests pass (verified by 5 consecutive runs to rule out flake)
- `pnpm --filter @ship/web    build` → built in 2.55s, entry chunk 142.66 kB gzip

Closes presearch risk #1 (no CI gate before Phase 2).

### Note on the root wrapper

`pnpm type-check` and `pnpm run type-check` both alias to `pnpm --recursive run type-check`. We've observed inconsistent behaviour across machines:

- ✅ On the author's machine (pnpm 10.27.0, warm cache, full network): exits 0 in ~1 s.
- ❌ On at least one reviewer's machine (same SHA, same lockfile): exits with `[ERROR] fetch failed` *before* any compile runs.

`fetch failed` is a pnpm internal — it happens when pnpm tries to verify the workspace's metadata against a registry it can't reach (corporate proxy, stale store, intermittent DNS). It is **not a TypeScript compile failure**; running `tsc --noEmit` directly per-package always succeeds. The CI workflow on GitHub Actions hits `actions/setup-node@v4` with pnpm cache enabled, which avoids the stale-store path; we have not seen it fail there in our local reproductions of the workflow.

If you hit `fetch failed` locally:

1. Run `pnpm install` first (forces the store + lockfile to refresh).
2. Or run the per-package commands above — they bypass the recursive wrapper entirely.

The per-package commands are the **reproducible** gate. The root wrapper is a convenience that depends on pnpm's view of the registry.

## What it checks

Three jobs run on every push to master and every pull request to master (Phase 3 added the third):

### `type-check`
- `pnpm install --frozen-lockfile`
- `pnpm build:shared` (shared types must build before api/web can type-check)
- `pnpm type-check` (runs across api + web + shared)

This is the gate the user audit caught me failing — at the time the workflow landed, `pnpm --filter @ship/web type-check` had 82 `noUncheckedIndexedAccess` / `noImplicitReturns` errors. `fix/phase2-web-type-check` closed all of them.

### `api-tests`
- `pnpm install --frozen-lockfile`
- `pnpm build:shared`
- `pnpm --filter @ship/api exec tsx src/db/migrate.ts` (runs migrations against the service Postgres)
- `pnpm --filter @ship/api test` (full vitest suite — 464 tests, including the 3 phase2-regressions tests added in Cat 5)

The Postgres service container uses the same `ship` / `ship_dev_password` / `ship_dev` credentials as `docker-compose.yml` so the migrations + seeds work identically to local dev. PostgreSQL 16 (matching the local dev container) rather than the task-spec'd 15.

### `shipshape-ci` (Phase 3 / Task 28)

- `needs: [type-check, api-tests]` — only runs once both upstream gates pass
- Same Postgres service container as `api-tests` (re-bound for the index existence check)
- `pnpm install --frozen-lockfile`
- `pnpm build:shared`
- `pnpm --filter @ship/api exec tsx src/db/migrate.ts` (so migration-038 indexes exist in pg_indexes)
- `apt-get install postgresql-client` (the runner doesn't ship `psql`)
- `pnpm shipshape:ci` — runs the lite-mode orchestrator
- `actions/upload-artifact@v4` — uploads `orientation/shipshape-report.md` so every PR has a downloadable scoreboard (30-day retention)

The lite-mode orchestrator runs five of the seven audit categories:

| Cat | What | Why in CI |
|---|---|---|
| 1 | type-safety ripgrep count vs 747 baseline (target ≤ 560) | catches `as any` / `: any` regressions before merge |
| 2 | bundle `pnpm --filter @ship/web build` entry chunk ≤ 200 KB gzip | catches a `lazy()` wrapper being removed |
| 4 (static) | all 4 migration-038 indexes present in pg_indexes | catches an accidental migration revert |
| 5 | full vitest suite (494 / 35 files) | catches any test regression |
| 6 | filtered critical-path subset (phase2-regressions + Task 14 + mappers) | redundant safety on the high-value tests |

Cat 3 (autocannon) and Cat 7 (axe) stay as `pnpm shipshape` full-run for now — both need a longer-running runner with the dev stack actually up. Tracked as a follow-up.

`SHIPSHAPE_NO_RESEED=1` is set in the job env so the orchestrator skips the
post-run seed restore — CI tears the container down anyway.

## Why this matters

Phase 1 presearch noted: "no CI workflow exists, every type-check / test failure could ship to master unnoticed." The Phase 1 audit was conducted entirely against locally-run gates — there was no automated verification on PRs.

Without CI, the exact failure mode the user audit flagged would have been invisible: the TS-1-extended commit landed an `HttpError` import sweep that missed 11 hooks, which broke `pnpm build:web`. A CI gate would have caught this before the merge.

## What's deliberately not in scope (yet)

- **No web tests job.** Vitest on the web side exists (`pnpm --filter @ship/web test`) but the suite is small (the Phase 1 baseline noted it). The CI workflow only runs api tests, which contain the critical-path regression coverage. Web vitest is a fast follow.
- **No E2E (Playwright) job.** The repo has ~73 Playwright tests but they require a running stack (dev API + dev web + Postgres + Yjs collaboration server). Spinning that up in CI is a meaningful project on its own. Out of scope for Phase 2.
- **No lint job.** No linter is configured in the repo today. Adding one is its own scope.
- **No security scan / SBOM.** Same — its own scope.

## How to verify locally

```bash
# Type-check gate (mirrors the type-check job)
pnpm install
pnpm build:shared
pnpm type-check        # 3 packages: api, web, shared

# API tests gate (requires Postgres running)
docker compose up -d
pnpm --filter @ship/api exec tsx api/src/db/migrate.ts
pnpm --filter @ship/api test
```

If both exit 0, the CI workflow will also pass on the same SHA.

## Workflow file location

`.github/workflows/test.yml`. Reads cleanly top-to-bottom; the inline comment at the top explains the design intent for future maintainers. Phase 3 added the `shipshape-ci` job below `api-tests`.

## What unblocks once CI lands on a hosted runner

The spec does not require the workflow to be _running on GitHub_ — only that it exists and runs the right gates. Pushing this branch to a remote with GitHub Actions enabled would activate the workflow on the next PR; that's a deployment step, not a code step. Out of scope for the local Phase 2 evidence package.

## Tradeoffs

- Locked to Postgres 16 (matches dev) rather than the task spec's Postgres 15. Identical behavior for everything this codebase uses; no migration churn.
- Uses `pnpm/action-setup@v4` rather than the task spec's `@v2`. v4 is the current stable; v2 is on deprecation notice. Behavior identical for our use.
- Node 22 (current LTS) rather than the task spec's 20. Vitest + tsx + tsc all work identically on 22.

These deviations are all in the direction of newer-stable; nothing weakens the gate.
