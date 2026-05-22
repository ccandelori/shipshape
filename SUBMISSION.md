# GFA Week 4 — ShipShape Final Submission

Top-level pointer file for graders. Every deliverable the brief requires is linked here with a one-line "what to look at." If you only have time for one file, read [`orientation/audit-report.md`](orientation/audit-report.md).

---

## At-a-glance scoreboard

| # | Category | PRD target | Result | Evidence |
|---|---|---|---|---|
| 1 | Type Safety | 25% violation reduction | ✅ **26.6%** (747 → 548) | [`orientation/improvements/type-safety.md`](orientation/improvements/type-safety.md) |
| 2 | Bundle Size | 20% initial-load OR 15% total | ✅ **76% entry chunk** (587 → 142 kB gzip) | [`orientation/improvements/bundle-size.md`](orientation/improvements/bundle-size.md) + [`orientation/baselines/bundle/after-build.txt`](orientation/baselines/bundle/after-build.txt) |
| 3 | API Response Time | 20% P95 reduction on ≥2 endpoints | ✅ **35-88%** on every measured endpoint (P90/P97.5 bracket P95) | [`orientation/improvements/api-response-time.md`](orientation/improvements/api-response-time.md) + [`orientation/baselines/api-response-time/after-*-c25.json`](orientation/baselines/api-response-time/) |
| 4 | DB Query Efficiency | 50% slowest query OR 20% query count | ✅ **73%** on dashboard slowest query; 3 sibling queries newly index-served | [`orientation/improvements/database-query-efficiency.md`](orientation/improvements/database-query-efficiency.md) + [`orientation/baselines/db-efficiency/after-*.txt`](orientation/baselines/db-efficiency/) |
| 5 | Test Coverage | 3 critical-path tests OR 3 flaky fixes | ✅ **30 new tests** (3 regressions + 12 Task 14 + 18 mapper) | [`orientation/improvements/test-coverage.md`](orientation/improvements/test-coverage.md) |
| 6 | Runtime Error Handling | 3 gaps, ≥1 user-facing data loss | ✅ **3 gaps**: silent NULL persist, verbose error leak, WS session expiry | [`orientation/improvements/runtime-error-handling.md`](orientation/improvements/runtime-error-handling.md) |
| 7 | Accessibility | 10+ Lighthouse OR all Critical/Serious on 3 pages | ✅ **0 Critical / 0 Serious** on **all 8** scanned routes (was 4 Critical + 4 Serious) | [`orientation/improvements/accessibility.md`](orientation/improvements/accessibility.md) + [`orientation/baselines/accessibility/after-axe-summary.md`](orientation/baselines/accessibility/after-axe-summary.md) |
| + | CI workflow (cross-cutting) | (not a category) | ✅ `.github/workflows/test.yml` runs type-check + api-tests; closes presearch risk #1 | [`orientation/improvements/ci-workflow.md`](orientation/improvements/ci-workflow.md) |

---

## Required deliverables (per the brief)

### 1. GitHub Repository

This repository. Master is the integration branch with all category branches merged via `--no-ff` so each PRD category has a labeled branch in history.

```bash
git log --oneline --merges master | head -20
```

shows the per-category merge commits: `feat/phase2-errors`, `feat/phase2-db`, `feat/phase2-bundle`, `feat/phase2-a11y`, `feat/phase2-typesafety`, `feat/phase2-api`, `feat/phase2-tests`, `feat/phase2-ci`, plus follow-ups (`feat/phase2-task14-tests`, `feat/phase2-task10-mappers`, `feat/phase2-task12-membership-cache`, `feat/phase2-task16-a11y`, `fix/phase2-web-type-check`, `fix/phase2-blocker-followup`).

### 2. Audit Report

- Executive: [`orientation/audit-report.md`](orientation/audit-report.md)
- Detailed: [`orientation/audit-report-detailed.md`](orientation/audit-report-detailed.md) — 1,091 lines, methodology + raw numbers + per-finding evidence
- Orientation Checklist (Appendix A): [`orientation/README.md`](orientation/README.md) — 855 lines, all 8 PDF sections complete

