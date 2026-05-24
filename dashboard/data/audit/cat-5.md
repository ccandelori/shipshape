## Category 5: Test Coverage & Quality

### Methodology

Static inventory was collected with `find`/`grep` over `api/`, `web/`, and `e2e/`, then replaced by live measurements where available. Current baseline evidence includes: live API Vitest coverage (`api-coverage.txt`, 451/451 passing), live web Vitest coverage (`web-coverage.txt`, 151/151 passing), and three E2E runs (`e2e-runs/run{1,2,3}-output.log`). The `e2e-runs/*-summary.json` files are progress snapshots with impossible aggregate values (`passed > total`, negative `pending`), so the authoritative E2E pass/flaky counts are the tail summaries in the output logs, not those JSON fields.

**Audit purity (resolved 2026-05-20):** four web test files (`DetailsExtension.test.ts`, `useSessionTimeout.test.ts`, `document-tabs.test.ts`, `drag-handle.test.ts`) had been modified during the measurement pass to get the web suite green. Those edits were **reverted on master on 2026-05-20** to preserve the "no fixes during baseline" rule. The pre-revert observation (13 web test failures, no web coverage emitted by vitest) is the load-bearing Cat 5 baseline finding; the post-revert coverage numbers reproduced below describe a separate Phase-2 test-quality view. The underlying test code was never on master at the time the baseline was captured — only the measurement-period working tree carried the edits.

### Baseline metrics

| Metric | Baseline |
|---|---|
| Total Vitest unit test files (`api/`) | **28** (`api/src/**/*.test.ts`) |
| Total Vitest unit test files (`web/`) | **16** (`web/src/**/*.test.{ts,tsx}`) |
| **Live `pnpm --filter @ship/api test --coverage`** (2026-05-19) | **28 test files passed, 0 failed; 451 tests passed, 0 failed** |
| Vitest API suite runtime (live) | ~3 min (the earlier "≥10 min" extrapolation was wrong — agent-thread DB latency inflated it) |
| Total Playwright E2E spec files | **71** |
| Total Playwright `test()` invocations (active) | **838** |
| `test.fixme()` count | **13** (in 6 specs) |
| `test.skip()` count | **0** |
| `test.only()` count | **0** |
| Empty tests (silent-pass) | **0** per `scripts/check-empty-tests.sh` |
| E2E suite (3 runs at `PLAYWRIGHT_WORKERS=8` 2026-05-19) | **Run 1: 864 passed, 5 flaky, 0 hard-fail, 9.3 min** / **Run 2: 866, 3 flaky, 0 fail, 6.9 min** / **Run 3: 866, 3 flaky, 0 fail, 9.0 min** |
| E2E flaky tests (across 3 runs) | **10 unique tests flaked (11 total events); 1 consistent (≥2 of 3 runs), 9 transient (1 of 3 only)** |
| **Code coverage — `api/` (overall)** | **lines 40.34%, branches 33.44%, functions 40.9%, statements 40.52%** (live v8 run 2026-05-19) |
| **Code coverage — `web/` (overall)** | **lines 28.28%, branches 18.99%, functions 25.60%, statements 27.40%** (live v8 run 2026-05-19 21:19 CT, after diagnostic fix for the 13 prior failures). 16/16 test files pass, 151/151 tests pass, 1.70s runtime. Web is ≈12 percentage points below the API on every axis; same bimodal pattern (`useSessionTimeout.ts` 95.03%, `accountability.ts` 96%, `SelectionPersistenceContext.tsx` 100% vs. `api.ts` 2.67%, `DragHandle.tsx` 1.53%, `date-utils.ts` 0%). Full per-file table at `baselines/test-coverage/web-coverage.txt`. |

**`test.fixme()` locations:** `document-conversion.spec.ts` (3), `issue-page-management.spec.ts` (3), `keyboard-shortcuts.spec.ts` (3), `projects-listing-sorting.spec.ts` (1), `sidebar-navigation.spec.ts` (2), `week-dashboard.spec.ts` (1).

