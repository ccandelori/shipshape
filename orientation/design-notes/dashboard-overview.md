# Dashboard Overview redesign — notes

> Captured 2026-05-24. The Overview tab was redesigned away from a 7/5 column grid because the right column had visible vertical dead space below the CategoryList card, and because the same surface card vocabulary applied 4× was getting close to the "identical card grids" anti-pattern.

## Direction taken: A — Panoramic chart-first

**Premise.** The Overview answers one question in five seconds: *how's the platform?* The chart is the answer; everything else is supporting evidence.

**Layout (top to bottom, single column, full width):**
1. **Hero card** — bigger lollipop chart, legend baked in, footer with `N/total healthy` + small `Watch` caption
2. **Category scoreboard** — horizontal 7-cell strip (each cell = name + sparkline + headroom % + status pill, click drills into the Categories tab + scrolls to that cat's panel)
3. **Live status strip** — single horizontal panel: pulsing live/snapshot indicator + branch + commit + last run + duration + archived-run count

**What got removed from Overview:**
- DeepDives — duplicated content from Categories tab; now lives there only
- Operations cards — already on the Operations tab; teaser felt like filler

**Width policy:** shell `max-w-[1320px]` → `max-w-[1600px]`. More breathing room on big monitors, lets the chart and the 7-cell scoreboard stretch.

## Alternatives considered (kept here for traceability + future revert)

### B — Editorial 2-column with a real right rail

Keep the 7/5 grid but make the right column carry equal weight by filling it with distinct, varied modules (not "more cards"):

- Left column: hero + DeepDives stacked
- Right column (a real sidebar with varied content):
  - LiveStatus panel (top)
  - "Today's standout" — one auto-generated insight ("Type Safety holding 1.6% above threshold for 24 runs")
  - Recent activity timeline (last 5 runs as vertical strip)
  - Quick actions (Run check, View raw report, Open evidence)

Estimated effort: ~3h. Best fit if the goal is to keep the 2-column architecture and the column issue is "right rail feels empty" rather than "Overview is over-doing it."

### C — Inverted scoreboard-first

Lead with the 7-category scoreboard; the chart becomes supporting evidence:

- Top: full-width horizontal 7-cell scoreboard strip (the new CategoryScoreboard)
- Middle: smaller hero chart (now a trend-overview, not the headline)
- Bottom: live-status strip

Boldest move. Treats the chart as secondary. Closest to a true scoreboard you'd find on an SRE wall display.

**To revert from A to C:** swap the order in `OverviewTab.tsx`'s JSX from `Hero → Scoreboard → LiveStatus` to `Scoreboard → Hero → LiveStatus`, and shrink the chart's `min-h` in HeroCard.tsx so it doesn't dominate visually. The components themselves don't change.

## Files touched by Direction A

- `dashboard/src/tabs/OverviewTab.tsx` — rewritten to a single-column flex layout
- `dashboard/src/components/CategoryScoreboard.tsx` — new (7-cell horizontal strip)
- `dashboard/src/components/LiveStatusStrip.tsx` — new (compact horizontal variant of LiveStatus)
- `dashboard/src/App.tsx` — shell `max-w-[1320px]` → `max-w-[1600px]`

`LiveStatus.tsx` and `Operations.tsx` remain in the codebase but no longer mount on Overview. They mount on their respective tabs (Operations tab uses Operations; LiveStatus is currently unused — leave for potential reuse).
