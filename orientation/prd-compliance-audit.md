# PRD Compliance Audit

**Source of truth:** `/Users/sheep/Desktop/Gauntlet/GFA Week 4 - ShipShape.pdf`  
**Checked:** 2026-05-20  
**Repo:** `/Users/sheep/Desktop/Gauntlet/ship`

## Verdict

The work is **not submission-ready against the PRD**, but Phase 1 baselines are now substantively complete pending merge of three open branches. See *Recheck — 2026-05-20 (second pass)* below.

## Recheck — 2026-05-20 (second pass)

The four highest-priority Phase 1 corrections the original recheck called for are now done in code. None of this work modifies user-facing app behavior — it adds measurement scaffolding and reverts in-progress audit-period edits — but for transparency every change is documented here.

### Branches

| Branch | Purpose |
|---|---|
| `feat/phase2-cat-2-bundle` | Bundle visualization reproducible from a fresh checkout. |
| `feat/phase2-cat-6-runtime-errors` | Normal-usage console error/warning baseline added. |
| `feat/phase2-cat-7-accessibility` | Real VoiceOver speech-log baseline added + existing axe/Lighthouse/keyboard artifacts brought under version control. |

### What was done during this round

The Phase 1 contract is: **no fixes that change observable app behavior** while baselines are being captured. The point is to measure what's actually shipping, not a tuned version. Below: what each item did and why it does or does not cross that line.

1. **Cat 6 — normal-usage console baseline.**
   - Added `orientation/baselines/runtime-errors/normal-usage.mjs` (a Playwright walker) and per-route evidence files plus a summary.
   - **Did not touch any app source.** Pure measurement.
   - Result: 1 console.error total across 11 walked routes — a structurally expected 401 on `/api/auth/me` at `/login`. 0 warnings, 0 uncaught page errors.

2. **Cat 7 — real screen-reader transcript.**
   - Added `orientation/baselines/accessibility/voiceover-walk.mjs` (guidepup + Playwright) and `voiceover-probe.mjs`. Captured two runs (dev stack, preview build) and curated a canonical summary.
   - Added `@guidepup/guidepup` and `@guidepup/playwright` as root devDependencies. These are test-tool dependencies in the same category as Playwright itself — they don't ship with the app.
   - Existing axe/Lighthouse/keyboard baseline artifacts that had been on disk untracked were committed at the same time.
   - **Did not touch any app source.** Pure measurement plus a tooling install.

3. **Cat 5 — revert audit-period edits.**
   - Reverted four modified web test files (`DetailsExtension.test.ts`, `useSessionTimeout.test.ts`, `document-tabs.test.ts`, `drag-handle.test.ts`) to their `master` state.
   - These were edited mid-audit and violated the "no fixes during baseline" rule. Restoring them preserves the audit's purity. The tests they updated remain broken in their original form — that's a Phase 2 concern, not a Phase 1 measurement concern.

4. **Cat 2 — bundle visualization reproducibility.**
   - Added `rollup-plugin-visualizer` as a `web/` devDependency.
   - Added an `orientation/baselines/bundle/regenerate.sh` one-command regen script.
   - Regenerated `bundle-baseline.html` and `build.txt` so the committed artifacts match the committed config.
   - Committed existing static-analysis artifacts that had been untracked.
   - **One source file was modified: `web/vite.config.ts`.** This is the edge case.

#### Why the `vite.config.ts` edit is defensible under "no fixes during audit"

The edit conditionally loads `rollup-plugin-visualizer` only when the environment variable `BUNDLE_ANALYZE=1` is set. Under normal builds — anything that doesn't set that env var, which includes every CI build, every deploy, every developer running `pnpm dev` or `pnpm build`, and every production artifact — the plugin is never imported. The resulting JS bytes are identical to before the change. Observable app behavior is therefore unchanged.

The original audit explicitly prescribed this kind of change: *"Commit the visualizer dependency/config or a checked-in script that regenerates `orientation/baselines/bundle/bundle-baseline.html`."* The treemap is itself a Phase 1 baseline artifact; if its generation isn't reproducible from a clean checkout, the baseline can't be defended. So the edit is part of *establishing* the Phase 1 baseline, not part of *fixing* anything Phase 1 was supposed to measure.

