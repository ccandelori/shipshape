# ShipShape Audit Report — Phase 1

| Field | Value |
|---|---|
| Project | GFA Week 4 — ShipShape audit on `US-Department-of-the-Treasury/ship` |
| Auditor | Cameron Candelori |
| Audited commit | `master @ 076a18371` |
| Phase 1 gate | **MET on 2026-05-20** |
| Phase 2 deadline | Friday, 2026-05-22 11:59 PM CT |
| Final submission | Sunday, 2026-05-24 10:59 PM CT |
| Last updated | 2026-05-20 |

> **Paired deliverables.** The PDF brief includes an Appendix A ("Codebase Orientation Checklist") as a required part of the final submission: see `orientation/README.md` (855 lines, all 8 PDF sections complete).
> **Full prose + methodology details:** `orientation/audit-report-detailed.md`. This document is the executive summary. Every claim links back to either an evidence file or a section of the detailed report.

---

## Bottom line

Phase 1 gate is **MET**. All 7 PRD categories carry baseline evidence. **4 critical-tier findings are now backed by live reproduction** (silent data loss, security-exposure, performance, error-handling), and Phase 2 has one improvement scoped per PRD category.

---

## What works

- **Strict TypeScript** — `pnpm type-check` exit 0 across api/web/shared. Zero `@ts-ignore`. Junction tables correct, soft-delete consistent.
- **Yjs collab resilience** — disconnect → offline edits → reconnect converges live; no `"undefined"` placeholder.
- **Defense-in-depth XSS** — TipTap parser + CSP `script-src 'self' 'unsafe-inline'` block injection; live HTML/script injection test produced literal escaped text.
- **No flaky-by-design tests** — zero `test.only`, zero `describe.serial`; 13 `test.fixme()` clustered in known-gap areas.
- **Zod adoption on POST/PATCH bodies** — Express routes consistently `safeParse` and 400 with details.

---

## Critical findings — live-confirmed

Severity key: **Critical** = user-visible data loss / security exposure / outage risk. **High** = material performance, broken a11y, known-incident risk. **Medium** = quality / maintenance. **Low** = hygiene / prevention.

| # | Finding | What it means | Live evidence | Phase 2 fix |
|---|---|---|---|---|
| **C-1** | `yjsToJson()` silently NULLs `documents.content` on conversion failure (`api/src/utils/yjsConverter.ts:62-110` + `api/src/collaboration/index.ts:118,174`) | Yjs binary survives but REST reads return empty docs. **Silent data loss.** | `evidence/yjs-to-json-null.md` — defect-injection-then-revert: `content IS NULL = t`, `yjs_state` survives at 96 bytes. | Wrap conversion in try/catch; persist `yjs_state` only on failure; never silently null `content`. |
| **C-2** | WebSocket session validated only at HTTP upgrade (`api/src/collaboration/index.ts:347–393, 683–786`) | Destroyed sessions keep persisting edits via WS until browser close. **Security/data integrity.** | `evidence/ws-session-expiry.md` — `DELETE FROM sessions` → REST returns 401 but WS-typed phrase persisted to `documents.content`. | Periodic WS session re-validation tick (60s); close with code 4401 + frontend modal on expiry. |
| **C-3** | Accountability service N+1 loops — 6 awaited queries inside loops, `services/accountability.ts:175–437` | Dashboard load issues 30–80 SQL queries; production scale problem. **Performance.** | `evidence/queries-flow-1.log` — 26 queries on `/dashboard/my-week` + `/dashboard/my-work` flow; static-confirmed loop shape. | Batch into 3-4 set-based queries (`id = ANY($1)`). |
| **C-4** | No global Express error handler (`api/src/app.ts:90–245`) | Uncaught throws return HTML 500; frontend `fetch().json()` throws `SyntaxError`. **Error-handling gap.** | `evidence/csrf-html-response.txt` + `api-500-html-response.txt` — live curl shows HTML 403/400/500 bodies. | Mount `app.use((err, req, res, next) => …)` returning `{error: {code, message}}` JSON; standardize all routes. |

---

## High findings — structurally confirmed

