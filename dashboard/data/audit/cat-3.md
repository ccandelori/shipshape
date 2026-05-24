## Category 3: API Response Time

### Methodology

Live benchmark run completed on 2026-05-19 against the local Docker database (`ship-postgres-1`, `ship_dev`) and the API already listening on `http://localhost:3000`. The normal project seed was first run and found to be intentionally smaller than the task floor (257 documents / 11 users), so `orientation/baselines/api-response-time/supplemental-seed.sql` was applied to reach the required baseline volume: **500 documents, 104 issues, 20 users, 35 sprints**. Authentication used the real CSRF + password login flow for `dev@ship.local` / `admin123`; benchmarks used the resulting `session_id` cookie.

Tooling: `autocannon v8.0.0`, Node `v24.10.0`, 5 endpoints x 3 concurrency levels (`10`, `25`, `50`) x 30 seconds each.

**Rate-limit measurement scaffold (added 2026-05-20).** The dev API rate limiter caps requests at 1000/min ≈ 16.7 RPS; the benchmark drives endpoints at ~3000 RPS to measure route+DB latency under the the spec's required concurrency. Without a scaffold every endpoint at c≥10 would receive 429s within seconds and the numbers would describe the rate limiter, not the route. `api/src/app.ts`'s `apiLimiter` therefore includes a guarded skip: `skip: (req) => isTestEnv && req.headers['x-bench'] === '1'`. The skip is unreachable in dev (`isDevEnv` true, `isTestEnv` false) and production (`isTestEnv` false), so the scaffold has zero observable behavior change outside an explicit benchmark-mode startup. The benchmark script sets the `X-Bench: 1` header and the API must be started with `E2E_TEST=1` (e.g. `E2E_TEST=1 pnpm dev:api`); the script's burst-probe sanity check aborts early if the skip isn't active. **Precedent:** identical pattern to Cat 2's `BUNDLE_ANALYZE=1` hook in `web/vite.config.ts` — a strictly opt-in measurement affordance recorded in version control. **Reproducibility:** clean from `076a18371` plus this guarded skip; reviewers reproduce by `E2E_TEST=1 pnpm dev:api` + `bash orientation/baselines/api-response-time/benchmark-script.sh`.

**Important percentile caveat (resolved 2026-05-20 via k6 capture):** `autocannon` JSON emits `p50`, `p90`, `p97_5`, and `p99`, but not native `p95`. The audit's initial pass therefore reported p97.5 as a strict upper bound on P95. On 2026-05-20 the slowest 2 endpoints (`/api/issues` and `/api/documents?type=wiki`) were re-benchmarked with **k6 v2.0.0** which emits native P95 — the actual P95 values are below. Driver: `orientation/baselines/api-response-time/k6-driver.sh`; per-endpoint JSON: `k6-<slug>-c{10,25,50}.json`; scripts: `k6-bench.js`. The k6 runs went against a separate API instance started with `E2E_TEST=1 PORT=3001 pnpm --filter @ship/api dev` so the X-Bench rate-limit skip was active without disturbing the main dev session.

**spec-literal P95 (k6, slowest 2 endpoints):**

| Endpoint | c=10 P50 / P95 / P99 | c=25 P50 / P95 / P99 | c=50 P50 / P95 / P99 | Requests |
|---|---|---|---|---:|
| `/api/issues` | 8.3 / **11.6** / 13.4 ms | 19.6 / **24.7** / 26.7 ms | 39.4 / **46.6** / 51.1 ms | 106,078 |
| `/api/documents?type=wiki` | 9.8 / **13.5** / 15.6 ms | 22.9 / **28.3** / 30.8 ms | 45.4 / **53.0** / 56.4 ms | 91,877 |

The remaining 3 endpoints (`/api/auth/me`, `/api/projects`, `/api/weeks`) carry autocannon p97.5 only — p97.5 is a strict upper bound on P95, and they're all faster than the slowest two by a wide margin, so the P95-not-P97.5 distinction does not change the ranking or the improvement-target selection.

### Identified top-5 endpoints

| # | Endpoint | User flow that calls it | Est. frequency | Auth required |
|---|---|---|---:|---|
| 1 | `GET /api/auth/me` | Mounted by `useAuth` on every app load and after every workspace switch (`web/src/hooks/useAuth.tsx:89,170`). | Every session boot | Y |
| 2 | `GET /api/documents?type=wiki` | `useDocumentsQuery` — fires on dashboard load, sidebar tree refresh, every navigation back to a list mode (`useDocumentsQuery.ts:29`). Stale-time 5 min, but `refetchOnMount: 'always'`. | Every mode switch | Y |
| 3 | `GET /api/issues` | `useIssuesQuery` — drives the Issues page, the Issues tab inside every project/sprint/program editor, and `IssuesList` component (`useIssuesQuery.ts:128`). | Every Issues view / project open | Y |
| 4 | `GET /api/projects` | `useProjectsQuery` — wrapped by `ProjectsContext` mounted at the root in `App.tsx:50`, so it loads on every page that uses the layout (Dashboard, every document editor). | Every page load | Y |
| 5 | `GET /api/weeks` | `useActiveWeeksQuery` — Dashboard top section (`Dashboard.tsx:49`) and `WeekOverviewTab` of every document editor. | Every dashboard / week-tab open | Y |

Also reviewed but ranked lower: `GET /api/documents/:id`, `/api/dashboard/my-work`, `/api/dashboard/my-focus`, `/api/weeks/my-action-items`, `/api/programs`, `/api/team/people`.

### Baseline Metrics