If a stricter reading of the rule is preferred, the alternative is to split this into a separate `web/vite.analyze.config.ts` file used only by the regenerate script. The current accepted approach trades one extra line in the main config for one less file to maintain. Either is defensible; the current decision is explicit and recorded here for the audit trail.

### Gate matrix — updated

| PRD Area | Status (this recheck) | Notes |
|---|---|---|
| Orientation / PRD capture | Pass | Unchanged. |
| Category 1: Type safety baseline | Pass with caveat | Unchanged. Caveat: `e2e/` excluded from workspace type-check. |
| Category 2: Bundle baseline | Pass | Treemap is now regenerable via `orientation/baselines/bundle/regenerate.sh`. **Pending merge of `feat/phase2-cat-2-bundle`.** |
| Category 3: API response baseline | Pass with caveat | Unchanged. Caveat: localhost autocannon percentile proxy. |
| Category 4: DB query baseline | Pass | Unchanged. |
| Category 5: Test coverage baseline | Pass with caveat | The audit-period test edits have been reverted on `master`. Remaining caveat: E2E summary JSONs are internally inconsistent — stdout logs remain authoritative. That inconsistency is an artifact problem, not a measurement problem, and is deferred to Phase 2. |
| Category 6: Runtime/error baseline | Pass | Normal-usage console pass exists. **Pending merge of `feat/phase2-cat-6-runtime-errors`.** |
| Category 7: Accessibility baseline | Pass | Real VoiceOver transcript exists. **Pending merge of `feat/phase2-cat-7-accessibility`.** |
| Phase 2 improvements | Fail | Unchanged — pending. |
| Per-category improvement docs | Fail | Unchanged — pending. |
| Discovery write-up | Fail | Unchanged — pending. |
| AI cost analysis | Fail | Unchanged — pending. |
| Demo video / script | Fail | Unchanged — pending. |
| Public deployment | Fail | Unchanged — pending. |
| Social post | Fail | Unchanged — pending. |
| Branch / commit hygiene | Partial | Three labeled feature branches now exist; previously work was all on `master`. Untracked dotfiles/coverage in working tree remain a hygiene item. |

### What's still open

- Merge the three feature branches into `master` (or whatever integration target you prefer) before final submission. Until then, anyone re-running the audit against `master` will still see the original Phase 1 gaps.
- Phase 2 improvements (one per category) and their per-category before/after improvement docs.
- Discovery write-up, AI cost analysis, demo video/script, public deployment, social post.
- Final repository hygiene pass.

## Recheck - 2026-05-20

Phase 1 is **provisionally measured**, but it is not clean enough to call an unconditional pass. The audit now has baseline artifacts for all 7 categories, and Category 4 has been corrected to use exact `pg_stat_statements` per-flow snapshots. The remaining Phase 1 gaps are PRD-significant:

- Category 6 does not include a separate normal-usage browser console error/warning count.
- Category 7 does not include a real VoiceOver/NVDA screen-reader test on dashboard and document editing.
- Category 5 required edits to four web test files while measuring, which conflicts with the PRD's "no fixes during audit" rule.
- Category 2 has a treemap artifact, but its generation is not reproducible from checked-in Vite/package configuration.

Phase 2 and final submission are **not done**. Taskmaster tasks 10-24 are still pending, including all seven improvements, CI, improvement docs, discovery write-up, AI cost analysis, demo video, deployment, social post, and final repository hygiene.

Current workspace evidence matches the prior verdict: branch is still `master`, recent git history has no new improvement commits, and the only tracked source diff is the same four web test files listed below.

## Gate Matrix