| # | Finding | Severity | Phase 2 |
|---|---|---|---|
| H-1 | JSONB hot-path predicates have no expression indexes (`state`, `assignee_id`, `sprint_number`, `owner_id`); only `properties->>'user_id'` on person docs has one. Sequential-scan risk past ~10k docs. | High | Migration `038_jsonb_hot_path_indexes.sql` |
| H-2 | 2,074 KB / 588 KB gzipped main chunk; 99% of JS weight in one file. No route-level lazy loading; `ReactQueryDevtools` ships to prod; `lowlight common` loads ~37 grammars eagerly. | High | Route lazy-loading + dev-only devtools + targeted lowlight registration |
| H-3 | Web `tsconfig.json` is a standalone config that drops `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch` from root. Entire web package one flag away from catching real bugs. | High | Extend root tsconfig; one-line fix |
| H-4 | Production `req.query.x as string` everywhere in routes — silently widens `string \| string[] \| undefined`. Real input-validation gap. | High | `requireQueryString` validator + Zod schemas for query params |
| H-5 | 3 custom modals declare `aria-modal` but no focus trap and no `aria-labelledby` (`ConversionDialog`, `MergeProgramDialog`, `BacklogPickerModal`). Federal AT users hit a keyboard trap. | High | Replace with Radix `Dialog.Root` (already used elsewhere) |
| H-6 | `<div onClick>` cells in `AccountabilityGrid` (`AccountabilityGrid.tsx:320, 406`) — keyboard users cannot enter the accountability detail. WCAG 2.1.1 fail. | High | Add `role="button"` + `tabIndex` + `onKeyDown` |
| H-7 | `UPDATE sessions SET last_activity = NOW()` on every authenticated request — WAL fsync per-request under load. Cookie refresh is throttled to 60s; DB write should match. | High | Match DB write throttle to cookie throttle |
| H-8 | Tailwind opacity modifiers destroy design-token contrast (`text-muted/50` → 2.26:1; `bg-accent/20` → 2.55:1). Affects every page using these for "current" / "selected" states. | High | Single token swap: `text-muted-soft` + `bg-accent-soft` pre-blended at 4.5:1 |

---

## Per-category baselines

Detailed methodology and evidence-table rows live in `audit-report-detailed.md`. Per category: TL;DR, the headline number, the top findings, and where to verify.

### 1. Type Safety

**TL;DR.** Strict-mode clean (0 compile errors). Violations concentrated in test fixtures and `Document.properties` casts. Web tsconfig is one flag away from catching dozens of bugs at compile time.

**Headline:** **747 violations total** (`pnpm type-check` exit 0). Production vs. test split: **~498 production / ~249 test** — pg-mock `as any` cluster in `api/src/services/accountability.test.ts` + 3 sibling test files accounts for ~160 of the test-side violations.

**Top findings**

1. `web/tsconfig.json` drops three safety flags — **High**.
2. Test files saturated with `as any` over pg mocks — one typed helper collapses ~160 — **Medium (test-only)**.
3. Production `req.query.x as string` everywhere — input-validation gap — **High**.
4. `Document.properties as <T>` casts mirror unified-doc untyping — pure refactor — **Medium**.

**Evidence:** `orientation/baselines/type-safety/tsc-output.txt`, `counts.txt`, `raw/type-safety/`. **Scope caveat:** `e2e/` (76 specs) is not in `pnpm-workspace.yaml` and is silently un-type-checked.

**Phase 2 plan:** **−25%** (≤560). Extend root tsconfig + typed `mockPgQuery<T>` helper + `requireQueryString` validator. Two of those three are mechanical; net effect on production code is real because the tsconfig change cascades.

### 2. Bundle Size

**TL;DR.** Eager-loaded 2 MB monolith. Four high-leverage fixes (lazy-load admin/setup routes, gate `ReactQueryDevtools` to dev, swap `lowlight common` for a targeted language list, lazy-load `EmojiPicker`) compound to clear the brief's 20% initial-load target.

**Headline:** **2,074 KB / 588 KB gzipped main chunk** (99% of JS weight in one file). Total `dist/` 4.5 MB / 261 JS chunks. Vite warns at build time.

**Top findings**

1. No route-level code splitting — `main.tsx` statically imports ~25 page components incl. `Admin*`, `Setup`, `OrgChart` — **High**.
2. `lowlight` `common` loads ~37 syntax grammars at startup — **High**.
3. `ReactQueryDevtools` ships to production — **High** (free win).
4. `emoji-picker-react` (72 KB gzip) eagerly loaded — **Medium**.
5. `@dnd-kit/*` (~2 MB unpacked) eager for everyone, used in 2 files — **Medium**.

