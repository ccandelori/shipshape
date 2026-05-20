# `orientation/baselines/` — index

Raw data files supporting the audit measurements in `../audit-report.md`. One subdirectory per audit category. **The methodology block in each section of `audit-report.md` is the reproducibility contract** — these files are evidence; the commands to re-derive them are in the audit report.

## Layout

```
baselines/
├── type-safety/           ← Category 1
├── bundle/                ← Category 2
├── api-response-time/     ← Category 3
├── db-efficiency/         ← Category 4
├── test-coverage/         ← Category 5
├── runtime-errors/        ← Category 6
├── accessibility/         ← Category 7
└── raw/                   ← evidence-of-process; safe to ignore unless verifying agent work
    └── type-safety/         (58 intermediate ripgrep outputs)
```

## File map

### `type-safety/` — Cat 1
| File | Source | Status |
|---|---|---|
| `counts.txt` | Agent's per-package summary (any/as/non-null/ts-ignore/ts-expect-error counts, tsconfig table, methodology notes) | Complete |
| `tsc-output.txt` | **Live** `pnpm type-check` output 2026-05-19 — exit 0 across api/web/shared. **Scope caveat: `e2e/` is not in `pnpm-workspace.yaml` and has no own `tsconfig.json`, so its 76 spec files are not type-checked by any current command.** |

### `bundle/` — Cat 2
| File | Source | Status |
|---|---|---|
| `build.txt` | **Live** `pnpm build:web` output 2026-05-19 — built in 3.25s with sourcemaps, full chunk listing | Complete |
| `bundle-baseline.html` | **Live treemap** (650 KB) from `rollup-plugin-visualizer` — interactive per-package weights | Complete |
| `per-package.txt` | 295 packages/local files ranked by rendered weight (parsed from treemap JSON) | Complete |
| `files-js.txt` | All 261 JS chunks sorted by size (one monolith + 13 lazy doc-tab chunks + 247 USWDS icon micro-chunks) | Complete |
| `files-css.txt` | CSS chunks (one ~65 KB bundle) | Complete |
| `static-analysis.txt` | Code-splitting, lazy-loading, Suspense, manualChunks, sourcemap, Editor weight, devtools-in-prod findings | Complete |
| `unused-deps.txt` | Per-dep ripgrep import counts + resolved package sizes from pnpm store | Complete |

### `api-response-time/` — Cat 3
| File | Source | Status |
|---|---|---|
| `benchmark-script.sh` | Runnable script (updated 2026-05-19 to send `X-Bench: 1` for rate-limit bypass; validates `$SESSION_COOKIE` and seed counts) | Complete |
| `run-output.log` | Script stdout from 2026-05-19 live run | Complete |
| `api-<slug>-c{10,25,50}.json` | **15 autocannon JSON files** with full latency histograms, 1.1 M total requests, 0 errors, 0 non-2xx | Complete |

**Caveat:** local-only measurement. Required a source-code patch at `api/src/app.ts:84` (rate-limit skip on `X-Bench: 1` header). Must revert before commit. Re-run against `shadow` for production-representative numbers.

### `db-efficiency/` — Cat 4
| File | Source | Status |
|---|---|---|
| `full-report.md` | Agent's full report (15 N+1 patterns, index coverage analysis, EXPLAIN samples) | Complete |
| `methodology.md` | Runbook to capture live counts and EXPLAIN plans | Complete |
| `explain-plans.txt` | Placeholder + predicted plan shape for the dashboard "my issues" query | **Placeholder** until DB up |

### `test-coverage/` — Cat 5
| File | Source | Status |
|---|---|---|
| `full-report.md` | Agent's full report (initially claimed 612 invocations — corrected to 451 live; web has 16 unit files, api has coverage block) | Complete |
| `api-coverage.txt` | **Live `pnpm --filter @ship/api test --coverage` 2026-05-19** — 28 files / 451 tests / 0 failures, 40.34% line / 33.44% branch coverage with per-file table | Complete |
| `web-coverage.txt` | **Live `pnpm --filter @ship/web test --coverage` 2026-05-19** — 16 files / 146 tests / **13 FAILURES** across 4 files; vitest stopped coverage emission due to failures | Complete (with finding) |
| `e2e-runs/run{1,2,3}-summary.json` | **3× live Playwright runs 2026-05-19** at `PLAYWRIGHT_WORKERS=8`. Each run: 869 tests, 864–866 passed, 0 hard-fail, 3–5 flaky, 6.9–9.3 min. | Complete |
| `e2e-runs/run{1,2,3}-output.log` | Full Playwright stdout per run (~190 KB each; flake list at tail) | Complete |
| `e2e-specs.txt` | List of all 71 Playwright spec files | Complete |
| `api-unit-tests.txt` | List of all 28 Vitest unit-test files | Complete |

