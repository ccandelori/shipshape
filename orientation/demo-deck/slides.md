---
theme: dracula
title: ShipShape Audit — Phase 1 Findings
info: |
  ## ShipShape Audit — Phase 1 Findings
  GFA Week 4 — audit of US-Department-of-the-Treasury/ship @ 076a18371
class: text-center
transition: slide-left
mdc: true
---

# ShipShape Audit
## Phase 1 — Findings

<br/>

US-Department-of-the-Treasury/ship · commit `076a18371`

<br/>

Cameron Candelori · GFA Week 4 · 2026-05-20

<!--
This briefing summarises the Phase 1 findings of the ShipShape audit, performed against US-Department-of-the-Treasury/ship at commit 076a18371. The PRD-required baseline measurements were taken across all seven categories. Four critical defects were identified and reproduced under live conditions.
-->

---

# Executive Summary

Four critical defects were identified and reproduced under live conditions.

<br/>

| # | Defect | Severity |
|---|---|---|
| 1 | `yjsToJson()` returns `undefined` under fault conditions; the `pg` driver coerces this to SQL NULL, silently nulling `documents.content`. | Critical — silent data loss |
| 2 | WebSocket session authentication is performed only at HTTP upgrade; a revoked or expired session continues to persist edits via the WebSocket. | Critical — security exposure |
| 3 | `services/accountability.ts` contains six N+1 query patterns; dashboard load issues 30–80 SQL queries per request at production volume. | Critical — performance |
| 4 | No global Express error middleware exists; uncaught exceptions return `Content-Type: text/html`, breaking frontend JSON parsing. | Critical — error handling |

<br/>

Reproduction protocols and evidence are documented under `orientation/baselines/runtime-errors/evidence/`.

<!--
Four critical defects, all reproduced under live conditions, are summarised here. The detailed methodology, evidence files, and reproduction protocols are referenced at the end of this briefing. Defect 1 was reproduced via a documented defect-injection-then-revert protocol; defects 2, 3, and 4 were reproduced against the audited commit unmodified.
-->

---

# Audit Scope

Phase 1 of the GFA Week 4 ShipShape PRD specifies baseline measurements across seven categories. Remediation is not permitted during the 36-hour audit window.

<br/>

| | Category | Phase 1 baseline |
|---|---|---|
| 1 | Type Safety | 747 violations · `pnpm type-check` exit 0 |
| 2 | Bundle Size | 2,074 KB / 588 KB gzipped main chunk |
| 3 | API Response Time | P95 = 46.6 ms on `/api/issues` at c=50 |
| 4 | DB Query Efficiency | 26 / 7 / 5 / 21 / 5 queries per PRD-prescribed flow |
| 5 | Test Coverage | API 40.34% lines · web suite non-passing on audited commit |
| 6 | Runtime Errors | 12 scenarios captured live · 4 critical defects |
| 7 | Accessibility | Lighthouse minimum 0.96 · 9 axe Critical+Serious violations |

<br/>

**Phase 1 gate: met on 2026-05-20.**

<!--
The audit follows the seven PRD categories. The hard gate is pass-fail on whether baseline measurements exist for all seven. The gate was met. Each category is presented below in three slides: methodology, baseline metric table, and findings with severity. Category 6, which contains the four critical defects, is expanded to six slides.
-->

---

# Category 1 · Type Safety
## Methodology

Static text analysis was performed with `ripgrep 14.1.1` across `web/src`, `api/src`, `shared/src`, and `e2e/` (TypeScript files only).

<br/>

Five violation classes were enumerated, with filters applied to discount SQL column aliases, `import * as` statements, and English-prose matches.

<br/>

`pnpm type-check` was executed live on 2026-05-19 across all three workspace packages.

<!--
Type safety was measured via static analysis. Five violation classes were counted with filters applied to discount false positives. The TypeScript compiler was run live across the three workspace packages on the audited commit.
-->

---

# Category 1 · Baseline

| Metric | Baseline |
|---|---:|
| `: any` (colon-form) | 103 |
| `as <Type>` (excluding `as const` and imports) | 577 |
| `!` (non-null assertions) | ~66 |
| `@ts-ignore` | 0 |
| `@ts-expect-error` | 1 |
| Strict mode enabled (root) | Yes |
| `pnpm type-check` error count | 0 |
| **Total combined violations** | **747** *(≈498 production / ≈249 test)* |