**Evidence:** `orientation/baselines/bundle/bundle-baseline.html` (interactive treemap) + `build.txt` + `per-package.txt`. Regenerable from clean checkout via `bash orientation/baselines/bundle/regenerate.sh` (uses `BUNDLE_ANALYZE=1` hook in `web/vite.config.ts`).

**Phase 2 plan:** **−20% initial load**. Compounded approach (route lazy + dev-only devtools + targeted lowlight + lazy emoji) — projected 20%+ off the eager chunk; no removed features.

### 3. API Response Time

**TL;DR.** All 5 hot endpoints clean. `/api/issues` slowest at 58 ms p97.5 at c=50. The dominant cross-cutting cost is `sessions.last_activity` writing on every request.

**Headline:** **850,757 total requests / all 2xx / 0 errors** across 5 endpoints × c=10/25/50 × 30s (autocannon). Slowest endpoint: `/api/issues` at **47 ms P95 / 51 ms P99** under c=50 (PRD-literal P95 captured via k6 on the slowest 2 endpoints; full table below).

**PRD-literal P95 (k6, slowest 2 endpoints):**

| Endpoint | c=10 P50 / P95 / P99 | c=25 P50 / P95 / P99 | c=50 P50 / P95 / P99 |
|---|---|---|---|
| `/api/issues` | 8.3 / **11.6** / 13.4 ms | 19.6 / **24.7** / 26.7 ms | 39.4 / **46.6** / 51.1 ms |
| `/api/documents?type=wiki` | 9.8 / **13.5** / 15.6 ms | 22.9 / **28.3** / 30.8 ms | 45.4 / **53.0** / 56.4 ms |

The remaining 3 endpoints (`/api/auth/me`, `/api/projects`, `/api/weeks`) carry autocannon p97.5 only — p97.5 is a strict upper bound on P95, and they're all faster than the slowest two by a wide margin, so the P95-not-P97.5 distinction doesn't change the ranking.

**Top findings**

1. `/api/issues` slowest — JSONB joins, CASE-priority sort over 104 rows — **High**.
2. `/api/documents?type=wiki` second — unpaginated 241-row list — **High**.
3. `sessions.last_activity` write on every authenticated request — match cookie throttle — **High**.
4. Correlated subqueries in `/api/projects`, `/api/weeks` — scale risk past ~50 projects — **Medium/High**.
5. CSRF rejection returns HTML — confirms Cat 6 finding C-4 at the auth boundary — **Medium**.

**Evidence:** `orientation/baselines/api-response-time/api-<slug>-c{10,25,50}.json` (15 files) + consolidated `api-baseline.json` + `benchmark-script.sh`.

**Metric honesty.** `autocannon` does **not** emit P95 — `p97.5` is the measured value (and a strict upper bound on P95). Phase 2 P95 claims must come from a tool that emits P95 natively (k6, wrk2) or histogram-derived P95.

**Reproducibility scaffold.** `api/src/app.ts` has a guarded `skip: (req) => isTestEnv && req.headers['x-bench'] === '1'` on `apiLimiter`. Unreachable in dev or production. Same precedent as Cat 2's `BUNDLE_ANALYZE=1` hook. Reviewers reproduce: `E2E_TEST=1 pnpm dev:api` + `bash orientation/baselines/api-response-time/benchmark-script.sh` (script aborts early via burst-probe sanity check if the skip isn't active).

**Phase 2 plan:** **−20% P95 on ≥2 endpoints**. Throttle `sessions.last_activity` write; target `/api/issues` JSONB indexes (compounds with Cat 4).

### 4. Database Query Efficiency

**TL;DR.** Exact per-flow query counts captured via `pg_stat_statements`. JSONB hot-path predicates run through GIN index instead of expression indexes; accountability service is the largest N+1 surface.

