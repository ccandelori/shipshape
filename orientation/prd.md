# PRD — ShipShape Audit & Targeted Improvements

**Project:** GFA Week 4 — ShipShape audit on `US-Department-of-the-Treasury/ship`
**Owner:** Cameron Candelori
**Date:** 2026-05-19
**Final deadline:** Sunday, 2026-05-24 10:59 PM CT
**Gate:** Project completion required for Austin admission.

---

## Overview

Ship is a production TypeScript monorepo (React + Express + Postgres + Yjs over WebSocket) deployed to AWS Elastic Beanstalk and S3/CloudFront. This project audits the codebase across 7 dimensions and ships measurable improvements in each. Diagnosis precedes treatment: the Phase 1 deliverable is a baseline audit report with no code changes; Phase 2 implements targeted fixes proven against those baselines.

This PRD does not introduce new product features. It catalogs the engineering work required to (a) measure the system honestly across 7 audit categories, (b) deliver a quantifiable improvement in each, (c) document the work to a quality bar that another engineer could reproduce, and (d) submit the full package by the Sunday deadline.

Inputs to this PRD: the GFA Week 4 ShipShape brief (`Gauntlet/GFA Week 4 - ShipShape.pdf`) and the retrospective architectural analysis at `orientation/presearch.md`.

---

## Success Criteria

**Phase 1 audit (hard gate, pass/fail).** A written audit report with baseline measurements for **all 7 categories**. Each category includes: methodology, tools used, raw data, top findings, severity ranking. Incomplete audits are automatic fail regardless of implementation quality.

**Phase 2 implementation (scored).** Measurable improvement in **each** of 7 categories, hitting the target defined per category below. Every improvement must include before/after benchmarks run under identical conditions and a written explanation of root cause + fix + tradeoffs.

**Final submission (Sunday 10:59 PM CT).** Forked GitHub repo with branches per improvement, audit report, per-category improvement docs, discovery write-up (3 things learned), 3–5 min demo video, AI cost analysis, deployed application, social post.

---

## Category Targets (from the brief)

1. **Type Safety** — eliminate **25% of type-safety violations** (any types, type assertions, non-null assertions, ts-ignore/ts-expect-error, implicit any). Superficial fixes don't count; `any → unknown` without narrowing doesn't count.
2. **Bundle Size** — **15% reduction in total production bundle**, or **20% reduction in initial page-load bundle** via code splitting.
3. **API Response Time** — **20% P95 reduction on ≥2 endpoints**. Before/after under identical load conditions. Document root cause.
4. **Database Query Efficiency** — **20% reduction in total query count on ≥1 user flow**, or **50% improvement on the slowest query**. Document with `EXPLAIN ANALYZE`.
5. **Test Coverage & Quality** — add meaningful tests for **3 previously untested critical paths**, OR fix **3 flaky tests** with documented root-cause analysis. Each test includes a comment explaining the risk it mitigates.
6. **Runtime Error & Edge Case Handling** — fix **3 error-handling gaps**. ≥1 must involve real user-facing data loss or confusion (not just a missing spinner). Each requires reproduction steps, before/after, screenshot or recording.
7. **Accessibility** — **10+ point Lighthouse a11y score improvement on the lowest-scoring page**, OR fix all Critical/Serious axe violations on the 3 most important pages.

---

## Phase 1: Audit (36 hours from project start)

For each category below, the deliverable is: measurement methodology + tools + baseline numbers + top findings + severity ranks. Code changes are explicitly forbidden in this phase.

### Audit 1: Type Safety baseline

- Run `pnpm type-check 2>&1 | tee orientation/baseline-tsc.txt`. Record total error count, by package.
- Count via ripgrep: explicit `: any`, `as ` assertions (excluding `as const`), non-null `!`, `@ts-ignore`, `@ts-expect-error`, implicit-any errors from `tsc`.
- Break down by package (`web/`, `api/`, `shared/`, `e2e/`).
- Identify top 5 violation-dense files with counts.
- Confirm tsconfig settings per package; note any safety flags that are off (especially `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch` on `web/tsconfig.json`).
- Deliverable: audit-report section with the metric table from the brief filled in.

### Audit 2: Bundle Size baseline

- Build production frontend: `pnpm build:web`. Record total `dist/` size and per-chunk sizes.
- Add a bundle visualizer (`rollup-plugin-visualizer` or `vite-bundle-analyzer`) and generate a treemap.
- Identify the top 3 largest dependencies and the top 5 largest chunks.
- Cross-reference `web/package.json` against actual imports to identify unused dependencies.
- Evaluate where code splitting is already in use and where it would help (initial-load reduction opportunities).
- Deliverable: audit-report section with bundle-size metric table from the brief.

### Audit 3: API Response Time baseline