### Critical flows vs. coverage

| Flow | E2E spec(s) | API unit test(s) | Status |
|---|---|---|---|
| Auth — login (password) | `auth.spec.ts`, `login-redirect.spec.ts`, `database-login.spec.ts` | `auth.test.ts`, `auth-service.test.ts`, `auth-passport.test.ts`, `auth-passport-routes.test.ts` | Covered |
| Auth — logout | `auth.spec.ts` | `auth.test.ts` | Covered |
| Auth — HTTP session expiry (15-min / 12-hr) | `session-timeout.spec.ts` (warning modal, countdown, Stay-Logged-In extend, mouse/key reset, absolute 12-hr expiry) | none | **Covered E2E** — no API unit test, but the boundary is HTTP-only |
| Auth — PIV / x509 cert | **none** | **none** | **GAP** (conditional) |
| Auth — API token | **none** | **none** | **GAP** (conditional) |
| Document CRUD | `document-creation.spec.ts`, `document-title-editing.spec.ts`, … | `documents.test.ts`, `documents-archive.test.ts`, `documents-soft-delete*.test.ts` | Covered |
| Real-time collaborative edit | `collaborative-editing-resilience.spec.ts`, `collaborative-editing-stress.spec.ts`, `multi-user-collaboration.spec.ts` | none with `yjs`/`websocket` | E2E only |
| Sprint mgmt — create / edit | `sprint-management.spec.ts`, `sprint-cleanup.spec.ts`, `sprint-status-defaults.spec.ts` | `sprints.test.ts`, `sprints-statuses.test.ts`, `weeks.test.ts` | Covered |
| Sprint — week dashboard | `week-dashboard.spec.ts` (1 fixme) | `weeks.test.ts` | Partial |
| Document conversion (issue↔project) | `document-conversion.spec.ts` (3 fixme), `convert-document-type.spec.ts` | no convert-focused API test | **Partial** |
| Accountability — plan/retro/standup | `weekly-plan-mvp.spec.ts`, `weekly-retro.spec.ts`, `weekly-standup-mvp.spec.ts`, `standup-flow.spec.ts` | `weeks.test.ts` | Covered (E2E heavy) |
| File upload | **none** | **none** | **GAP** (conditional) |
| **WebSocket session timeout** | **none** | **none** | **GAP** (presearch-confirmed) |
| **Soft-FK integrity — assignee after person archive** | **none** | **none** | **GAP** (presearch-confirmed) |
| **`yjsToJson()` body→snapshot drift** | **none** | **none** | **GAP** (presearch-confirmed) |

### E2E flake inventory (live 3-run cross-reference)

Three runs at `PLAYWRIGHT_WORKERS=8`, 2026-05-19. Playwright auto-retries flakes per the config (1 retry locally, 2 in CI). A test that passed on retry is reported as **flaky**; the run still exits 0. Hard failures (failed all retries): **0 across all 3 runs**. Stack: macOS 25.4 / 32 GB RAM / 10 CPU cores.