**Headline:** Exact per-flow counts: **26 / 7 / 5 / 21 / 5** across the 5 PRD user flows. 5 EXPLAIN ANALYZE plans captured (one per flow's slowest query). Of the JSONB property expressions in route SQL, **only 1 hot path has a dedicated expression index** (person→user_id).

**PDF-format deliverable table:**

| User Flow | Total Queries | Slowest Query (ms) | N+1 Detected? |
|---|---:|---:|---|
| Load main page | 26 | 0.28 | **Yes** — accountability service N+1 (`services/accountability.ts:175–437`) |
| View a document | 7 | 0.11 | No (sequential dependent queries; not a loop) |
| List issues | 5 | 0.26 | No (single query, but post-filter scan: 92 of 104 rows filtered after index scan) |
| Sprint/team board | 21 | 0.26 | **Yes** — per-row conflict-sprint UPDATE loop in `team.ts:561–577`; Seq Scan on `document_associations` |
| Search content | 5 | 0.19 | No (single query, but Seq Scan: 491 of 500 rows filtered) |

Slowest-query ms values are localhost warm-cache execution times (all `Buffers: shared hit`); production cold-cache will be materially slower. The shapes (Seq Scan, post-filter row counts, Memoize 0/139) are the load-bearing findings.

**Top findings**

1. Dashboard active-issues query scans all 104 issues then filters 92 by JSONB `state`/`assignee_id` — **High**.
2. Search `title ILIKE '%test%'` confirmed Seq Scan; 491 of 500 docs filtered — **High**.
3. Accountability inference N+1 (services/accountability.ts:175–437) — **Critical** (see C-3).
4. `/api/projects` Memoize cache: 0 hits / 139 misses on correlated subquery — **Medium/High**.
5. Per-row association INSERTs in `documents.ts`, `issues.ts`, `team.ts` — fold into single multi-row INSERTs — **Medium/High**.

**Evidence:** `orientation/baselines/db-baseline.txt` + `queries-flow-{1..5}.log` + `explain-flow-{1..5}.txt`.

**Methodology caveats** *(read with the numbers):* localhost warm-cache (all `Buffers: shared hit`), seed at PRD floor (500 docs / 104 issues / 20 users / 35 sprints), planning time ≈ exec time at this scale. *Relative* rankings are robust; *absolute* ms are localhost floors.

**Phase 2 plan:** **≥50% improvement on the slowest query.** Migration `038_jsonb_hot_path_indexes.sql` adds expression indexes on `state`, `assignee_id`, `sprint_number`, `owner_id`. Re-EXPLAIN before/after on the dashboard active-issues query.

### 5. Test Coverage & Quality

**TL;DR.** API coverage measured cleanly. Web suite found broken on the audited commit (13/146 failing across 4 files — three distinct diagnoses, two files never passed) and is the load-bearing Cat 5 baseline. E2E 0 hard failures across 3 runs, 1 consistent flake.

**Headline:** **API: 40.34% lines / 33.44% branches, 451/451 pass** (~3 min). **Web baseline = broken-as-found** on commit `076a18371` (13/146 fail, vitest stopped the coverage reporter, % not emitted). **E2E: 869 tests / 864–866 passed / 0 hard fail × 3 runs.**

**Top findings**

1. Web suite broken on `076a18371` — root-causes documented per file, each verified against `git log`. Repair is a Phase 2 deliverable; baseline preserves the as-found state. — **High** (meta: web tests live but `pnpm test` only runs `@ship/api`).
2. Three presearch-identified critical paths have zero coverage: WS session timeout, soft-FK assignee-after-archive, `yjsToJson()` drift — **High**.
3. API coverage bimodal: hot routes 60–100%, cold routes <10% (`dashboard.ts` 1.98%, `caia-auth.ts` 3.9%, `weekly-plans.ts` 4.8%) — **High** for cold routes.
4. 13 `test.fixme()` stubs cluster in keyboard-shortcuts/conversion/issue-page-mgmt — bit-rot signal — **Medium**.
5. 20 `.hover()` sites — likely live-run flake source — **Medium**.

**Evidence:** `orientation/baselines/test-coverage/api-coverage.txt`, `web-coverage.txt`, `e2e-runs/run{1,2,3}-output.log`. Live consistent flake: `program-mode-week-ux.spec.ts:369` (2 of 3 runs).

**Audit-trail.** Four web test files (`DetailsExtension.test.ts`, `useSessionTimeout.test.ts`, `document-tabs.test.ts`, `drag-handle.test.ts`) were edited mid-audit to diagnose failures; edits reverted on master 2026-05-20 to preserve baseline purity. The pre-revert observation is the load-bearing Phase 1 baseline.

**Phase 2 plan:** Three critical-path tests (WS session expiry, assignee-orphan, yjsToJson drift), each with `// Mitigates:` comment. Plus root `pnpm test:coverage` script that runs `@ship/web` too — closes the "tests live but aren't discovered" meta-finding.

### 6. Runtime Error & Edge Case Handling

**TL;DR.** All 12 numbered scenarios in the verification table have direct live evidence (Playwright + psql + curl). Three critical bugs **live-confirmed**: yjsToJson silent NULL, WS session expiry persists edits, two-tab title race last-write-wins.

**Headline:** **1 console.error / 0 warnings / 0 page errors** across 11 walked routes (`normal-usage.mjs` Playwright walker; the 1 error is a structurally expected 401 on `/api/auth/me` at `/login`). **3 critical bugs live-confirmed** during the critical-review re-audit on 2026-05-20.

**PDF-format deliverable table:**

| Metric | Baseline |
|---|---|
| Console errors during normal usage | **1** (expected 401 at `/login`, no other errors across 11 routes) |
| Unhandled promise rejections (server) | **0 observed during live runs.** Theoretical risk surface: **~30 handlers across 5 sampled route files lack outer try/catch** (weeks.ts 26/50 missing, dashboard.ts 3/6 missing, comments.ts 1/8 missing) — Express 4 propagates these as uncaught rejections to a global handler that doesn't exist (Cat 6 finding C-4). |
| Network disconnect recovery | **Pass** — Yjs offline edits converged after reconnect; all three typed phrases present in the final body (live Playwright run) |
| Missing error boundaries | **6+** top-level routes outside any React error boundary: `/login`, `/setup`, `/admin`, `/admin/workspaces/:id`, `/invite/:token`, `/feedback/:programId` |
| Silent failures identified | **3** with live evidence — yjsToJson NULL persist (C-1), WS session expiry persists writes (C-2), 10 KB title silent autosave 400 (Scenario 6); plus the prod-error HTML response shape (C-4) |

**Top findings (live-confirmed)** *(see Critical-findings table for full detail)*

1. `yjsToJson()` silent NULL — see **C-1**.
2. WS session validated only at upgrade — see **C-2**.
3. Two-tab title race: last-write-wins, no UI signal to losing tab — **Medium** (data-loss-on-reload UX is a Phase 2 candidate).
4. No global Express error handler — see **C-4**.
5. 10 KB title → autosave fires silent 400s while the user types; displayed-vs-persisted title diverges until reload — **Medium**.
6. Slow-3G page load: blank editor at 3s/10s, no skeleton scoped to the document editor — **Medium**.
7. Single React error boundary inside AppLayout; Login/Setup/Admin/Invite unguarded — **High** for entry points.

**Evidence:** `orientation/baselines/runtime-errors/evidence/RUNBOOK.md` — index of all 12 scenarios with verdicts and screenshot/transcript cites. Driver: `scenarios.mjs` (~120s for 9 Playwright scenarios).

**Audit-trail.** Scenarios 1, 3b, and 2 were captured during a critical-review pass on 2026-05-20 (Pass 3) — scenario 2 used a documented defect-injection-then-revert protocol because `yjsToJson` never returns undefined under normal operation. Injection reverted via `git restore`; no master diff remains.

**Phase 2 plan:** Three error fixes (one is real data loss): (1) wrap `yjsToJson` in try/catch — persist `yjs_state` only on conversion failure; (2) mount global Express error handler — `{error: {code, message}}` JSON; (3) periodic WS session re-validation tick.

### 7. Accessibility

**TL;DR.** Lighthouse + axe + keyboard + **real VoiceOver** on PRD-required routes. Lighthouse passes on most routes (lowest 0.96); axe deep-scan surfaces 4 rule families Lighthouse misses; VoiceOver transcript shows real macOS speech output on `/dashboard`, `/my-week`, and the wiki editor.

**Headline:** **Lighthouse: 7 of 10 routes 1.00; lowest 0.96** (`/my-week`, `/documents/<issue>` — both color-contrast). **axe deep-scan: 4 critical + 5 serious across 8 authenticated routes** (workspace tree, TipTap drag-handle, listitem semantics, `/settings` role `<select>` lacks label, color-contrast). **Keyboard navigation: Partial** (see PDF table below).

**PDF-format deliverable table:**

| Metric | Baseline |
|---|---|
| Lighthouse accessibility score (per page) | 7 of 10 routes 1.00; `/login` 0.98; `/my-week` 0.96; `/documents/<issue>` 0.96 |
| Total Critical/Serious violations (axe) | **9** (4 Critical + 5 Serious) across 8 authenticated routes |
| Keyboard navigation completeness | **Partial** — login + create-doc work for happy path, but: (a) editor body is unreachable via Tab from the title; (b) delete-document Radix dialog focus-trap fails (Tab escapes); (c) AccountabilityGrid `<div onClick>` cells unreachable (no `role="button"` / `tabIndex`); (d) login Tab cycle loses focus to BODY twice |
| Color contrast failures | **9 nodes** on `/my-week` + 3 on issue editor (Tailwind opacity modifiers root cause: `text-muted/50` → 2.26:1, `bg-accent/20` → 2.55:1) |
| Missing ARIA labels or roles | 3 custom modals (no `aria-labelledby`, no focus trap); ~10 placeholder-only inputs; `/settings` role `<select>` (Admin/Member) no label; workspace switcher single-letter button uses `title=` not `aria-label`; CommentDisplay reply inputs no label |

**Top findings**

1. Three custom modals declare `aria-modal` without focus trap or `aria-labelledby` — federal AT keyboard trap — **High** (see H-5).
2. `<div onClick>` cells in `AccountabilityGrid` keyboard-inaccessible — WCAG 2.1.1 fail — **High** (see H-6).
3. Tailwind opacity modifiers destroy design-token contrast — **High** (see H-8).
4. `/settings` role `<select>` (Admin/Member) has no label / no `aria-label` — **Critical** for federal user-management screens.
5. `CommentDisplay` injects `<input>` via innerHTML with no label — **High** for the comment-thread vector.
6. Search/filter inputs use placeholder-only labeling across ~10 sites — **High**.
7. Login page has no `<main>` landmark — **Low** (one-attribute fix).

**Evidence:** `orientation/baselines/accessibility/` — `lighthouse-{login,my-week,docs,issues,projects,team_allocation,settings,editor-{wiki,issue,project}}.json` (10 routes); `axe-{login,docs,my-week,issues,projects,settings,team-allocation,editor-wiki}.json` + `axe-summary.md`; `keyboard-{login,create-doc,edit-modal}.md` (3 flows); `voiceover-results-2026-05-20.md` (canonical, covers `/dashboard` + `/my-week` + wiki editor).

**Phase 2 plan:** Fix all Critical/Serious axe violations on `/docs`, `/my-week`, `/projects`, `/settings`, and the wiki editor (8 violations). Lighthouse: +10 on the lowest page (`/my-week` 0.96 → 1.00). Single-token Tailwind contrast fix unblocks ~9 sites.

---

## Phase 2 plan summary

| # | Category | Baseline | Target | Approach | Confidence |
|---|---|---|---|---|---|
| 1 | Type Safety | 747 violations (~498 prod / ~249 test) | −25% (≤560) | tsconfig extend + pg-mock helper + `requireQueryString` | High |
| 2 | Bundle Size | 588 KB gzip main chunk | −20% initial load | Route lazy + dev-only devtools + targeted lowlight + lazy emoji | High |
| 3 | API Response Time | 58 ms p97.5 on `/api/issues` at c=50 | −20% p97.5 on ≥2 endpoints; report P95 via k6/wrk2 | Throttle `sessions.last_activity`; JSONB indexes (compounds w/ Cat 4) | Medium-High |
| 4 | DB Query Efficiency | Dashboard scans 104 issues, filters 92 | ≥50% on slowest query | Migration `038_jsonb_hot_path_indexes.sql` | High |
| 5 | Test Coverage | API 40.34% / web broken-as-found | 3 critical-path tests + root `pnpm test:coverage` | New unit + E2E tests + script wiring | High |
| 6 | Runtime Errors | 3 silent-data-loss / security paths live-confirmed | Fix all 3 (≥1 = data loss) | yjsToJson try/catch + global error handler + WS session re-tick | High |
| 7 | Accessibility | 8 Critical+Serious axe violations across 5 routes | Fix all 8 + Lighthouse +10 on lowest page | Radix Dialog swap + form labels + Tailwind contrast tokens + keyboard handlers | High |

**Cross-cutting (not a category):** minimal CI workflow at `.github/workflows/test.yml` running `pnpm install`, `pnpm type-check`, `pnpm test` on PR. Closes presearch risk #1 ("no CI gate").

---

## Sign-off

| Category | Status | Headline |
|---|---|---|
| 1. Type Safety | ✅ Measured | 747 violations (~498 prod / ~249 test); `pnpm type-check` exit 0; web tsconfig drops 3 safety flags |
| 2. Bundle Size | ✅ Measured | 2,074 KB / 588 KB gzip main chunk; treemap regenerable via committed script |
| 3. API Response Time | ✅ Measured | 850,757 req / 0 errors; `/api/issues` 58 ms p97.5 at c=50; rate-limit scaffold guarded + documented |
| 4. DB Query Efficiency | ✅ Measured | Exact per-flow counts via `pg_stat_statements`; 5 EXPLAIN ANALYZE plans; JSONB index gaps identified |
| 5. Test Coverage | ✅ Measured | API 40.34% / 33.44%; web baseline = broken-as-found (root-causes documented); E2E 0 hard failures × 3 runs |
| 6. Runtime Errors | ✅ Measured | All 12 scenarios captured live (Playwright + psql + curl); 3 critical bugs live-confirmed in re-audit |
| 7. Accessibility | ✅ Measured | Lighthouse on 10 routes + axe on 8 routes + keyboard on 3 flows + real VoiceOver on `/dashboard` + `/my-week` + wiki editor |

**Phase 1 gate: MET** — all 7 categories cite a measurement with an evidence path. PRD-literal compliance: VoiceOver on `/dashboard` (not just `/my-week`) closes the one prior PRD-literal substitution gap.

**Deferred to Phase 2** (not gate-blocking):

| Category | Deferred item | Why |
|---|---|---|
| 3 API | Production P95 measurements | No prod access from this audit thread; localhost is the floor |
| 4 DB | Re-EXPLAIN at production-scale volume | Current seed meets the PRD floor (500 docs); not production scale |
| 3 API | Histogram-derived P95 (instead of p97.5) | Switch to k6/wrk2 in Phase 2 |

---

## Audit timeline

| Date | Work |
|---|---|
| 2026-05-18 | Baselines: type-safety, bundle, API response time |
| 2026-05-19 | Baselines: DB queries, test coverage, runtime errors (passes 1+2), accessibility (Lighthouse + axe + keyboard) |
| 2026-05-20 (AM) | Cat 5 test edits reverted to preserve baseline; orientation evidence docs tracked; bundle visualizer reproducibility hook; real VoiceOver transcript added |
| 2026-05-20 (PM) | Critical-review re-audit: Cat 3 X-Bench rate-limit skip moved to master (guarded); p97.5 metric honesty pass; Cat 5 session-expiry matrix split; 3 new live runs (WS session expiry, two-tab title race, yjsToJson NULL) close evidence gaps; VoiceOver `/dashboard` closes PRD-literal gap; Cat 1 production-vs-test split |

---

## Methodology pointers

**Live verification** of Cat 6 ran in three passes (full table in detailed report): Pass 1 curl + grep walks; Pass 2 Playwright `scenarios.mjs` for scenarios 3, 4, 6, 7, 9, 10; Pass 3 (2026-05-20 critical-review) Playwright for scenarios 1, 3b, 2 — the last via documented defect-injection-then-revert protocol because the path is structurally preventive, not currently triggerable on unmodified master.

**Live verification** of Cat 7 used Lighthouse 13.3.0 (10 routes), `@axe-core/playwright` (8 authenticated routes), Playwright keyboard walkthroughs (3 flows), and `@guidepup/guidepup` driving real macOS VoiceOver against `/dashboard`, `/my-week`, and the wiki editor — the transcript is the actual `voiceOver.spokenPhraseLog()`, not a proxy.

**Methodology caveats** (the load-bearing ones):

- All ms numbers are localhost floors. *Relative* rankings are robust; *absolute* numbers are not production-comparable.
- `autocannon` doesn't emit P95 natively; p97.5 reported as a strict upper bound on P95.
- `pg_stat_statements` snapshots are exact; the earlier docker-log walk produced lower bounds (preserved as evidence-of-process).
- The 4 web test files edited mid-audit are reverted on master; the broken-as-found state is the load-bearing Cat 5 baseline.
- Cat 3 X-Bench rate-limit skip is guarded by `isTestEnv` (NODE_ENV=test or E2E_TEST=1); unreachable in dev or production.

---

## Severity key

- **Critical** — user-visible data loss, security exposure, or production outage risk
- **High** — material performance degradation, broken accessibility, or known-incident risk
- **Medium** — quality degradation or maintenance burden
- **Low** — code-hygiene / future-prevention finding

---

*Full prose, methodology details, raw measurement files, and per-category live-verification tables: see `orientation/audit-report-detailed.md`.*
