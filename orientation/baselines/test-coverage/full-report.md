## Category 5: Test Coverage & Quality

### Methodology

Static inventory was collected without modifying any test or source code. Playwright spec files and `test()` invocations were counted with `find` and `grep` against `e2e/`. Vitest test files and `it()`/`test()` calls were counted under `api/src/**/*.test.ts`. `scripts/check-empty-tests.sh` was executed to detect silent-pass empty bodies. PostgreSQL was observed to be running (the vitest run made it deep into 12 of 28 test files, which fail-fast on connect, so Postgres was clearly up; `pg_isready` itself was not callable in this sandbox). A bounded `pnpm --filter @ship/api test` run was attempted with a 5-minute cap as instructed; the suite did not complete within the budget. No coverage tooling is currently installed in `api/` (no `@vitest/coverage-v8` dep, no `coverage` block in `api/vitest.config.ts`), so `pnpm --filter @ship/api test --coverage` cannot be run without first installing the package — flagged as `pending`. The E2E suite was deliberately **not** executed (per CLAUDE.md and the brief); flakiness is therefore reported as static risk inventory only, based on grep patterns over `e2e/*.spec.ts` and `e2e/playwright.config.ts`. Flow-to-spec mapping was built by case-insensitive keyword search across `e2e/*.spec.ts` and `api/src/**/*.test.ts`, then narrowed to the spec(s) most clearly responsible for each flow.

### Baseline metrics

| Metric | Baseline |
|---|---|
| Total Vitest unit test files | **28** (`api/src/**/*.test.ts`; `web/` has no `test` script and no `*.test.ts` files) |
| Total Vitest `it()`/`test()` invocations (static count) | **612** |
| Vitest pass / fail / skip | **partial: 373 / 0 / 0 from ~12 of 28 files** — the run was killed at the 5-minute cap before completion. Suite did not finish in 300 s. |
| Vitest suite runtime | **> 300 s** (timed out — extrapolated full run ≈ 10–14 min based on ~43% file progress) |
| Total Playwright E2E spec files | **71** |
| Total Playwright `test()` invocations (active) | **838** |
| `test.fixme()` count | **13** (in 6 specs — see locations below) |
| `test.skip()` count | **0** |
| `test.only()` count (sabotage check) | **0** (clean) |
| Empty tests (silent-pass risk) | **0** per `scripts/check-empty-tests.sh` (script ran cleanly, no offenders). The footgun is actively guarded by a pre-commit hook. |
| E2E pass / fail / flaky | **pending** — live runs deliberately not in this audit pass; no prior `test-results/summary.json` exists. |
| E2E suite runtime | **pending** — not measured. Config: 4 workers, `fullyParallel=true`, retries=1 local / 2 CI, Chromium only. |
| Code coverage — `api/` (line / branch) | **pending** — `@vitest/coverage-v8` not installed; no coverage block in `api/vitest.config.ts`. |
| Code coverage — `web/` | **N/A** — `web` package has no unit tests at all (no `test` script in `web/package.json`). |

**`test.fixme()` locations** (deliberate stubs, not bugs):
- `e2e/document-conversion.spec.ts` (lines 11, 134, 175)
- `e2e/issue-page-management.spec.ts` (lines 13, 22, 41)
- `e2e/keyboard-shortcuts.spec.ts` (lines 13, 96, 252)
- `e2e/projects-listing-sorting.spec.ts` (line 12)
- `e2e/sidebar-navigation.spec.ts` (lines 100, 162)
- `e2e/week-dashboard.spec.ts` (line 13)

### Critical flows vs. coverage

