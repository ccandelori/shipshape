# Demo Video — ShipShape Phase 2

The GFA Week 4 brief requires a 3-5 minute walkthrough of audit findings and Phase 2 improvements.

## Status

🟡 **Recorded once at ~10 minutes (overshot the 5-min target). Re-record + host pending.**

## Hosted URL

[FILL IN ONCE UPLOADED]

## Source assets in this repo

- HTML deck (the recorded version): [`orientation/demo-deck/html/index.html`](demo-deck/html/index.html)
- Slidev fallback (markdown): [`orientation/demo-deck/slides.md`](demo-deck/slides.md), [`slides-v1.md`](demo-deck/slides-v1.md)
- Read-aloud script: [`orientation/demo-deck/script.md`](demo-deck/script.md)

## Three-act target structure (re-record outline, ~5 min)

### Act 1 — The audit (0:00 – 1:30)

- Open: "Treasury TypeScript monorepo, real users, 73 Playwright tests, real-time collab via Yjs."
- Show `orientation/audit-report.md` table of contents on screen.
- One concrete finding: silent NULL persist. Show `evidence/yjs-to-json-null.md` (`content IS NULL = t`, `yjs_state = 96 bytes`).

### Act 2 — The fixes (1:30 – 4:00)

Lead with the three with the cleanest before/after:

1. **Bundle 587 → 142 kB gzip** (Cat 2). Show `orientation/baselines/bundle/build.txt` vs `after-build.txt` side by side.
2. **Dashboard slowest query 0.149 → 0.040 ms** (Cat 4). Show `explain-dashboard-issues.txt` vs `after-dashboard-issues.txt`.
3. **A11y 4 Critical + 4 Serious → 0/0** (Cat 7). Show `axe-summary.md` vs `after-axe-summary.md`.

### Act 3 — The reasoning (4:00 – 5:00)

- What surprised me most: the Yjs dual-persistence pattern (binary + JSON in the same row).
- What I changed about how I approach unfamiliar codebases: "read first, measure second, fix third" — and the AI multiplier on the read step.
- Wrap: link to the deployed fork (or the audit report if not yet deployed) + the CI workflow that pins the floor.

## Recording notes (carry over from Phase 1 attempt)

- Estimate read time × 1.7 to predict actual recording time (Phase 1 script estimated 6 min, recording was 10 min). For a 5-min target the script should silent-read in ~3 min.
- The HTML deck at `orientation/demo-deck/html/index.html` is the visual; open in Chrome → presentation mode.
- Voice the per-category numbers conservatively. Lead with the three above; don't try to cover all 7 in equal depth.

## Hosting choice

[FILL IN: YouTube unlisted / Loom / Vimeo / other]

The brief doesn't require a specific platform — just that the link is public and the file is 3-5 min. Loom and YouTube unlisted both work.