| PRD Area | Status | Audit Finding |
|---|---|---|
| Orientation / PRD capture | Pass | `orientation/prd.md` accurately reflects the PDF's phase gates and category targets. The PDF remains canonical. |
| Category 1: Type safety baseline | Pass with caveat | Counts and `pnpm type-check` output exist. Caveat: `e2e/` is excluded from workspace type-checking. |
| Category 2: Bundle baseline | Pass with caveat | Production build and treemap artifact exist. Caveat: treemap generation is not reproducible from checked-in config/deps. |
| Category 3: API response baseline | Pass with caveat | Seed floor met and 15 load-test JSONs exist. Caveat: numbers are localhost floors and use an autocannon percentile proxy. |
| Category 4: DB query baseline | Pass | Per-flow query counts, slow-query `EXPLAIN ANALYZE`, missing-index findings, and N+1 findings exist. This category now matches the PRD baseline requirement. |
| Category 5: Test coverage baseline | Provisional | API/web coverage and 3 E2E runs exist. Caveat: web tests were edited during the audit and E2E summary JSONs are internally inconsistent, so stdout logs are authoritative. |
| Category 6: Runtime/error baseline | Incomplete | Scenario evidence exists, but the PRD explicitly asks for console errors/warnings during normal usage; that clean count is missing. |
| Category 7: Accessibility baseline | Incomplete | Lighthouse, axe, and keyboard walks exist, but the PRD explicitly asks for VoiceOver/NVDA testing; no real screen-reader transcript exists. |
| Phase 2 improvements | Fail | Taskmaster tasks 10-17 are pending. No before/after improvement proof exists. |
| Per-category improvement docs | Fail | `orientation/improvements/` is absent. |
| Discovery write-up | Fail | `orientation/discovery.md` is absent. |
| AI cost analysis | Fail | `orientation/ai-cost-analysis.md` is absent. |
| Demo video / script | Fail | Demo artifacts are absent. |
| Public deployment | Fail | No deployment proof or deployment write-up exists. |
| Social post | Fail | No social post artifact exists. |
| Branch / commit hygiene | Fail | Current work is on `master`, with unstaged modifications and many untracked artifacts; no labeled improvement branches are present. |

## Highest-Priority Corrections

1. Run and record the missing Category 6 normal-usage console pass. Use a clean browser session, walk the core pages, and record exact error and warning counts plus route names.
2. Run and record the missing Category 7 screen-reader pass. At minimum: VoiceOver on `/my-week` and a document editor page, with task notes for navigation, labels, focus order, and editor interaction.
3. Decide how to handle the four modified web test files. Either revert them before claiming a pure Phase 1 audit, or explicitly move them into Phase 2 as a test-quality improvement with before/after evidence.
4. Make bundle visualization reproducible. Commit the visualizer dependency/config or a checked-in script that regenerates `orientation/baselines/bundle/bundle-baseline.html`.
5. Complete the pending Phase 2 tasks and write one improvement document per category with before/after measurements under identical conditions.
6. Add the missing final-submission artifacts: discovery, AI cost analysis, demo plan/video link, deployment proof, social post text/link, and README setup/reproduction guidance.
7. Clean repository hygiene before submission: labeled branches, clean status, committed baseline artifacts, and no generated coverage HTML unless intentionally tracked.

## Evidence Notes

- `orientation/audit-report.md` is now more honest than before, but it should still be treated as **provisional** because the PDF gaps above remain.
- `orientation/baselines/db-baseline.txt`, `orientation/baselines/queries-flow-{1..5}.log`, and `orientation/baselines/explain-flow-{1..5}.txt` satisfy the Category 4 baseline expectations.
- `orientation/baselines/test-coverage/full-report.md` is stale and contradicts newer coverage files. Prefer `api-coverage.txt`, `web-coverage.txt`, and E2E stdout logs.
- `orientation/baselines/type-safety/counts.txt` contains stale wording about a sandbox-blocked type-check. Prefer `type-safety/tsc-output.txt` plus the corrected audit-report section.
- The current `git diff` includes four modified web test files:
  - `web/src/components/editor/DetailsExtension.test.ts`
  - `web/src/hooks/useSessionTimeout.test.ts`
  - `web/src/lib/document-tabs.test.ts`
  - `web/src/styles/drag-handle.test.ts`

## Bottom Line

The current work can be defended as a strong baseline investigation, especially after the Category 4 repair, but it cannot honestly be submitted as complete PRD work. The next pass should close the two remaining Phase 1 measurement gaps, resolve the audit-purity problem, then execute and document Phase 2.