| Flow | E2E spec(s) | API unit test(s) | Status |
|---|---|---|---|
| Auth — login (password) | `auth.spec.ts`, `login-redirect.spec.ts`, `database-login.spec.ts` | `auth.test.ts`, `auth-service.test.ts`, `auth-passport.test.ts`, `auth-passport-routes.test.ts` | Covered |
| Auth — logout | `auth.spec.ts` | `auth.test.ts` | Covered |
| Auth — session expiry (15-min idle / 12-hr absolute) | **none** | **none** — no test references session expiry/timeout behaviour | **GAP** |
| Auth — PIV / x509 cert | **none** | **none** — no test exists for cert-based auth path | **GAP** (conditional on PIV being in scope) |
| Auth — API token | **none** in `e2e/` | **none** in `api/src/**/*.test.ts` | **GAP** (conditional on feature being shipped) |
| Document CRUD — create | `document-creation.spec.ts`, `sidebar-create-document.spec.ts`, `untitled-document-titles.spec.ts`, and more | `documents.test.ts`, `documents-archive.test.ts`, `documents-soft-delete.test.ts` | Covered |
| Document CRUD — edit / title | `document-title-editing.spec.ts`, `editor-empty-state.spec.ts` | `documents.test.ts` | Covered |
| Document CRUD — archive | covered across CRUD specs | `documents-archive.test.ts`, `documents-soft-delete.test.ts` | Covered |
| Document CRUD — delete (hard / soft) | covered indirectly | `documents-soft-delete.test.ts`, `documents-soft-delete-extras.test.ts` | Covered (unit) |
| Real-time collaborative edit | `collaborative-editing-resilience.spec.ts`, `collaborative-editing-stress.spec.ts`, `multi-user-collaboration.spec.ts` | **none** found referencing `yjs`/`websocket` directly in unit tests | E2E only |
| Sprint management — create / edit | `sprint-management.spec.ts`, `sprint-cleanup.spec.ts`, `sprint-status-defaults.spec.ts` | `sprints.test.ts`, `sprints-statuses.test.ts`, `weeks.test.ts` | Covered |
| Sprint — week dashboard | `week-dashboard.spec.ts` (1 fixme) | `weeks.test.ts` | Partial — 1 fixme stub |
| Document conversion (issue↔project) | `document-conversion.spec.ts` (3 fixme), `convert-document-type.spec.ts` | no clear convert-focused API test | **Partial** — 3 fixme stubs |
| Accountability — plan / retro / standup approval | `weekly-plan-mvp.spec.ts`, `weekly-plan-textarea-inputs.spec.ts`, `weekly-retro.spec.ts`, `weekly-standup-mvp.spec.ts`, `standup-flow.spec.ts` | `weeks.test.ts` (partial) | Covered (E2E heavy) |
| File upload / attachment | **none** — no spec contains `upload`, `setInputFiles`, or `attach` | **none** | **GAP** (conditional — feature may not exist) |
| **WebSocket session timeout** | **none** — no spec exercises Yjs WS behaviour after auth expiry | **none** | **GAP** (matches presearch finding) |
| **Soft-FK integrity — assignee after person archive** | **none** — `assignee` referenced in specs but archive interaction is not tested | **none** | **GAP** (matches presearch finding) |
| **`yjsToJson()` body→snapshot drift** | **none** — string `yjsToJson` does not appear in any test | **none** | **GAP** (matches presearch finding) |

### Static flakiness risk inventory

| Pattern | Files / lines | Risk |
|---|---|---|
| `page.waitForTimeout(<n>)` — explicit sleeps | **3 occurrences** in 2 files: `e2e/collaborative-editing-resilience.spec.ts:43` (`waitForTimeout(2000)`), `:67` (`waitForTimeout(1000)`); `e2e/standup-flow.spec.ts:88` (`waitForTimeout(500)`) | Low–medium. The collab resilience spec uses sleeps to simulate disconnect windows — semantically reasonable but 1–2 s sleeps on a multi-user race are a classic flake source. The standup `500 ms` after click is replaceable with `expect(...).toBeVisible()`. |
| `.hover(` — hover-to-reveal patterns | **20 occurrences** across 6 files (`document-creation.spec.ts`, `mode-switcher-isolation.spec.ts`, `sidebar-navigation.spec.ts`, `wiki-mode-no-mode-switcher.spec.ts`, `wiki-mode.spec.ts`, collab specs) | Medium. Playwright hover is racy when the hovered element triggers an async-rendered child (e.g. row action menu); hover without an immediately following `await expect(child).toBeVisible()` is textbook flake. |
| `networkidle` / `waitUntil:'networkidle'` | **0** — not used in `e2e/*.spec.ts` | None. |
| `test.describe.serial(` | **0** — suite relies on full parallelism with per-worker DB isolation (`fullyParallel:true`, 4 workers, retries 1 local / 2 CI in `e2e/playwright.config.ts`) | Low. Parallel-by-default is correct, but means any shared mutable state in `e2e/fixtures/` becomes a flake vector. |
| Missing `await` on async Playwright matchers | **0 detected** via grep for `^expect(...)\.(toBe…|toHave…)` without `await` | Low — code review may surface more, but the obvious form is absent. |
| `test.only()` (accidental sabotage) | **0** | None. |
| Largest specs (failure-blast radius) | `multi-user-collaboration.spec.ts` (37 tests), `auth.spec.ts` (35), `mode-switcher-isolation.spec.ts` (33), `keyboard-shortcuts.spec.ts` (30) | Medium — a single failing fixture in these specs cascades into ≥30 failures, masking root cause. |

Ambient risk: retries are enabled (1 local, 2 CI), which is a common mask for flake — without a flake report it is impossible to tell which tests actually rely on retry to pass. That signal is exactly what a 3× live-run loop with `summary.json` would expose; that work is deliberately deferred.

### Top findings