<!--
747 total violations were identified across the four scopes. The compiler accepts the codebase as type-correct — the violations are surface-level constructs that erode the type system's guarantees rather than compile errors. The production-vs-test split was derived by re-running the audit's ripgrep filter with a test-file path predicate.
-->

---

# Category 1 · Findings

| # | Finding | Severity |
|---|---|---|
| 1 | `web/tsconfig.json` is a standalone configuration that omits `noUncheckedIndexedAccess`, `noImplicitReturns`, and `noFallthroughCasesInSwitch` flags enforced at the workspace root. | High |
| 2 | Approximately 160 `as any` casts are concentrated in four `pg`-mock test files (`api/src/services/accountability.test.ts` and three siblings). | Medium |
| 3 | Production route handlers cast `req.query.<name> as string` throughout `weeks.ts`, `team.ts`, `projects.ts`, and `claude.ts`, masking the `string \| string[] \| undefined` union. | High |
| 4 | Approximately 80 `document.properties as <T>` casts appear in `web/src` page and editor components, propagated by the untyped JSONB column in the shared `Document` type. | Medium |

<!--
The highest-severity Cat 1 finding is the web package tsconfig omission, which permits a class of compile errors that the rest of the workspace catches. The test-side concentration of "as any" represents lower runtime risk but masks future schema changes.
-->

---

# Category 2 · Bundle Size
## Methodology

A live production build was executed via `pnpm build:web`. Bundle output, per-chunk sizes, and per-package attribution were captured.

<br/>

An interactive treemap was generated by `rollup-plugin-visualizer` and is regenerable from a clean checkout via a committed shell script (`bash orientation/baselines/bundle/regenerate.sh`).

<br/>

The visualization is gated behind the `BUNDLE_ANALYZE=1` environment variable so production builds remain unaffected.

<!--
The bundle was measured via live production build. The treemap artifact is regenerable from a clean checkout, with the visualization step gated behind an environment variable so the production deployment path is not modified.
-->

---

# Category 2 · Baseline

| Metric | Baseline |
|---|--:|
| Total production bundle size (`dist/`) | 4.5 MB |
| Largest chunk | `index-*.js` — 2,074 KB raw / 588 KB gzipped |
| Number of JS chunks | 261 |
| Top 3 dependencies by gzipped weight | `highlight.js` via `lowlight` (118 KB) · `emoji-picker-react` (72 KB) · `yjs` (55 KB) |
| Unused dependencies identified | `@tanstack/query-sync-storage-persister` |

<br/>

Vite issues a build-time warning that the main chunk exceeds the 500 KB minified threshold by approximately fourfold.

<!--
The main chunk contains 99 percent of the JavaScript weight and exceeds Vite's recommended threshold by a factor of four. One unused dependency was identified.
-->

---

# Category 2 · Findings

| # | Finding | Severity |
|---|---|---|
| 1 | `web/src/main.tsx` statically imports approximately 25 page components, including `AdminDashboard`, `AdminWorkspaceDetail`, `OrgChartPage`, `SetupPage`, and `InviteAccept`. No route-level lazy-loading is in use. | High |
| 2 | `web/src/components/Editor.tsx` imports `lowlight`'s `common` syntax-highlighting bundle, registering approximately 37 language grammars at module load. | High |
| 3 | `@tanstack/react-query-devtools` is statically imported and rendered unconditionally in `web/src/main.tsx`. The package is intended for development use only. | High |
| 4 | `emoji-picker-react` (72 KB gzipped) is statically imported by `EmojiPicker.tsx`. The component is discretionary and not exercised by most users. | Medium |

<!--
The dominant cause of bundle weight is the absence of route-level code splitting combined with two unconditional dependencies — the lowlight common bundle and the development-only ReactQueryDevtools — that ship to production users.
-->

---

# Category 3 · API Response Time
## Methodology

The database was seeded to the PRD-required floor: 500 documents, 104 issues, 20 users, 35 sprints.

<br/>

The five highest-traffic endpoints were identified by frontend network trace. Each endpoint was benchmarked with `autocannon v8.0.0` at concurrency 10, 25, and 50 for 30 seconds.

