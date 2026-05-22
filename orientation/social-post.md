# Social Post — ShipShape Phase 2

Two drafts per the GFA Week 4 brief's "Social Post" requirement (X or LinkedIn, tagged `@GauntletAI`). Post when ready and update the `Posted` line below.

---

## Draft A — X (Twitter), ~280 chars

> Just audited a US Treasury TypeScript codebase end-to-end. Found a silent NULL persist that emptied document bodies while the binary state survived, a WebSocket that kept writing edits after session revocation, and a 587 KB→142 KB entry chunk (−76%). Receipts, not vibes. @GauntletAI #ShipShape

Backup variant focused on the test-coverage angle:

> Wrote 30 critical-path regression tests against a Treasury codebase. Each one is a tripwire on a real audit finding: silent data loss, session revocation hole, dashboard N+1, axe a11y regressions. CI gate added so a future PR can't undo any of it. @GauntletAI #ShipShape

---

## Draft B — LinkedIn, longer-form

> Just finished a one-week production audit on the US Department of the Treasury's open-source project tracker (Ship). It's a real TypeScript monorepo: React + Express + Postgres + Yjs CRDTs for live collaboration. ~73 Playwright tests, real users.
>
> The brief was "diagnose first, then fix" — write a measurable baseline for type safety, bundle size, API latency, DB query efficiency, test coverage, runtime errors, and accessibility, then move every needle with proof.
>
> What surprised me most:
>
> 1. The same Yjs document is persisted twice — once as a binary CRDT (the truth) and once as a JSON snapshot (the read-path optimization). When the JSON converter has a bug it returns `undefined`, which `JSON.stringify` quietly turns into pg NULL. The binary state survived; REST reads returned empty docs. Silent data loss is the worst kind because nothing crashes.
>
> 2. WebSocket sessions were validated once at HTTP upgrade and then never again. A user logged out from another tab kept writing to the database via the still-open WS until they closed the browser. Patched with a 60-second re-validation tick and a 4401 close code.
>
> 3. Adding 4 partial JSONB expression indexes on document properties turned the dashboard's slowest query from a 88%-wasted bitmap scan into an index seek. From 0.149 ms to 0.040 ms in the dev DB; the math scales.
>
> 4. Lazy-loading 20 routes + gating React Query devtools behind a build flag dropped the entry chunk from 587 KB gzip to 142 KB gzip. The shape of Vite's tree-shake on `import.meta.env.DEV` constants is a more important React shipping primitive than most teams realise.
>
> Full audit report, 30 new tests, before/after benchmarks, and a CI gate that locks the floor in: [REPO_URL placeholder — replace with public fork URL once deployed].
>
> The biggest takeaway: most "performance problems" are observability problems. The dashboard wasn't slow because it was complicated — it was slow because nobody had a query log open while clicking through it.
>
> @GauntletAI #ShipShape #TypeScript #PostgreSQL #WCAG

---

## Tags / hashtags

- `@GauntletAI` (required per brief)
- Optional: `#ShipShape`, `#TypeScript`, `#WCAG`, `#PostgreSQL`, `#WebDevelopment`, `#OpenSource`

## Posted

- X: [PASTE LINK HERE WHEN POSTED]
- LinkedIn: [PASTE LINK HERE WHEN POSTED]

## Notes

The LinkedIn version places the most surprising finding (silent NULL) first because LinkedIn rewards a strong first sentence in the truncated preview. The X version compresses three findings into one beat. Both link back to the deployed fork URL — fill that in once Task 22 ships the public deploy.