All 15 runs returned HTTP 200 only, with **0 errors** and **0 timeouts** across **850,757 total requests**.

| Endpoint | c | P50 ms | p97.5 ms | P99 ms | Mean ms | RPS | Requests |
|---|---:|---:|---:|---:|---:|---:|---:|
| `GET /api/auth/me` | 10 | 2 | 6 | 7 | 2.52 | 3309.8 | 99,278 |
| `GET /api/auth/me` | 25 | 7 | 12 | 14 | 7.69 | 3054.6 | 91,624 |
| `GET /api/auth/me` | 50 | 15 | 22 | 27 | 15.50 | 3125.5 | 93,754 |
| `GET /api/documents?type=wiki` | 10 | 10 | 15 | 17 | 9.89 | 962.2 | 28,867 |
| `GET /api/documents?type=wiki` | 25 | 21 | 29 | 34 | 22.05 | 1108.5 | 33,255 |
| `GET /api/documents?type=wiki` | 50 | 43 | 50 | 56 | 43.23 | 1142.8 | 34,284 |
| `GET /api/issues` | 10 | 7 | 11 | 12 | 7.65 | 1226.7 | 36,801 |
| `GET /api/issues` | 25 | 22 | 37 | 51 | 23.73 | 1032.9 | 30,988 |
| **`GET /api/issues`** | **50** | **45** | **58** | **66** | **45.56** | **1085.0** | **32,551** |
| `GET /api/projects` | 10 | 4 | 8 | 9 | 4.41 | 2038.2 | 61,140 |
| `GET /api/projects` | 25 | 11 | 17 | 20 | 11.53 | 2078.4 | 62,342 |
| `GET /api/projects` | 50 | 23 | 34 | 37 | 23.82 | 2055.3 | 61,653 |
| `GET /api/weeks` | 10 | 4 | 8 | 10 | 4.45 | 2022.1 | 60,655 |
| `GET /api/weeks` | 25 | 11 | 18 | 20 | 11.71 | 2048.0 | 61,433 |
| `GET /api/weeks` | 50 | 23 | 31 | 36 | 23.62 | 2071.3 | 62,132 |

`GET /api/issues` at c=50 is the slowest live result by both p97.5 (58 ms) and P99 (66 ms). `GET /api/documents?type=wiki` is second by p97.5 at c=50 (50 ms), which tracks the larger unpaginated wiki payload after the supplemental seed.

### Top findings

1. **`GET /api/issues` is the measured slowest endpoint.** The route joins documents to users/person docs, filters/sorts through JSONB properties, and orders by a CASE expression over `properties->>'priority'`. At c=50 it hit 45 ms P50 / 58 ms p97.5 / 66 ms P99. Severity: **High**.
2. **`GET /api/documents?type=wiki` exposes the unpaginated-list cost.** After the audit seed top-up, wiki rows increased to 241 and the endpoint landed second-slowest at c=50 (43 ms P50 / 50 ms p97.5 / 56 ms P99). Pagination or list-summary payload trimming is the obvious Phase 2 lever. Severity: **High**.
3. **Auth middleware writes on every authenticated request.** `api/src/middleware/auth.ts` updates `sessions.last_activity` on every request. Local Postgres hides much of the WAL/lock cost, but this is a cross-cutting production risk and every benchmarked endpoint pays it. The cookie refresh is already throttled; the DB write should be too. Severity: **High**.
4. **Correlated subqueries in projects/weeks are still structural risk, even though they did not win this local run.** `/api/projects` computes counts/status with per-row subqueries; `/api/weeks` computes issue counts and plan/retro state with multiple per-row subqueries. With only 15 projects and 35 sprints they stay under the issues/documents paths, but they are the routes most likely to degrade superlinearly as workspace volume grows. Severity: **Medium/High**.
5. **CSRF failures return HTML, not JSON.** The first login attempt without a CSRF token returned Express default HTML (`ForbiddenError: invalid csrf token`), confirming the Category 6 no-global-error-handler finding at the auth boundary. Frontend `fetch().json()` callers will see an opaque syntax error. Severity: **Medium**.

### Improvement target (per brief)

**20%** P95 reduction on **at least 2** endpoints, under identical load conditions. Based on the live data, target `GET /api/issues` and `GET /api/documents?type=wiki` first. Cross-cutting session-write throttling should also improve all five endpoints and gives a good before/after measurement path. **Metric-honesty note for Phase 2:** Phase 1 measured `p97.5` (a strict upper bound on P95). Phase 2 should report against actual P95 — either by switching to a tool that emits it natively (k6, wrk2) or by computing it from the raw latency histograms autocannon does record. Any "20% P95 reduction" claim must come from a measured P95, not a `p97.5` proxy.

### Raw data files

- `orientation/baselines/api-response-time/benchmark-script.sh` — runnable script (now sends `X-Bench: 1` for rate-limit bypass).
- `orientation/baselines/api-response-time/run-output.log` — script stdout from 2026-05-19.
- `orientation/baselines/api-response-time/api-<slug>-c{10,25,50}.json` — 15 autocannon JSON files with full latency histograms. Parse with `jq '.latency | {p50, p97_5, p99, mean}' <file>`.
- `orientation/baselines/api-baseline.json` — consolidated structured baseline.
- `orientation/baselines/api-metrics-extracted.txt` — human-readable metrics table.
- `orientation/baselines/db-seed-verification.txt` — Docker database volume proof.
- `orientation/baselines/endpoint-analysis.txt` and `orientation/baselines/load-testing-setup.txt` — Task 4 setup artifacts.

---