<br/>

`autocannon` does not emit native P95; `k6 v2.0.0` was added on 2026-05-20 to capture PRD-literal P95 on the two slowest endpoints.

<br/>

The rate-limit bypass required for the benchmark is gated behind an `isTestEnv` check in `apiLimiter` and unreachable in dev or production builds.

<!--
Five endpoints were benchmarked. Autocannon emits p90 and p97.5 but not P95; k6 was added specifically to capture PRD-literal P95 on the two slowest endpoints. The rate-limit bypass scaffolding is environment-gated to avoid affecting production.
-->

---

# Category 3 · Baseline

c=50 row shown; full c=10/25/50 data preserved in `baselines/api-response-time/`.

<br/>

| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| `GET /api/issues` | 39 ms | **46.6 ms** | 51 ms |
| `GET /api/documents?type=wiki` | 45 ms | **53.0 ms** | 56 ms |
| `GET /api/auth/me` | 15 ms | 22 ms\* | 27 ms |
| `GET /api/projects` | 23 ms | 34 ms\* | 37 ms |
| `GET /api/weeks` | 23 ms | 31 ms\* | 36 ms |

<br/>

\* autocannon p97.5 (strict upper bound on P95). All 850,757 requests returned 2xx.

<!--
PRD-literal P95 was captured via k6 on the two slowest endpoints. The remaining three are reported as autocannon's p97.5, which is a strict upper bound on P95. All 850 thousand requests across the matrix returned successful responses.
-->

---

# Category 3 · Findings

| # | Finding | Severity |
|---|---|---|
| 1 | `GET /api/issues` is the slowest endpoint under load; the route performs JSONB joins against `documents` and `users`, with sort by a CASE expression over `properties->>'priority'`. | High |
| 2 | `GET /api/documents?type=wiki` returns an unpaginated 241-row payload at c=50, exposing list-cost as a function of workspace document count. | High |
| 3 | `api/src/middleware/auth.ts` issues `UPDATE sessions SET last_activity = NOW()` on every authenticated request. Cookie-refresh is throttled to 60 seconds; the database write is not. | High |
| 4 | `GET /api/projects` and `/api/weeks` execute correlated subqueries; the `/api/projects` planner reports 0 of 139 Memoize cache hits. | Medium / High |

<!--
The most significant finding is the unthrottled session-activity write, which is a cross-cutting cost paid by every authenticated request. The correlated subqueries in /api/projects and /api/weeks are not the slowest endpoints at current seed volume but scale poorly.
-->

---

# Category 4 · Database Query Efficiency
## Methodology

Two evidence layers were captured.

<br/>

**Layer A.** PostgreSQL query logging was enabled via `ALTER SYSTEM SET log_statement = 'all'`; the five PRD-required user flows were walked and queries counted from docker logs. These counts are lower bounds — the stderr buffer dropped lines under burst.

<br/>

**Layer B.** The `pg_stat_statements` extension was enabled and reset between flows for exact counts. `EXPLAIN ANALYZE` was executed against the slowest query in each flow.

<!--
Two evidence layers. The initial docker-log walk produced lower-bound counts because the postgres stderr buffer dropped lines under burst. The pg_stat_statements layer produced exact counts and is the authoritative source.
-->

---

# Category 4 · Baseline

| User flow | Total queries | Slowest query (ms) | N+1 detected? |
|---|---:|---:|---|
| Load main page | 26 | 0.28 | Yes (`services/accountability.ts:175–437`) |
| View a document | 7 | 0.11 | No |
| List issues | 5 | 0.26 | No (post-filter scan: 92 of 104 rows discarded) |
| Sprint / team board | 21 | 0.26 | Yes (per-row UPDATE loop in `team.ts:561–577`) |
| Search content | 5 | 0.19 | No (Seq Scan: 491 of 500 rows discarded) |

<br/>

Query times reflect localhost warm-cache execution (`Buffers: shared hit`). Production cold-cache will produce materially higher figures.

<!--
The localhost warm-cache caveat is explicit. The query counts are exact via pg_stat_statements. The Sequential Scan and post-filter row-discard counts are the load-bearing shapes — they remain accurate regardless of execution-time scaling.
-->

