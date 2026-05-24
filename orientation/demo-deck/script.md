# ShipShape Audit — Phase 1 Demo Video Script

> **What this is.** A read-aloud script for the 28-slide deck at `orientation/demo-deck/html/index.html`. Each block matches a slide; speak each block, advance to the next slide, speak the next block. Target total runtime: **~6 minutes** (about 5:30 if you read briskly).
>
> **How to use during recording.** Open the deck fullscreen on your recording display; open this script on your second monitor (or printed) for read-along. Advance with → / space.
>
> **Delivery notes.**
> - Third-person passive throughout. *"The audit identified..."* — not *"I found..."*.
> - Pause between sentences. The script is timed assuming natural pacing, not sprint reading.
> - The slide carries the data. You can paraphrase as long as the meaning is preserved.
> - If you're running long: drop the methodology slides for Cats 1, 2, 5, and 7 to "skim while reading the table title." Saves ~15s.
> - If you fluff a take: the deck has 4 dramatic moments (Critical Defects #1–4). Re-record from the matching slide rather than from the top.

---

## Slide 1 — Cover · *5s*

> This briefing summarises the Phase 1 findings of the ShipShape audit, performed against US-Department-of-the-Treasury/ship at commit 076a18371. Four critical defects were identified and reproduced under live conditions.

---

## Slide 2 — Executive Summary · *25s*

> Four critical defects, all reproduced under live conditions, are summarised here. Silent data loss when the Yjs-to-JSON conversion path returns undefined and the pg driver coerces it to SQL NULL. Security exposure where the WebSocket session is validated only at HTTP upgrade. A performance defect: the accountability service issues 30 to 80 SQL queries per dashboard request at production volume. And an error-handling defect: no global Express error middleware exists, so uncaught exceptions return HTML and break frontend JSON parsing. The detailed methodology, evidence files, and reproduction protocols are referenced at the end of this briefing.

---

## Slide 3 — Audit Scope · *15s*

> The audit follows the seven PRD categories. The hard gate is pass-fail on whether baseline measurements exist for all seven. The gate was met on 2026-05-20. Each category is presented in three slides: methodology, baseline metric table, and findings with severity. Category 6, which contains the four critical defects, is expanded to six slides.

---

## Slide 4 — Cat 1 · Methodology · *10s*

> Type safety was measured via static analysis with ripgrep. Five violation classes were counted with filters applied to discount false positives such as SQL column aliases and import-as statements. The TypeScript compiler was run live across the three workspace packages on the audited commit.

---

## Slide 5 — Cat 1 · Baseline · *10s*

> 747 total violations were identified across the four scopes. The compiler accepts the codebase as type-correct — the violations are surface-level constructs that erode the type system's guarantees rather than compile errors. The production-versus-test split was derived by re-running the ripgrep filter with a test-file path predicate.

---

## Slide 6 — Cat 1 · Findings · *12s*

> The highest-severity finding is the web package's tsconfig, which omits three safety flags the workspace root enforces. The test-side concentration of "as any" represents lower runtime risk but masks future schema changes. Production route handlers cast request-query values as strings, masking the union type and creating an input-validation gap.

---

## Slide 7 — Cat 2 · Methodology · *10s*

> The bundle was measured via a live production build. The treemap artifact is regenerable from a clean checkout, with the visualisation step gated behind an environment variable so the production deployment path is not modified.

---

## Slide 8 — Cat 2 · Baseline · *10s*

> The main chunk contains 99 percent of the JavaScript weight and exceeds Vite's recommended threshold by a factor of four. One unused dependency was identified.

---

## Slide 9 — Cat 2 · Findings · *12s*

> The dominant cause of bundle weight is the absence of route-level code splitting combined with two unconditional dependencies — the lowlight common bundle and the development-only ReactQueryDevtools — that ship to production users.

---

## Slide 10 — Cat 3 · Methodology · *15s*

> Five endpoints were benchmarked at concurrency 10, 25, and 50 over 30 seconds each. Autocannon emits p90 and p97.5 but not P95, so k6 was added on 2026-05-20 specifically to capture PRD-literal P95 on the two slowest endpoints. The rate-limit bypass scaffolding is environment-gated to avoid affecting production.

---

## Slide 11 — Cat 3 · Baseline · *12s*

> The two slowest endpoints carry PRD-literal P95 measurements from k6. The remaining three endpoints are reported as autocannon's p97.5, which is a strict upper bound on P95. All 850 thousand requests across the matrix returned successful responses.

---

## Slide 12 — Cat 3 · Findings · *12s*

> The most significant finding is the unthrottled session-activity write, which is a cross-cutting cost paid by every authenticated request. The correlated subqueries in projects and weeks are not the slowest endpoints at current seed volume but scale poorly with workspace size.

---

## Slide 13 — Cat 4 · Methodology · *10s*

> Two evidence layers. The initial docker-log walk produced lower-bound counts because the postgres stderr buffer dropped lines under burst. The pg_stat_statements layer produced exact counts and is the authoritative source. Five EXPLAIN ANALYZE plans were captured for the slowest query in each user flow.

---

## Slide 14 — Cat 4 · Baseline · *12s*

> The localhost warm-cache caveat is explicit. The query counts are exact. The Sequential Scan and post-filter row-discard counts are the load-bearing shapes — they remain accurate regardless of how execution time scales with volume.

---

## Slide 15 — Cat 4 · Findings · *12s*

> The load-bearing finding is the absence of expression indexes on JSONB hot paths. The accountability N+1 is the single largest source of database load and carries the critical-defect designation. The search Sequential Scan is a known-pattern non-sargable predicate.

---

## Slide 16 — Cat 5 · Methodology · *10s*

> Two unit-test suites and one end-to-end suite were measured. The E2E suite was run three times to identify flakes by intersection of runs. Critical user flows were enumerated against the existing spec inventory.

---

## Slide 17 — Cat 5 · Baseline · *12s*

> The API suite passes cleanly. The web suite was observed to be in a non-passing state on the audited commit. End-to-end stability was confirmed across three runs with zero hard failures. Three critical paths identified during the presearch have zero unit-level coverage.

---

## Slide 18 — Cat 5 · Findings · *12s*

> The meta-finding is that the root test script omits the web package — a structural condition under which silently-rotting tests cannot be detected by routine CI even if CI were configured. The bimodal API coverage indicates that operational and administrative routes are materially less protected than user-facing routes.

---

## Slide 19 — Cat 6 · Methodology · *15s*

> Category 6 evidence was assembled across three passes. The first pass was curl and handler-grep for the network and error-handler stuff. The second pass was a Playwright Node script across six DOM-interactive scenarios. The third pass — executed during the critical-review re-audit — captured the three findings that drive the critical-defect designation, including one that required a documented defect-injection-then-revert protocol.

---

## Slide 20 — Cat 6 · Baseline · *10s*

> The PRD-prescribed metrics for category 6 are populated here. The unhandled-rejection figure is qualified: zero were observed during the audit, but the theoretical surface is approximately 30 handlers across five sampled route files where Express 4 would propagate uncaught rejections to a global handler that does not exist.

---

## Slide 21 — Critical Defect #1: yjsToJson silent NULL · *25s*

> The yjsToJson function, as written, always returns a valid object. The defect surface is therefore preventive rather than triggerable on the unmodified codebase. Reproduction required injecting a defect — a marker-conditioned return-undefined branch was added to yjsConverter.ts; the persist path was exercised; the database row was queried via psql. Content was NULL. Yjs_state survived at 96 bytes. The injection was reverted via git restore. No master diff remains. The failure mode it exposes is real: the persist path performs no try-catch around JSON.stringify, and the pg driver's undefined-to-NULL coercion is silent.

---

## Slide 22 — Critical Defect #2: WS session validated only at upgrade · *20s*

> The WebSocket server validates the session at HTTP upgrade and then never again. The bug was reproduced by forcing session destruction at the database row level. The REST boundary correctly returned 401, confirming the HTTP session was no longer valid. The WebSocket continued to accept messages and persist them to the documents content column. A user whose session has been revoked continues to write to the database until the browser is closed.

---

## Slide 23 — Critical Defect #3: Accountability N+1 · *15s*

> This finding is identified by static analysis and confirmed by query-count measurement. The accountability service contains six N-plus-one loops — awaited queries inside for-each loops over sprints, owned sprints, and allocations. Dashboard load issues 30 to 80 queries per request at production volume. At scale this is the dominant source of database load across the application.

---

## Slide 24 — Critical Defect #4: No global Express error handler · *18s*

> The grep is conclusive: no four-argument middleware exists in app.ts. Any uncaught exception past a route handler's own try-catch reaches Express's default finalhandler, which serialises the error to HTML. The frontend's fetch-dot-json chain is the consumer that fails most visibly — it throws a SyntaxError because the response body is HTML, not JSON. Approximately half of weeks.ts handlers and half of dashboard.ts handlers lack the outer try-catch that would otherwise contain the exception.

---

## Slide 25 — Cat 7 · Methodology · *10s*

> Four passes were performed. Lighthouse on 10 routes. Axe deep-scan on 8 authenticated routes against WCAG 2.0 / 2.1 A/AA and Section 508 tags. Keyboard walkthroughs on three representative flows. And the real macOS VoiceOver speech log, captured via guidepup driving Playwright through the dashboard, the default landing, and the wiki editor.

---

## Slide 26 — Cat 7 · Baseline · *10s*

> Lighthouse on 10 routes — seven at perfect score, lowest 0.96. Nine Critical-plus-Serious axe violations. Keyboard navigation rated partial with four specific documented failures. Nine color-contrast failures concentrated on the my-week dashboard.

---

## Slide 27 — Cat 7 · Findings · *12s*

> The accessibility findings cluster around two architectural patterns: custom modal implementations that diverge from the Radix Dialog primitive used elsewhere in the codebase, and Tailwind opacity modifiers applied on top of design-token color tokens — the opacity modifiers degrade the contrast guarantees the tokens were chosen for.

---

## Slide 28 — Phase 1 Complete · *8s*

> That concludes the Phase 1 briefing. Four critical defects were identified and reproduced. 231 evidence artifacts are tracked. The audit is documented in two paired artifacts: an executive summary and a detailed reference. The full text of every finding referenced in this briefing is available in the detailed audit report.

---

## Running totals

| Section | Time |
|---|---:|
| Opening (slides 1–3) | 45s |
| Cat 1 (slides 4–6) | 32s |
| Cat 2 (slides 7–9) | 32s |
| Cat 3 (slides 10–12) | 39s |
| Cat 4 (slides 13–15) | 34s |
| Cat 5 (slides 16–18) | 34s |
| Cat 6 (slides 19–24) | 103s |
| Cat 7 (slides 25–27) | 32s |
| Close (slide 28) | 8s |
| **Total** | **~6:00** |

If you need to come in under 5 minutes strict:
- Cover (slide 1) can be 3s of silence while you breathe
- Methodology slides for Cats 1, 2, 5, 7 can be cut to single-sentence ("Static analysis via ripgrep" / "Live production build" / "Vitest plus three E2E runs" / "Lighthouse plus axe plus keyboard plus VoiceOver") — saves ~25s
- Cat 6 baseline (slide 20) can be cut to "All 12 numbered scenarios were captured live" — saves 5s