- Seed the database with realistic volume via `pnpm db:seed`. Confirm 500+ documents, 100+ issues, 20+ users, 10+ sprints.
- Identify the 5 most-used endpoints by tracing frontend network traffic during common user flows (load dashboard, view a document, list issues, load sprint board, search).
- Benchmark each endpoint with a load tester (`autocannon`, `k6`, or `hey`). Record P50/P95/P99.
- Test under concurrent load at 10, 25, 50 connections.
- Hypothesize why the slowest endpoints are slow.
- Deliverable: audit-report section with the endpoints table from the brief.

### Audit 4: Database Query Efficiency baseline

- Enable Postgres query logging (`log_statement = 'all'` via `postgresql.conf` or env variable).
- Execute the 5 user flows from Audit 3 and count total queries per flow. Identify N+1 patterns.
- Run `EXPLAIN ANALYZE` on the slowest queries from each flow.
- Cross-reference WHERE clauses against existing indexes. Flag JSONB property reads without expression indexes (presearch finding #3).
- Deliverable: audit-report section with the user-flow query table from the brief.

### Audit 5: Test Coverage & Quality baseline

- Run the full Vitest suite: `pnpm test`. Record pass/fail/skipped count and suite runtime.
- Run the E2E suite via the `/e2e-test-runner` skill (never `pnpm test:e2e` directly). Record pass/fail/flaky.
- Run the E2E suite 3 times to identify flaky tests.
- Catalog which critical flows are covered vs. uncovered (document CRUD, real-time sync, auth, sprint management, document conversion, accountability workflow).
- Configure code coverage if absent; report line/branch coverage per package.
- Deliverable: audit-report section with the test metrics table from the brief.

### Audit 6: Runtime Error & Edge Case baseline

- Open DevTools console during normal usage. Count errors and warnings.
- Test network failure during collaborative editing: disconnect, edit, reconnect. Note data survival and UI recovery.
- Test malformed input: empty forms, extremely long text, special characters, HTML/script injection attempts.
- Test concurrent edges: two browser tabs editing the same document field simultaneously.
- Throttle to slow 3G; document every silent failure, hanging spinner, missing loading state.
- Check server logs (CloudWatch in deployed envs; stdout locally) for unhandled errors.
- Deliverable: audit-report section with the runtime-error table from the brief.

### Audit 7: Accessibility baseline

- Run Lighthouse accessibility audit on every major page; record per-page score.
- Run axe scan (`@axe-core/playwright`) and categorize violations by severity (Critical/Serious/Moderate/Minor).
- Test full keyboard navigation on critical flows: can you reach every interactive element using only Tab/Enter/Escape/arrow keys?
- Test with VoiceOver (macOS) on the dashboard and a document edit page.
- Check color-contrast ratios on text/buttons/icons against WCAG 2.1 AA 4.5:1.
- Deliverable: audit-report section with the accessibility table from the brief.

### Audit consolidation

Assemble the 7 baseline sections into a single audit report at `orientation/audit-report.md` with: executive summary, per-category sections (each with metrics + top findings + severity ranking), and a "what I'm going to attack" prioritization for Phase 2.

---

## Phase 2: Implementation (Fri 2026-05-22 11:59 PM)

Each improvement below maps to one of the 7 categories. Every improvement requires a before-and-after benchmark, a root-cause explanation, and a tradeoff write-up. Improvements live on clearly-labeled branches off `master`. No cosmetic changes count toward the targets.

### Improvement 1: Type-safety domain mapper layer (Category 1)

The presearch finding is that ~1,474 `as` assertions across the codebase trace to two columns typed as `Record<string, unknown>` in `shared/src/types/document.ts:241,247` (`content` and `properties`). Introduce a per-document-type mapper layer between `pg.QueryResult` rows and TypeScript `*Document` variants. Apply to the 5 most violation-dense files first (`api/src/routes/team.ts`, `weeks.ts`, `claude.ts`, `web/src/pages/UnifiedDocumentPage.tsx`, `web/src/components/UnifiedEditor.tsx`). Also: fix `web/tsconfig.json` to inherit `noUncheckedIndexedAccess`, `noImplicitReturns`, and `noFallthroughCasesInSwitch` from root.

Target: 25% reduction in combined violation count. Baseline numbers come from Audit 1.

### Improvement 2: Bundle size — code splitting + dependency audit (Category 2)

Use Audit 2's treemap to identify (a) unused dependencies to remove, (b) heavy dependencies (likely TipTap extensions, Radix, USWDS, emoji-picker-react) that can be code-split, (c) routes that can be lazy-loaded via `React.lazy()` + Suspense. Implement route-level code splitting at minimum. Re-run the bundle build and compare.

Target: 15% total reduction OR 20% initial-load reduction. No removed features.

### Improvement 3: API response time — middleware caching + targeted SQL (Category 3)

Two-pronged based on presearch findings. (a) Per-request membership cache: the auth middleware currently runs 3 SQL queries on every authenticated request (session+user join, membership lookup, activity update — `api/src/middleware/auth.ts:110–208`). Add a request-scoped cache so a given (user_id, workspace_id) is looked up at most once per request. (b) Targeted slow-query work: pick the 2 endpoints with the highest P95 from Audit 3; fix the dominant cause (often N+1 from association/owner lookups).

Target: 20% P95 reduction on ≥2 endpoints under identical load.

### Improvement 4: Database query efficiency — expression indexes on hot JSONB paths (Category 4)

Add B-tree expression indexes on the JSONB property paths used in WHERE clauses without index support. Confirmed candidates from the presearch: `(properties->>'state')` for issue queries, `((properties->>'assignee_id')::uuid)` for assignee filters, `((properties->>'sprint_number')::int)` for sprint lookups, `((properties->>'owner_id')::uuid)` for owner lookups. Ship as one numbered migration (next number is 038). Verify via `EXPLAIN ANALYZE` before/after on the dashboard's "my active issues" query.

Target: 20% reduction in total query count on a user flow, or 50% improvement on the slowest query. Document the EXPLAIN plan in the improvement write-up.

### Improvement 5: Test coverage — three critical-path tests (Category 5)

Add three meaningful tests that cover previously uncovered critical paths. Recommended candidates (all surfaced by the orientation pass):

1. WebSocket session timeout enforcement — verify a session that expires while a WS connection is open is rejected on the next message.
2. Document body / properties drift — verify that an edit to the TipTap body correctly updates `content` JSON snapshot AND properties extraction (e.g., a project document's `hypothesis` field gets re-extracted).
3. Cascade delete safety — verify that archiving a person document does not leave dangling `properties->>'assignee_id'` references on related issues (regression test for the soft-FK gap).

Each test must include a comment naming the risk it mitigates.

Target: 3 critical paths covered with documented risk rationale.

### Improvement 6: Runtime error handling — three documented fixes (Category 6)

≥1 of the 3 fixes must address user-visible data loss or confusion. Recommended candidates:

1. **Global Express error handler.** No global error handler exists today (`api/src/app.ts`). Default 500 returns HTML; frontend chokes parsing. Add `app.use((err, req, res, next) => ...)` returning the new `{ success: false, error: { code, message } }` JSON shape, and standardize all routes on this shape.
2. **WebSocket session mid-connection re-check.** Implement periodic re-validation on the WS handler (every N seconds or on every K-th message) so an expired session disconnects with a user-visible "Session expired, please reload" toast instead of silently outliving the timeout.
3. **`yjsToJson()` safety wrap.** `api/src/collaboration/index.ts:118` has no try/catch around the JSON snapshot path; `JSON.stringify(undefined)` produces the string `"undefined"` which silently corrupts `content`. Wrap with validation; fall back to last-known-good content on failure.

Each fix requires reproduction steps, before/after behavior, screenshot or recording.

### Improvement 7: Accessibility — fix top axe violations on 3 critical pages (Category 7)

From Audit 7 results, pick the 3 most-visited pages. Fix all Critical and Serious axe violations on those three. Likely candidates given Ship's USWDS adoption are: missing aria-labels on icon-only buttons, contrast failures on disabled/secondary text, focus-trap issues in dialogs, missing form labels.

Target: 10+ Lighthouse point improvement on the lowest-scoring page, OR all Critical/Serious axe violations resolved on 3 most-important pages.

### Cross-cutting improvement: minimal CI workflow

Presearch risk #1 was "no CI gate." Add a single GitHub Actions workflow at `.github/workflows/test.yml` that runs `pnpm install`, `pnpm type-check`, and `pnpm test` on every pull request. This does not count as one of the 7 category improvements but is a low-cost foundational add that supports all of them.

---

## Phase 3: Polish & Submission (Sun 2026-05-24 10:59 PM CT)

### Documentation per improvement

For each of the 7 categories, produce a write-up at `orientation/improvements/<category>.md` covering: before measurement, root-cause explanation, description of fix, after measurement, reproduction proof. The audit report and these 7 write-ups together form the "Audit Report" + "Improvement Documentation" deliverables in the brief.

### Discovery write-up

At `orientation/discovery.md`, document 3 things learned from this codebase that the author didn't know before. For each: name the thing, codebase reference (file path + line range), what it does and why it matters, how it would apply in a future project. Strong candidates from the orientation pass: the Yjs CRDT + IndexedDB dual-persistence design, the unified document model with JSONB properties pattern, the USWDS + TipTap integration approach, the FPKI/CAIA federal auth integration with vendored SDK, the MCP-from-OpenAPI auto-generation.

### Demo video (3–5 minutes)

Walk through audit findings and improvements. Show before/after measurements for at least 4 of the 7 categories. Explain reasoning. Tools: QuickTime + ScreenFlow or similar. Upload to YouTube unlisted or Loom.

### AI cost analysis

At `orientation/ai-cost-analysis.md`, document Claude Code spend for the audit project: total tokens consumed, dollar cost, reflection on where AI was high-value (e.g., parallel agent exploration, audit-finding synthesis) vs. low-value. Estimate hours saved.

### Deploy improved fork

Deploy the improved branch to a publicly-accessible URL. Options: deploy to a personal AWS account, deploy to Vercel for the frontend + Railway/Render for the API, or use a Cloudflare Pages + Workers stack. The brief requires "Your improved fork running and publicly accessible."

### Social post

Single post on X or LinkedIn summarizing what was learned auditing a government codebase, key findings, tag @GauntletAI.

### Repository hygiene

- Each improvement on its own branch with descriptive commit messages.
- README in the fork explains the audit context, how to reproduce the measurements, how to run the improved app.
- All baseline files (`baseline-tsc.txt`, bundle stats, benchmark outputs) committed under `orientation/baselines/`.

---

## Constraints & Rules

- **No `git commit --no-verify`** ever. Pre-commit hooks (`comply opensource`, empty-test check) must pass.
- **No cosmetic-only changes** count toward category targets. Rename/reformat/comment edits don't qualify unless they directly support a measurable improvement.
- **Tests must still pass.** If a change breaks an existing test, either fix the test with documented justification or revert the change.
- **No mocked benchmarks.** Before/after numbers must be reproducible under identical conditions (same data volume, same concurrency, same hardware).
- **No skipping the audit gate.** Phase 1 is pass/fail; if any of the 7 baseline measurements is missing, the project fails regardless of Phase 2 quality.
- **Time budget respected.** Sunday 10:59 PM CT is fixed.

---

## Out of Scope

- New product features. This is an audit + improvement project, not a feature project.
- Architectural rewrites. Per the presearch and the deep-dives, the unified document model + Yjs + raw SQL choices are correct for Ship's scale; reworking them is out of scope.
- Migrations to a different framework (no LangChain adoption, no ORM introduction, no microservices split).
- Long-term roadmap items from the presearch's "Open Questions" section (e.g., establishing AI evaluation pipelines) — these are flagged for future work but not this project's deliverables.
- Refactoring the auth providers beyond what's necessary for category improvements.
- Anything in the WS collaboration server beyond the three specific fixes in Improvement 6.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Audit takes longer than 36 hours and Phase 1 gate fails | Parallelize the 7 audit categories — they're independent measurements. Use the `/e2e-test-runner` skill for E2E baselining. |
| Bundle-size improvement removes a feature inadvertently | Run the full E2E suite after the bundle change. |
| Type-safety mapper layer breaks existing routes | Convert one route at a time; run unit tests after each. |
| Slow-query indexes have unintended write impact | Use partial indexes filtered to `deleted_at IS NULL` to keep them small. |
| Deploy fails because no personal AWS account | Fall back to Vercel + Railway. Document the alternate deploy in the README. |
| Demo video runs over 5 minutes | Storyboard before recording. Cut the AI cost discussion to a single slide if needed. |

---

## Deliverables Checklist (mirrors brief)

- [ ] GitHub repo with improvements on labeled branches; README with setup guide.
- [ ] Audit report with baselines for all 7 categories.
- [ ] Improvement documentation for each of 7 categories (before, root cause, fix, after, reproducibility).
- [ ] Discovery write-up: 3 things learned with codebase references.
- [ ] Demo video (3–5 minutes).
- [ ] AI cost analysis.
- [ ] Deployed improved fork at a public URL.
- [ ] Social post on X or LinkedIn, tagged @GauntletAI.

---

## Appendix: Baseline file conventions

All numbers go under `orientation/baselines/`:

- `tsc-baseline.txt` — output of `pnpm type-check`
- `bundle-baseline.html` — visualizer treemap
- `bundle-baseline-stats.json` — sizes per chunk
- `api-baseline.json` — autocannon/k6 results per endpoint
- `db-baseline.txt` — query log + EXPLAIN ANALYZE output per flow
- `test-baseline.txt` — `pnpm test` and E2E summary
- `runtime-errors-baseline.md` — repro scripts + observations
- `a11y-baseline-lighthouse-<page>.json` — per-page Lighthouse reports
- `a11y-baseline-axe.json` — axe scan output

After Phase 2, each gets an `-after.*` companion file so before/after diffs are explicit.