---

# Category 4 · Findings

| # | Finding | Severity |
|---|---|---|
| 1 | Of all JSONB property expressions in route SQL, only `properties->>'user_id'` on person documents has a dedicated expression index. `state`, `assignee_id`, `sprint_number`, and `owner_id` are uncovered. | High |
| 2 | `services/accountability.ts:175–437` issues six awaited queries inside for-each loops. Projected dashboard load: 30–80 queries per request at production volume. | Critical |
| 3 | The search endpoint executes `title ILIKE '%<term>%'`, which is non-sargable. A Sequential Scan was confirmed, filtering 491 of 500 rows. | High |
| 4 | `GET /api/projects` Memoize cache produced 0 hits / 139 misses, indicating a correlated-subquery shape unsuited to plan caching. | Medium / High |

<!--
The load-bearing finding is the absence of expression indexes on JSONB hot paths. The accountability N+1 is the single largest source of database load and carries the Cat 6 critical-defect designation. The search Seq Scan is a known-pattern non-sargable predicate.
-->

---

# Category 5 · Test Coverage & Quality
## Methodology

The API unit test suite was executed via `pnpm --filter @ship/api test --coverage` using `@vitest/coverage-v8`.

<br/>

The web unit test suite was executed via `pnpm --filter @ship/web test --coverage`.

<br/>

The end-to-end test suite was executed three times at `PLAYWRIGHT_WORKERS=8` for flake cross-reference.

<br/>

Critical user flows (authentication, document CRUD, real-time synchronization, sprint management) were mapped against the spec inventory.

<!--
Two unit suites and one E2E suite. The E2E suite was run three times to identify flakes by intersection of runs. Critical flows were enumerated against the existing spec inventory.
-->

---

# Category 5 · Baseline

| Metric | Baseline |
|---|---:|
| API unit tests | 451 / 451 pass / 0 fail / 0 flaky (~3 min) |
| Web unit tests on audited commit | 146 invocations, **13 fail** across 4 of 16 files |
| E2E `test()` invocations | 869 across 71 specs |
| E2E results (3 runs at c=8) | 864–866 pass / 0 hard fail / 10 unique flakes |
| API coverage | 40.34% lines / 33.44% branches |
| Critical flows with zero coverage | WS session timeout · soft-FK orphan · `yjsToJson` drift |

<!--
The API suite passes cleanly. The web suite was observed to be in a non-passing state on the audited commit. End-to-end stability was confirmed across three runs with zero hard failures. Three presearch-identified critical paths have zero unit-level coverage.
-->

---

# Category 5 · Findings

| # | Finding | Severity |
|---|---|---|
| 1 | The web test suite was non-passing on the audited commit. Three of four failing files were silently stale following intentional production refactors; two had never been observed to pass. | High |
| 2 | Root-level `pnpm test` invokes only the `@ship/api` package; web unit tests have no routine execution path. | High |
| 3 | API coverage is bimodal: hot routes 60–100%, cold operational routes below 10% (`dashboard.ts` 1.98%, `caia-auth.ts` 3.9%, `weekly-plans.ts` 4.8%). | High |
| 4 | One end-to-end test flaked consistently across runs: `program-mode-week-ux.spec.ts:369` (failed first attempt in 2 of 3 runs). | Medium |

<!--
The meta-finding is that the root test script omits the web package — a structural condition under which silently-rotting tests cannot be detected by routine CI even if CI were configured. The bimodal API coverage indicates operational and administrative routes are materially less protected than user-facing routes.
-->

---

# Category 6 · Runtime Errors
## Methodology

Three live evidence passes were executed.

<br/>

| Pass | Method | Scope |
|---|---|---|
| 1 | Live `curl` + handler grep | CSRF, bad-JSON-body, forced 500, error-handler enumeration |
| 2 | Playwright Node script | Disconnect/reconnect, slow-3G, 10 KB title, XSS, malformed Yjs, visibility race |
| 3 | Playwright + `psql` + defect-injection | WS session expiry, two-tab title race, **`yjsToJson` silent NULL** |

<br/>

The PRD-required normal-usage console pass was performed via the `normal-usage.mjs` Playwright walker across 11 routes.