### 3. Improvement Documentation

Seven category docs + one cross-cutting doc, all at the Task 18 expected filenames in [`orientation/improvements/`](orientation/improvements/):

| File | Category |
|---|---|
| `type-safety.md` | 1 |
| `bundle-size.md` | 2 |
| `api-response-time.md` | 3 |
| `database-query-efficiency.md` | 4 |
| `test-coverage.md` | 5 |
| `runtime-error-handling.md` | 6 |
| `accessibility.md` | 7 |
| `ci-workflow.md` | cross-cutting |

Each contains: before measurement (link to baseline file), root cause, fix description, after measurement (same methodology), reproduction recipe, tradeoffs.

### 4. Discovery Write-up

[`orientation/discovery.md`](orientation/discovery.md) — three things learned, captured in the Kickoff page-12 **WHAT · WHERE · WHY · THE POINT · THEN** format. Most surprising: Ship persists every editable document twice (binary CRDT + JSON snapshot in the same row) — an architectural pattern, not a TypeScript feature.

### 5. Demo Video (3-5 minutes)

**Status:** ⏳ Recorded once (~10 min, overshot 5-min target). Re-record + host pending — see [`orientation/demo-video.md`](orientation/demo-video.md) for the re-record outline.

Hosted URL: **[NOT YET POSTED]**

Source assets:
- Slides (HTML): [`orientation/demo-deck/html/index.html`](orientation/demo-deck/html/index.html)
- Slidev fallback: [`orientation/demo-deck/slides.md`](orientation/demo-deck/slides.md)
- Read-aloud script: [`orientation/demo-deck/script.md`](orientation/demo-deck/script.md)

> Note from the auditor: recording ran ~10 min vs. the 5-min target. Re-recorded version coming for submission.

### 6. AI Cost Analysis

**Status:** ⏳ Doc scaffold + qualitative analysis shipped; actual $ figures and personal reflection paragraph pending Cameron's billing-dashboard pull.

[`orientation/ai-cost-analysis.md`](orientation/ai-cost-analysis.md)

### 7. Deployed Application

**Status:** ⏳ Deploy + smoke test pending. See [`orientation/deployment.md`](orientation/deployment.md) for the runbook.

Public URL of the improved fork: **[NOT YET DEPLOYED]**
Backend health check: **[NOT YET DEPLOYED]**

### 7.5 Compliance scan (security)

[`orientation/compliance-scan.md`](orientation/compliance-scan.md) — local-equivalent of upstream's `comply opensource` (gitleaks + AI + trivy bundle). The Treasury `comply` toolkit is internal; this scan ran gitleaks 8.30.1 directly:

- **28 Phase 2 commits / 1.08 MB scanned → 0 findings.** Artifact: [`orientation/compliance/gitleaks-phase2-commits.json`](orientation/compliance/gitleaks-phase2-commits.json) (empty array).
- **Full working tree / 25.4 MB scanned → 1 finding**, analysed and categorised as a pre-existing false positive on the documented dev seed credential in `.claude/settings.local.json` (already in `.gitignore`, not modified by Phase 2). Artifact: [`orientation/compliance/gitleaks-fulltree.json`](orientation/compliance/gitleaks-fulltree.json).

Cross-references to every section of [`docs/claude-reference/security.md`](docs/claude-reference/security.md) are included in the scan doc, including the two documented behavior deltas (auth middleware `last_activity` throttle + new WS re-validation tick) — neither weakens security, ERR-3 strengthens it.

### 8. Social Post

**Status:** ⏳ Drafts shipped (X + LinkedIn); posted-link slots empty.

[`orientation/social-post.md`](orientation/social-post.md) — both an X and a LinkedIn draft tagged `@GauntletAI`. Post-deploy, paste the URLs there.

---

## How to verify locally

Run the per-package commands directly — they are the authoritative gate and don't depend on root-script wrappers. The root wrappers (`pnpm type-check`, `pnpm run type-check`) call `pnpm --recursive run type-check`; if your environment has a stale pnpm store or registry-reach issues, the wrapper may surface `[ERROR] fetch failed` before any compile runs. In that case, run `pnpm install` first (or use the per-package commands below — they bypass the recursive wrapper entirely).

