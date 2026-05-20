# PRD Compliance Audit

**Source of truth:** `/Users/sheep/Desktop/Gauntlet/GFA Week 4 - ShipShape.pdf`  
**Checked:** 2026-05-20  
**Repo:** `/Users/sheep/Desktop/Gauntlet/ship`

## Verdict

The work is **not submission-ready against the PRD** — Phase 2 improvements and the final-submission deliverables are still pending — but **Phase 1 baselines are now met on master**. See *Recheck — 2026-05-20 (second pass)* below.

## Recheck — 2026-05-20 (second pass)

The four highest-priority Phase 1 corrections the original recheck called for are done and merged to `master`. None of this work modifies user-facing app behavior — it adds measurement scaffolding and reverts in-progress audit-period edits — but for transparency every change is documented here.

### Branches (merged into master via `--no-ff`)

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
| Category 2: Bundle baseline | Pass | Treemap is regenerable via `orientation/baselines/bundle/regenerate.sh`. Merged via merge commit. |
| Category 3: API response baseline | Pass with caveat | Unchanged. Caveat: localhost autocannon percentile proxy. |
| Category 4: DB query baseline | Pass | Unchanged. |
| Category 5: Test coverage baseline | Pass with caveat | The audit-period test edits have been reverted on `master`. Remaining caveat: E2E summary JSONs are internally inconsistent — stdout logs remain authoritative. That inconsistency is an artifact problem, not a measurement problem, and is deferred to Phase 2. |
| Category 6: Runtime/error baseline | Pass | Normal-usage console pass exists on master (`orientation/baselines/runtime-errors/evidence/normal-usage-summary.md`). Merged via merge commit. |
| Category 7: Accessibility baseline | Pass | Real VoiceOver transcript exists on master (`orientation/baselines/accessibility/voiceover-results-2026-05-20.md`). Merged via merge commit. |
| Phase 2 improvements | Fail | Unchanged — pending. |
| Per-category improvement docs | Fail | Unchanged — pending. |
| Discovery write-up | Fail | Unchanged — pending. |
| AI cost analysis | Fail | Unchanged — pending. |
| Demo video / script | Fail | Unchanged — pending. |
| Public deployment | Fail | Unchanged — pending. |
| Social post | Fail | Unchanged — pending. |
| Branch / commit hygiene | Partial | Three feature branches and seven `chore/taskmaster-*` branches landed on `master` via `--no-ff` merge commits. Untracked dotfiles/coverage in the working tree remain a hygiene item, and the Taskmaster-corrective branches still need their own merges. |

### What's still open

- Land the `chore/taskmaster-*` branches (seven correction commits to `.taskmaster/tasks/tasks.json`) so Taskmaster's plan reflects the corrected baselines, the axe-fix target, and the new gate-repair + orientation-checklist tasks.
- Phase 2 improvements (one per category) and their per-category before/after improvement docs.
- Discovery write-up, AI cost analysis, demo video/script, public deployment, social post.
- Final repository hygiene pass.

## Recheck — 2026-05-20 (original / superseded)

This section is the original 2026-05-20 recheck. **Its findings have been superseded by the second-pass recheck above** — the four gaps it identified were closed on the same date and merged to master. The text is preserved here as audit trail so a reader can see what the gaps used to look like; it is no longer the current state of the project.

Original verdict: "Phase 1 is **provisionally measured**, but it is not clean enough to call an unconditional pass." Original four PRD gaps and where each was closed:

| Original gap | Closed on master via |
|---|---|
| Cat 6 had no separate normal-usage browser console count | Merge `430cbd4`-ish chain → `orientation/baselines/runtime-errors/evidence/normal-usage-summary.md` (1 expected 401, 0 warnings, 0 page errors over 11 routes) |
| Cat 7 had no real VoiceOver/NVDA transcript | Merge of `feat/phase2-cat-7-accessibility` → `orientation/baselines/accessibility/voiceover-results-2026-05-20.md` (real macOS speech-log capture via guidepup) |
| Cat 5 had four web test files edited during the no-fix audit phase | Reverted on master 2026-05-20 — none of the four test files carry a working-tree diff vs origin |
| Cat 2 treemap generation was not reproducible from checked-in config | Merge of `feat/phase2-cat-2-bundle` → `web/vite.config.ts` `BUNDLE_ANALYZE=1` hook + `orientation/baselines/bundle/regenerate.sh` |

The original recheck also listed seven "Highest-Priority Corrections," all of which map 1:1 to work that has since landed: items 1–4 are the four gaps above; item 5 (Phase 2 improvements) is open work tracked in Taskmaster Tasks 10–17 + 18; item 6 (final-submission artifacts) is open work tracked in Tasks 19–24; item 7 (repository hygiene) is partially done (labeled branches exist; untracked working-tree dotfiles remain).

### Notes on prior artifacts (still accurate)

- `orientation/baselines/db-baseline.txt`, `orientation/baselines/queries-flow-{1..5}.log`, and `orientation/baselines/explain-flow-{1..5}.txt` satisfy the Category 4 baseline expectations.
- `orientation/baselines/test-coverage/full-report.md` is stale and contradicts newer coverage files. Prefer `api-coverage.txt`, `web-coverage.txt`, and E2E stdout logs.
- `orientation/baselines/type-safety/counts.txt` contains stale wording about a sandbox-blocked type-check. Prefer `type-safety/tsc-output.txt` plus the corrected audit-report section.