<!--
Cat 6 evidence was assembled across three passes. The third pass, executed during the critical-review re-audit, captured the three findings that drive the critical-defect designation. The yjsToJson reproduction used a documented defect-injection-then-revert protocol because the conversion function never returns undefined under normal operation.
-->

---

# Category 6 · Baseline

| Metric | Baseline |
|---|---|
| Console errors during normal usage | 1 (structurally expected 401 at `/login`) across 11 walked routes |
| Unhandled promise rejections observed | 0 during live audit |
| Theoretical unhandled-rejection surface | ~30 handlers across 5 sampled route files lack outer try/catch |
| Network disconnect / reconnect recovery | Pass |
| Routes outside any React error boundary | 6+ (`/login`, `/setup`, `/admin`, `/admin/workspaces/:id`, `/invite/:token`, `/feedback/:programId`) |
| Silent failures with live evidence | 3 + one production-error response-shape defect |

<br/>

Twelve numbered scenarios carry direct live evidence; four are designated critical.

<!--
The PRD-prescribed metrics for Cat 6 are populated here. The unhandled-rejection figure is qualified: zero were observed during the audit, but the theoretical surface is approximately 30 handlers across five sampled route files where Express 4 would propagate uncaught rejections to a global handler that does not exist.
-->

---

# Critical Defect #1 — `yjsToJson()` silent NULL persist

**The chain.**

```text
yjsToJson(fragment) → undefined          (under fault conditions)
JSON.stringify(undefined) → undefined    (JavaScript value, not a string)
pg driver coerces undefined → SQL NULL
```

<br/>

`documents.content` is silently set to NULL. `yjs_state` is unaffected (96 bytes intact at reproduction time). Subsequent REST reads observe an empty document.

<br/>

**Reproduction.** A marker-conditioned `return undefined` branch was injected into `yjsConverter.ts`. The persist path was exercised. The resulting database row was inspected via `psql` (`content IS NULL = t`). The injection was reverted via `git restore`. No master diff remains.

<br/>

**Severity: Critical** — silent data loss.

<!--
The yjsToJson function, as written, always returns a valid object. The defect surface is therefore preventive rather than triggerable on unmodified master. Reproduction required injecting a defect — but the failure mode it exposes is real: the persist path performs no try-catch around JSON.stringify, and the pg driver's undefined-to-NULL coercion is silent.
-->

---

# Critical Defect #2 — WS session validated only at upgrade

`validateWebSocketSession()` in `api/src/collaboration/index.ts:347–393` is invoked exactly once per connection — at HTTP upgrade.

<br/>

The `wss.on('connection', …)` handler (lines 683–786) installs `message` and `close` listeners but never re-validates the session.

<br/>

**Live confirmation.**

| Probe | Observed |
|---|---|
| Pre-expiry phrase typed via WebSocket-bound editor | Persisted to `documents.content` |
| `DELETE FROM sessions WHERE id = …` | Executed |
| REST `GET /api/auth/me` after delete | 401 (HTTP boundary dead) |
| Post-expiry phrase typed via WebSocket-bound editor | **Persisted to `documents.content`** |

<br/>

**Severity: Critical** — a user with a revoked or expired session continues to write to the database until the browser is closed.

<!--
The bug was reproduced by forcing session destruction at the database row level. The REST boundary correctly returned 401, confirming the HTTP session was no longer valid. The WebSocket continued to accept messages and persist them to documents.content.
-->

---

# Critical Defect #3 — Accountability service N+1

`services/accountability.ts:175–437` contains six awaited query expressions inside for-each loops over (a) active sprints, (b) owned sprints, and (c) allocations.

<br/>

Dashboard load issues an estimated **30–80 SQL queries per request at production volume.**

<br/>

At seed-data scale (104 issues, 35 sprints), the load-main-page user flow already exhibits 26 total queries, with `services/accountability.ts` the dominant contributor as confirmed by `pg_stat_statements`.

<br/>

**Severity: Critical** — performance under realistic load.

<!--
This finding is identified by static analysis and confirmed by query-count measurement. The N+1 loops multiply by user count, sprint count, and allocation count. At scale, this is the dominant source of database load across the application.
-->

---

# Critical Defect #4 — No global Express error handler