1. **No coverage instrumentation in `api/`** — `@vitest/coverage-v8` is not in `api/package.json` and `api/vitest.config.ts` has no `coverage` block. The audit baseline for "lines covered" is therefore literally unknown. **Severity: High** for the audit; remediating is a one-line dep install plus a config edit.
2. **Vitest suite does not finish inside 5 minutes locally** — the partial run got through ~12 of 28 test files and 373 passing assertions before timeout; extrapolated full runtime ≈ 10–14 min. Almost certainly indicates per-test DB setup/teardown costs not being amortised. **Severity: High** for developer ergonomics; **Medium** for correctness (no failures were seen up to the cutoff).
3. **Three presearch-identified critical paths have zero test coverage**: (a) WebSocket session timeout / Yjs reconnect after auth expiry, (b) soft-FK integrity for `assignee` references after person archive, (c) `yjsToJson()` body→snapshot drift between Yjs state and the JSON `content` column. None of these strings appear in any test file. **Severity: High** — these are the highest-leverage targets for the brief's "3 untested critical paths" goal.
4. **Frontend (`web/`) has zero unit tests** — no `test` script, no `*.test.ts` files. All frontend correctness rides on E2E. **Severity: Medium**, intentional per the Ship philosophy ("boring, no over-engineering"), but means UI logic regressions surface only via slow Playwright runs.
5. **13 `test.fixme()` stubs are accumulating** in 6 specs, concentrated in keyboard-shortcuts, document-conversion, issue-page-management, and sidebar-navigation. These pass silently in CI (fixme is "pending"). **Severity: Medium** — fixme is the right tool for "intentionally pending", but 13 stubs across feature areas the team presumably cares about suggests bit-rot.
6. **20 `.hover()` call sites without an obvious wait-for-revealed-child pattern** are the most likely live-run flake source. **Severity: Medium** — confirmation requires three live runs.
7. **Auth surface is partially tested**: password login has 4 API unit tests + 3 E2E specs, but session expiry, PIV cert auth, and API tokens have no test of any kind. Whether PIV/API-tokens are in product scope determines whether items 7b/7c are gaps or non-issues — flag for clarification. **Severity: Medium-High** (session expiry alone) → **Low** (PIV/API token, if not yet a feature).
8. **File upload appears to have no tests** — neither `upload`, `setInputFiles`, nor `attach` appear in any spec. If attachments are a feature, this is a gap; if not, ignore. **Severity: Conditional**.
9. **No `test.describe.serial` / no sabotage-risk `test.only`** — discipline is good on parallelism markers. **Positive finding.**

### Improvement target (per brief)

The strongest fit with the brief's "add meaningful tests for 3 previously untested critical paths" is the trio surfaced by presearch and confirmed gap-free of any existing coverage:

1. **WebSocket session timeout** — assert that when the session cookie expires mid-edit, the Yjs WS connection closes cleanly and the UI surfaces a "session expired, reconnect" affordance rather than silently dropping edits. Risk mitigated: silent data loss on idle expiry. Suggested location: `e2e/websocket-session-timeout.spec.ts`.
2. **Soft-FK integrity — assignee after person archive** — archive a person who is the `assignee` of an issue, then read that issue back and assert the API does not return null/undefined-shaped properties; the issue should either resolve to a tombstone label or unset the assignee, but it must not crash the editor. Risk mitigated: orphan-reference crash in document properties panel. Suggested location: `api/src/services/documents-assignee-orphan.test.ts`.
3. **`yjsToJson()` body→snapshot drift** — write to a document via the Yjs path, then read the JSON `content` column directly and assert semantic equivalence of the rendered structure. Risk mitigated: search/index/export reading stale content after a Yjs edit. Suggested location: `api/src/collaboration/yjs-to-json-drift.test.ts`.

Each test should carry a header comment naming the risk it mitigates, e.g. `// Mitigates: silent data loss on 15-min idle session expiry during active editing.`

Alternatively, if the team prefers the "fix 3 flaky tests" route, the highest-yield targets given retries=2 in CI are the three largest specs (`multi-user-collaboration.spec.ts`, `auth.spec.ts`, `mode-switcher-isolation.spec.ts`) — running them three times and grading on retry-required-to-pass would surface the actual flakes. That requires the live runs deferred from this phase.

### Raw data files

- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/e2e-specs.txt` — full list of 71 Playwright spec files
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/api-unit-tests.txt` — full list of 28 Vitest test files
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-counts.txt` — aggregate counts (test files, `test()` calls, fixme, skip, only)
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-fixme.txt` — all 13 `test.fixme()` locations with line numbers
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-skip.txt` — empty (0 occurrences)
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-empty-check.txt` — `scripts/check-empty-tests.sh` output (clean)
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-unit.txt` — raw stdout of the partial Vitest run
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-unit-clean.txt` — same, ANSI-stripped (7522 lines, truncated at 5-min cap)
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-unit-junit.xml` — empty stub (Vitest killed before writing)
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-unit-run.txt` — capture wrapper output for the JUnit run
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-unit-log.txt` — capture wrapper output for the JSON run
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-files-touched.txt` — distinct test files Vitest had begun before timeout
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-results-partial.txt` — per-test pass-line capture before timeout
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/wait-for-timeout.txt` — all 3 `page.waitForTimeout()` call sites
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/hover-uses.txt` — all 20 `.hover()` call sites
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/describe-mode.txt` — empty (0 `describe.serial`/`describe.parallel`)
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/missing-await-expect.txt` — empty (0 obvious missing-await hits)
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/flow-mapping-e2e.txt` — keyword → E2E spec map
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/flow-mapping-api.txt` — keyword → API test map
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/test-detail.txt` — top specs by `test()` count + fixme/skip detail
- `/Users/sheep/Desktop/Gauntlet/ship/orientation/baselines/e2e-dir.txt` — `ls -la e2e/` snapshot