```bash
# 1) Postgres + seed
docker compose up -d
pnpm install                          # required after fresh clone; ensures workspace links resolve
pnpm db:seed

# 2) Type-check gate (authoritative — per-package, no recursive wrapper)
pnpm --filter @ship/shared type-check   # → exit 0
pnpm --filter @ship/shared build        # builds dist/ so api + web can resolve @ship/shared
pnpm --filter @ship/api    type-check   # → exit 0
pnpm --filter @ship/web    type-check   # → exit 0

# (Equivalent root wrapper, when network/store is healthy:)
#   pnpm type-check                     # → exit 0 across api/web/shared

# 3) Test gate
pnpm --filter @ship/api test            # → 35 files, 494 tests pass

# 4) Bundle gate
pnpm --filter @ship/web build           # → entry chunk 142.66 kB gzip

# 5) Accessibility re-scan (with dev:api + dev:web running)
pnpm dev &
sleep 5
pnpm db:seed
node orientation/baselines/accessibility/axe-scan-after.mjs
# → 0/0 Critical/Serious on all 8 routes
```

> **Honest note on the root wrapper.** During the Phase 2 follow-up audits we saw `pnpm type-check` exit with `[ERROR] fetch failed` on one reviewer's machine and exit 0 cleanly on the author's machine — same SHA, same lockfile. That's a pnpm-store / network-reach environmental difference, not a code regression. The per-package commands above run `tsc --noEmit` directly with no network call and are the reproducible gate.

---

## Push status

As of writing, `master` is **45 commits ahead** of `origin/master` and **not pushed**. The Phase 2 work lives entirely in those 45 local commits.

The brief's "GitHub Repository" deliverable is not satisfied until those commits are pushed to the public fork (`labs.gauntletai.com/cameroncandelori/shipshape.git`). One reason for the delay: pushing publishes the deploy-blocking placeholders (no hosted URL, no posted social link). The current plan is:

1. Cameron deploys the fork (Task 22) → fills in the URL in `SUBMISSION.md` + `orientation/deployment.md`.
2. Cameron re-records demo to ≤5 min, uploads (YouTube unlisted / Loom) → URL into `SUBMISSION.md` + `orientation/demo-video.md`.
3. Cameron pulls actual Claude spend → fills in `orientation/ai-cost-analysis.md`.
4. Cameron pushes `master` → `origin/master`. Should be a single `git push origin master`.
5. Cameron posts the X + LinkedIn drafts → fills in `orientation/social-post.md` "Posted" section.

`git log --oneline origin/master..master | wc -l` shows the current delta. The PR/merge history is preserved across `--no-ff` merges so each Phase 2 category has a labeled branch entry.

## What's deliberately not tracked

- `.agents/`, `.codex/`, `AGENTS.md` — peer-agent scratch and Codex instructions; not part of the deliverable
- `.env.example` — local env template; Ship's own `.gitignore` excludes `.env*`
- `api/coverage/`, `web/coverage/` — generated vitest coverage artifacts
- `orientation/next-session.md` — auditor's working memo between Phase 1 and Phase 2
- `orientation/audit-edge-cases-notes.md` — auditor's own notes on baseline measurement edge cases

Each is intentionally left untracked to keep the deliverable surface clean.

---

## Grading hint

The strongest evidence sits in three places:

1. **The 8 axe Critical/Serious findings going to 0/0** — `orientation/baselines/accessibility/after-axe-summary.md`. Mechanical proof of a hard PRD gate.
2. **The dashboard query going from a 88%-wasted bitmap scan to an index seek** — `orientation/baselines/db-efficiency/after-dashboard-issues.txt`. Same workload, EXPLAIN ANALYZE before/after.
3. **The 587 → 142 kB gzip entry chunk** — `orientation/baselines/bundle/after-build.txt`. Vite output, same vite.config.ts, same dependencies.

Everything else has receipts; those are the three I'd lead with.