Enumeration of `api/src/app.ts` (lines 90–245) finds **zero four-argument `(err, req, res, next)` middleware.**

<br/>

Any uncaught exception past a route handler's own try/catch reaches Express's default `finalhandler`, which serializes the error to `Content-Type: text/html` with a `<pre>` stack trace.

<br/>

Frontend code in `web/src/lib/api.ts` chains `fetch().then(r => r.json())`, which throws `SyntaxError: Unexpected token '<' in JSON` when the response body is HTML.

<br/>

**Exposed surface.** Approximately 24 of 50 handlers in `weeks.ts` and 3 of 6 handlers in `dashboard.ts` lack an outer try/catch.

<br/>

**Severity: Critical** — error handling.

<!--
The grep is conclusive: no four-argument middleware exists. The frontend's JSON-parsing chain is the consumer that fails most visibly.
-->

---

# Category 7 · Accessibility
## Methodology

Four passes were executed.

<br/>

1. **Lighthouse 13.3.0** on 10 routes.
2. **`@axe-core/playwright`** deep scan on 8 authenticated routes against WCAG 2.0/2.1 A/AA + Section 508 rule tags.
3. **Keyboard-only walkthroughs** of 3 representative flows (login, document create, edit + modal).
4. **Real macOS VoiceOver speech-log** capture via `@guidepup/guidepup` driving Playwright, walking `/dashboard`, `/my-week`, and the wiki document editor.

<!--
Four passes were performed. The VoiceOver capture is the real speech log, not a Lighthouse proxy. Keyboard walkthroughs documented four specific reachability failures rather than asserting a global pass or fail.
-->

---

# Category 7 · Baseline

| Metric | Baseline |
|---|---|
| Lighthouse a11y score per page | 7 of 10 routes at 1.00; lowest 0.96 (`/my-week`, issue editor) |
| Critical / Serious axe violations | 9 (4 Critical + 5 Serious) across 8 authenticated routes |
| Keyboard navigation completeness | Partial — four documented failures |
| Color contrast failures | 9 nodes on `/my-week` + 3 on issue editor |
| Missing ARIA labels or roles | 3 custom modals · ~10 placeholder-only inputs · `/settings` role-select · workspace switcher · comment reply inputs |

<!--
Lighthouse on 10 routes, axe deep-scan on 8 routes, keyboard on 3 flows, real VoiceOver on 3 routes. Nine Critical-plus-Serious violations.
-->

---

# Category 7 · Findings

| # | Finding | Severity |
|---|---|---|
| 1 | Three custom modal components declare `aria-modal` but lack focus traps and `aria-labelledby` attributes (`ConversionDialog`, `MergeProgramDialog`, `BacklogPickerModal`). | High |
| 2 | The `/settings` role-assignment dropdown has no accessible name; assistive technology announces it as "combobox" without role context. | Critical |
| 3 | Clickable cells in `AccountabilityGrid.tsx:320, 406` are implemented as `<div onClick>` without `role="button"`, `tabIndex`, or keyboard event handlers — WCAG 2.1.1 failure. | High |
| 4 | Tailwind opacity modifiers degrade design-token contrast: `text-muted/50` blends to 2.26:1; `bg-accent/20` blends to 2.55:1. | High |
| 5 | The TipTap editor body is unreachable from the document title via Tab; keyboard users must click into it. | High |

<!--
Accessibility findings cluster around two architectural patterns: custom modal implementations diverging from the Radix Dialog primitive used elsewhere, and Tailwind opacity modifiers degrading design-token contrast.
-->

---
layout: center
class: text-center
---

# Phase 1 — Complete

<br/>

4 critical defects live-confirmed · 231 evidence artifacts · 7 PRD baseline tables

<br/>

`orientation/audit-report.md` · `orientation/audit-report-detailed.md`
`orientation/baselines/` · `orientation/README.md` · `orientation/discovery.md`

<br/>

The Phase 1 gate is met. Phase 2 remediation work is scoped per category against the audit-detailed report.

<!--
This concludes the Phase 1 briefing. Four critical defects were identified and reproduced. 231 evidence artifacts are tracked. The audit is documented in two paired artifacts: an executive summary and a detailed reference. The full text of every finding referenced in this briefing is available in audit-report-detailed.md.
-->