**Still pending:** web coverage % (blocked on fixing the 13 broken web tests first).

### `runtime-errors/` — Cat 6
| File | Source | Status |
|---|---|---|
| `repro-scripts.md` | 10 manual reproduction scripts (Playwright MCP runbook) | Complete; 6 of 10 still pending live browser walk |
| `evidence/csrf-html-response.txt` | **Live** curl POST `/api/auth/login` without CSRF token → 403 `text/html` + stack trace; also POST `/api/auth/logout` with bad JSON body → 400 `text/html`. Confirms finding #3 (no global Express error handler returns JSON). | Complete |
| `evidence/api-500-html-response.txt` | **Live** curl GET `/api/documents/not-a-uuid` → counter-example: this route has try/catch and returns `{"error":"Internal server error"}` as JSON. Shows the bug is route-specific, not universal. | Complete |

### `accessibility/` — Cat 7
| File | Source | Status |
|---|---|---|
| `scan-script.sh` | Lighthouse + axe-core runner across 7 main routes (axe-core/cli does not support `--cookie`; protected pages rely on Lighthouse's bundled axe-core) | Complete |
| `keyboard-walkthrough.md` | 3-flow keyboard test script for Playwright MCP | Complete; **pending live walkthrough** (MCP offline) |
| `lighthouse-{login,my-week,docs,issues,projects,team_allocation,settings}.json` | **Live** Lighthouse 13.3.0 / Chromium-1200 headless 2026-05-19. Scores: login 0.98 (unauth, no `<main>`), my-week 0.96 (6 color-contrast nodes), others 1.00. | Complete |
| `lighthouse-editor-{wiki,issue,project}.json` | **Live** Lighthouse on `/documents/<id>` for 3 doc types. Issue editor scores 0.96 (3 color-contrast nodes on properties sidebar buttons); wiki + project score 1.00. | Complete |

### `raw/type-safety/` — evidence
58 intermediate ripgrep outputs from the type-safety agent. Useful if you want to verify a specific `as` assertion line; otherwise safe to ignore. Naming convention: `<package>_<violation-kind>_<view>.txt`. Examples: `api_assertions_strict.txt`, `web_nn_dot.txt`, `e2e_any_raw.txt`, `shared_no_imports.txt`. Plus a few cross-cutting samples (`sample_unified.txt`, `team_ts_sample.txt`, `ts_ignore.txt`, `ts_expect_error.txt`).

## What "Complete" / "Pending live run" / "Static-only" means

- **Complete** — file contains output from a live command run (or static analysis that doesn't need a live command, e.g., ripgrep counts). Numbers in `../audit-report.md` derive from these files.
- **Pending live run** — script is ready and tested; needs the local stack (`pnpm dev`, seeded DB, browser, `$SESSION_COOKIE`) to execute. Each category's section in `../audit-report.md` lists the exact precondition.
- **Static-only** — findings exist but the brief's required measurements do not. Useful research; **does not satisfy the Phase 1 gate by itself**.

## What's actually measured today (post 2026-05-19 update)

| Category | Measured? | Source files |
|---|---|---|
| 1 Type Safety | **Yes** — counts + live tsc | `type-safety/counts.txt`, `type-safety/tsc-output.txt` |
| 2 Bundle Size | **Yes** — chunk-level + per-package treemap | `bundle/build.txt`, `bundle/bundle-baseline.html`, `bundle/per-package.txt` |
| 3 API Response Time | **Yes (localhost, caveats)** | `api-response-time/api-*-c{10,25,50}.json` (15 files), `api-response-time/run-output.log` |
| 4 DB Query Efficiency | **Yes (localhost, caveats)** | `db-efficiency/explain-*.txt` (4 plans), `db-efficiency/methodology.md`, `db-efficiency/full-report.md` |
| 5 Test Coverage | **Yes (full)** — api coverage, web run (revealing 13 broken tests in 4 files), and 3× E2E flake detection all live-measured | `test-coverage/api-coverage.txt`, `test-coverage/web-coverage.txt`, `test-coverage/e2e-runs/run{1,2,3}-*` |
| 6 Runtime Error | **Yes (mixed live + code)** — CSRF/JSON-body live curl evidence + WS/title code-confirmation; 6 of 10 Playwright scenarios still pending | `runtime-errors/evidence/*.txt`, `runtime-errors/repro-scripts.md` |
| 7 Accessibility | **Yes** — Lighthouse 13.3.0 on 10 routes; static review supplements with modal/interaction findings Lighthouse can't auto-flag | `accessibility/lighthouse-*.json` (10 files), `accessibility/scan-script.sh` |

## Reproducibility contract

If any baseline file is lost or corrupt, the **methodology block** in the corresponding section of `../audit-report.md` documents the exact commands to re-derive it. This is the project's authority for "show your work."