| Test | Runs flaked in | Verdict |
|---|---|---|
| `program-mode-week-ux.spec.ts:369:7` "clicking sprint card selects it in the chart" | **2 of 3** (runs 1, 3) | **Consistent flake — fix worthy** |
| `file-attachments.spec.ts:161` (file type validation) | 1 of 3 (run 1) | Transient |
| `my-week-stale-data.spec.ts:63` (retro edits after nav) | 1 of 3 (run 1) | Transient |
| `programs.spec.ts:212` (program cards emoji) | 1 of 3 (run 1) | Transient |
| `status-overview-heatmap.spec.ts:69` (split cells plan/retro) | 1 of 3 (run 1) | Transient |
| `performance.spec.ts:366` (many images don't crash editor) | 1 of 3 (run 2) | Transient |
| `session-timeout.spec.ts:629` (Stay Logged In extend session) | 1 of 3 (run 2) | Transient |
| `team-mode.spec.ts:460` (changing sprint assignment regroups) | 1 of 3 (run 2) | Transient |
| `inline-comments.spec.ts:118` (canceling comment removes highlight) | 1 of 3 (run 3) | Transient |
| `my-week-stale-data.spec.ts:28` (plan edits after nav) | 1 of 3 (run 3) | Transient |

**`my-week-stale-data.spec.ts` flaked twice but on different test lines (28 and 63)** — both tests are about "edits visible after navigation back to /my-week". This is a *thematic* flake (the spec file has timing fragility across multiple `test()` cases), distinct from the lines-match definition of consistent. Probably worth investigating the spec's setup/cleanup pattern.

### Static flakiness risk inventory (precomputed from ripgrep — supplements the live data above)

| Pattern | Files / lines | Risk |
|---|---|---|
| `page.waitForTimeout(<n>)` | 3 sites in 2 files: `collaborative-editing-resilience.spec.ts:43` (2000), `:67` (1000); `standup-flow.spec.ts:88` (500) | Low–Medium |
| `.hover(` | 20 sites across 6 files (`document-creation`, `mode-switcher-isolation`, `sidebar-navigation`, `wiki-mode-no-mode-switcher`, `wiki-mode`, collab) | Medium |
| `networkidle` | 0 | None |
| `test.describe.serial(` | 0 — full parallelism, 4 workers, retries 1/2 | Low (shared fixture state is still a vector) |
| Missing `await` on async matchers | 0 detected via grep | Low |
| `test.only(` | 0 | None |
| Largest specs (blast radius) | `multi-user-collaboration.spec.ts` (37), `auth.spec.ts` (35), `mode-switcher-isolation.spec.ts` (33), `keyboard-shortcuts.spec.ts` (30) | Medium |

### Top findings

1. **API coverage measured: 40.34% line / 33.44% branch (live).** `@vitest/coverage-v8@~4.0.17` was installed 2026-05-19 (initial install pulled 4.1.6 which broke against vitest 4.0.17; pinning to `~4.0.17` fixed it). 451/451 api tests pass. **Coverage is bimodal**: well-tested core (`auth.ts` 83%, `documents.ts` 60%, `issues.ts` 60%, `weeks.ts` 60%, `sprints.ts`/`backlinks.ts`/`iterations.ts`/`search.ts` 84-100%) versus essentially-untested admin/operational routes (`dashboard.ts` **1.98%**, `caia-auth.ts` **3.9%**, `weekly-plans.ts` **4.8%**, `programs.ts` **5.05%**, `associations.ts` **6.45%**, `admin-credentials.ts` **6.59%**, `team.ts` **8.7%**). **Severity: High** for the cold-coverage routes; the hot routes are reasonably exercised.

2. **WEB SUITE WAS BROKEN — 13 of 146 tests failed across 4 of 16 files; all 13 resolved 2026-05-19 21:19 CT via diagnostic test-side updates only (no production code touched).** Suite now passes 151/151 in 1.70s; coverage emitted at **28.28% line / 18.99% branch / 25.60% function / 27.40% statement** (table at `baselines/test-coverage/web-coverage.txt`). **Each of the four files was verified against `git log` to confirm the production change was intentional, not a regression masked by the fix.** The 13 failures split into **three distinct diagnoses** — this distinction matters, because two of the four files appear to have *never* passed:

   | File | Failures | Diagnosis | Production-side commit (intent confirmed) |
   |---|---:|---|---|
   | `src/lib/document-tabs.test.ts` | 9 | **Test-stale post intentional production change.** Tests asserted tab id `'sprints'` (now `'weeks'`), asserted `getTabsForDocumentType('sprint')` returned `[]` (now returns 4 tabs `['overview','plan','review','standups']`), asserted project's first tab was `'details'` (now `'issues'`), and asserted dynamic 'Weeks (3)' label that is actually static for `project`. | `7713ef0` "Weekly Accountability Documents — per-person plans and retros" (2026-02-01) introduced the sprint→week rename and the 4-tab sprint config; `b1e4c5a` "Dashboard improvements" (2026-02-13) explicitly states *"Make Issues the default project tab instead of Details since the standalone Issues rail was removed."* The test file was not touched in either commit. |
   | `src/components/editor/DetailsExtension.test.ts` | 3 | **Born broken — the test never passed.** The test asserts `extension.config.content === 'block+'`, but the same commit that created the test also created the production file with `content: 'detailsSummary detailsContent'`. The `'block+'` value lives on the inner `DetailsContent` node — the test author confused the parent extension with one of its children. Also, the two editor-context tests built an `Editor` with only `[StarterKit, DetailsExtension]`, so ProseMirror threw `SyntaxError: No node type or group 'detailsSummary' found` because the inner nodes weren't registered. | Test + production are both from `f30983e` "Add Notion-like editor features: mentions, tables, toggles, files". Production code has had its current shape since day one; the test never matched it. |
   | `src/hooks/useSessionTimeout.test.ts` | 1 | **Test-stale post intentional production change.** Test "does NOT call onTimeout if dismissed before 0" — `resetTimer` now calls `apiPost('/api/auth/extend-session')` from `@/lib/api`; on rejection the hook force-logs-out via `onTimeout`. The test's `global.fetch` mock omits `headers`, so the CSRF check inside `apiPost` rejects, the catch fires `onTimeout`, the "not called" assertion fails. | `1136dc9` "fix: Resolve 6 critical production bugs found during audit" (2026-02-07) added the `apiPost` call so dismiss-warning actually extends the server-side session — previously, the modal could "dismiss" without renewing. The test file was not touched. |
   | `src/styles/drag-handle.test.ts` | 1 (suite-load) | **Born broken under jsdom.** File imports node `fs` + `path` at module top; `web/vitest.config.ts` has `environment: 'jsdom'` as the default; Vite's `vite:import-analysis` plugin throws on `import "fs"` under jsdom. | `de8e008` "Add drag handles to editor blocks like Notion" (2025-12-30) created the test with the `fs` import. Either it has never passed, or it broke on an early Vite upgrade. No production behavior is protected by it as currently written. |

   **What each fix did, and what it did NOT do.** All four edits are confined to the test files. Production code on the audited commit (`076a18371…`) was not touched, and none of my edits would mask a regression. Specifically: the `document-tabs` and `useSessionTimeout` fixes restored parity with documented intentional production changes; the `DetailsExtension` and `drag-handle` fixes corrected authoring errors in tests that never passed. **Severity downgraded from High → Medium after fix**, but the headline meta-finding is sharper than first written: *the web test suite contains both silently-rotting tests AND silently dead-on-arrival tests because the root `pnpm test` only runs `@ship/api`*. Phase 2 Taskmaster #17 (CI workflow) must run `pnpm --filter @ship/web test` to keep this coverage number live and to catch born-broken tests in PR.

   **Audit-trail.** Four web test files were edited mid-audit to diagnose the 13 failures; edits reverted on master 2026-05-20 to preserve the unmodified-baseline rule. The Phase 1 baseline is the pre-revert broken state on `076a18371`; the post-revert 151/151 passing / 28.28% lines is recorded as audit-trail context, and the test repair work is scoped as a Phase 2 deliverable with before/after evidence.

3. **Vitest API suite runtime is ~3 minutes live** (not the 10–14 min extrapolated earlier). The earlier extrapolation came from a sandboxed agent where DB latency inflated per-test setup; live run from this thread completed 28 files / 451 tests in well under the 5-min cap. **Severity: Low** (was Medium). The 451-test count also refines an earlier overstatement of 612 — that figure came from a static grep that included nested `it.each(...)` definitions counted as separate invocations.
4. **Three presearch-identified critical paths have zero coverage**: WS session timeout, soft-FK assignee-after-archive, `yjsToJson()` drift. **Severity: High** — cleanest "3 untested critical paths" targets for the brief's improvement requirement.
5. **`web/` unit tests exist (16 files) but aren't part of the headline test count.** Files cover editor extensions (DragHandle, FileAttachment, ImageUpload, Mention, TableOfContents, Details), hooks (useSelection, useSessionTimeout), contexts (SelectionPersistence), libs (accountability, document-tabs), pages (Dashboard), UI components (PlanQualityBanner, ScrollFade, USWDS Icon), and styles (drag-handle). The root `pnpm test` only runs `@ship/api` per `package.json:33`, so the web tests live but aren't discoverable from the standard command. **Severity: Medium** — surfaces a script gap, not a coverage gap. **And — see finding #2 — 4 of those 16 files have failing tests that nobody catches because of this script gap.**
6. **13 `test.fixme()` stubs** cluster in keyboard-shortcuts/conversion/issue-page-mgmt/sidebar. They pass silently in CI. **Severity: Medium** — bit-rot signal.
7. **20 `.hover()` sites** are the most likely live-run flake source. **Severity: Medium**.
8. **Auth coverage gaps**: session expiry, PIV cert, API tokens have zero tests of either kind. Session expiry is **Medium-High**; PIV/API-token are conditional on scope.
9. **No file-upload tests** — conditional gap depending on feature priority.
10. **No `test.only` / no `describe.serial`** — positive finding on test discipline.
11. **No top-level `pnpm test:coverage` or `pnpm test:web`** — the root `test` script only runs `@ship/api test`. Web tests can be invoked via `pnpm --filter @ship/web test` but the root surface doesn't expose them. **Severity: Low** — script ergonomics.

### Improvement target (per brief)

Two viable paths to the brief's improvement target:

**Path A — add three tests for confirmed coverage gaps** (each carrying a `// Mitigates: <risk>` comment):

1. **WS session timeout** at `e2e/websocket-session-timeout.spec.ts` — mitigates silent data loss on idle expiry.
2. **Assignee-after-archive soft-FK** at `api/src/services/documents-assignee-orphan.test.ts` — mitigates orphan-reference crash in properties panel.
3. **`yjsToJson()` drift** at `api/src/collaboration/yjs-to-json-drift.test.ts` — mitigates stale content in search/index/export readers.

**Path B — fix three broken/flaky tests with documented root-cause analysis** (also accepted by the brief):

1. **`web/src/lib/document-tabs.test.ts`** (2 broken tests) — stale `'sprints'` id from pre-migration-033; rewrite assertions for `'weeks'` id (or fix the production code if the regression is there).
2. **`web/src/components/editor/DetailsExtension.test.ts`** (4 broken tests) — register inner node types in test setup or update assertion to match production `'detailsSummary detailsContent'` content spec.
3. **`e2e/program-mode-week-ux.spec.ts:369`** (consistent flake, 2 of 3 runs) — "clicking sprint card selects it in the chart" — likely needs a `waitForLocator` instead of an immediate assertion against the chart's animated state.

Path B is more in spirit with the brief's "fix 3 flaky tests with documented root cause analysis" phrasing and ships value sooner because each fix is a concrete bug. Path A is the higher-leverage long-term play. **Recommend Path B for Phase 2** since it directly cites three broken/flaky tests we measured live with root causes already in hand.

### Raw data files

- `orientation/baselines/test-coverage/full-report.md` — agent's static-analysis report
- `orientation/baselines/test-coverage/api-coverage.txt` — live `pnpm --filter @ship/api test --coverage` (40.34% / 33.44%)
- `orientation/baselines/test-coverage/web-coverage.txt` — live web vitest run (4 of 16 files fail)
- `orientation/baselines/test-coverage/e2e-specs.txt` — list of all 71 spec files
- `orientation/baselines/test-coverage/api-unit-tests.txt` — list of all 28 unit-test files
- `orientation/baselines/test-coverage/e2e-runs/run{1,2,3}-summary.json` — Playwright progress-reporter snapshots
- `orientation/baselines/test-coverage/e2e-runs/run{1,2,3}-output.log` — full Playwright stdout (~190 KB each; flake list is at the tail)

---
