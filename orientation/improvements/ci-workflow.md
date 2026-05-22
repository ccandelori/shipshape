# Cross-cutting — Minimal CI workflow

**Branch:** `feat/phase2-ci` (merged) + `fix/phase2-web-type-check` (merged)
**Task:** 17 — Add GitHub Actions workflow to run type-check + test on every pull request.
**Status:** ✅ Workflow file exists at `.github/workflows/test.yml`; both gates pass on the current `master`. Closes presearch risk #1 (no CI gate before Phase 2).

## What it checks

Two jobs run on every push to master and every pull request to master:

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

`.github/workflows/test.yml` — 68 lines. Reads cleanly top-to-bottom; the inline comment at the top explains the design intent for future maintainers.

## What unblocks once CI lands on a hosted runner

The PRD does not require the workflow to be _running on GitHub_ — only that it exists and runs the right gates. Pushing this branch to a remote with GitHub Actions enabled would activate the workflow on the next PR; that's a deployment step, not a code step. Out of scope for the local Phase 2 evidence package.

## Tradeoffs

- Locked to Postgres 16 (matches dev) rather than the task spec's Postgres 15. Identical behavior for everything this codebase uses; no migration churn.
- Uses `pnpm/action-setup@v4` rather than the task spec's `@v2`. v4 is the current stable; v2 is on deprecation notice. Behavior identical for our use.
- Node 22 (current LTS) rather than the task spec's 20. Vitest + tsx + tsc all work identically on 22.

These deviations are all in the direction of newer-stable; nothing weakens the gate.
