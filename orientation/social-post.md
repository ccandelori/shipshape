# Social Post — ShipShape (GFA Week 4)

Drafts per the GFA Week 4 brief's "Social Post" requirement (X or LinkedIn, tagged `@GauntletAI`). Impact-framed: strong verbs, concrete numbers, reads well out of context, no secrets. Post when ready and update the `Posted` line below. No emoji by default. Add your public dashboard/repo link where marked.

---

## Draft A — X (Twitter)

> Audited a US Treasury codebase end-to-end, then built a security probe that actively attacks the running app. It found a single malformed WebSocket frame that crashes the entire collaboration server. I fixed it: 0 critical, server survives the full attack. Receipts, not vibes. @GauntletAI #ShipShape

Backup variant (remediation-numbers angle):

> One week on a US Treasury TypeScript codebase: bundle 587→143 KB gzip (−76%), slowest DB query −73%, API P95 −81%, accessibility 8 critical violations → 0. Every number on a live dashboard, every number backed by an evidence file. @GauntletAI #ShipShape

---

## Draft B — LinkedIn (longer-form)

> This week I audited a real government web application, then proved every fix.
>
> The target was an open-source US Department of the Treasury codebase (Ship): React + Express + Postgres, real-time collaboration over Yjs CRDTs and WebSockets, ~73 Playwright tests, real users. The brief was diagnose first, then fix: baseline seven quality dimensions, then move every needle with proof.
>
> I found 4 critical defects under live conditions. The scariest: a silent data-loss path. The Yjs-to-JSON converter could return `undefined`, which `JSON.stringify` quietly turns into a Postgres NULL, emptying a document's content while the binary CRDT state survived. Nothing crashed. REST reads just came back blank. Silent data loss is the worst kind.
>
> Then I remediated every category and measured:
> - First-paint bundle: 587 → 143 KB gzip (−76%) via route-level code splitting
> - Slowest database query: 0.149 → 0.040 ms (−73%) with JSONB expression indexes
> - API tail latency: −81% at P95 on the slowest endpoint, measured with k6
> - Accessibility: 8 critical and serious axe violations → 0
> - Closed 3 silent-failure paths and added 33 targeted regression tests
>
> Then I went a layer deeper and built a security probe from scratch: a single Go binary that actively attacks the running app across 5 surfaces (auth, WebSocket, input, dependencies, configuration). It found 71 issues, including a way to crash the entire collaboration server for every connected user with one malformed WebSocket frame. I fixed it (guarded message handler, policy-code closes, error listeners on every socket); the probe re-run confirms 0 critical and the server surviving the full frame-and-burst attack.
>
> All of it is surfaced on a live platform-health dashboard where every number traces back to an evidence file: the EXPLAIN output, the k6 run, the before/after probe.
>
> The takeaway I'm keeping: deep-reading an unfamiliar 200-file codebase is where AI assistance is a genuine multiplier. This week's work would have cost about $9,000 at per-token API rates; on a flat subscription, about $40. That gap is prompt caching, and it's why this way of working is viable, not just a nice demo.
>
> Audit, remediate, prove. Not "I think it's faster." Here's the measurement.
>
> Full audit report, the security probe, and the live dashboard: [REPO/DASHBOARD URL — add public link]
>
> @GauntletAI #ShipShape #TypeScript #PostgreSQL #WebSecurity #WCAG

---

## Tags / hashtags

- `@GauntletAI` (required per brief)
- Optional: `#ShipShape`, `#TypeScript`, `#PostgreSQL`, `#WebSecurity`, `#WCAG`, `#OpenSource`

## Posted

- X: [PASTE LINK HERE WHEN POSTED]
- LinkedIn: [PASTE LINK HERE WHEN POSTED]

## Notes

- The LinkedIn version leads with the audit framing, then the silent-NULL hook (LinkedIn rewards a strong first 2 lines in the truncated preview), and saves the security probe as the escalation beat since it's the standout deliverable.
- The X version leads with the security probe (the single most striking result) and keeps a remediation-numbers backup.
- All figures are the verified set (EXPLAIN output, k6 P95, axe scans, a live test run at 497 passing, a live security-probe run). Don't round them differently when posting.
