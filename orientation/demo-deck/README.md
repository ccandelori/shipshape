# ShipShape Audit — Demo Deck

Slidev presentation for the GFA Week 4 ShipShape audit demo video (PDF requirement: 3–5 min walk-through of audit findings + improvements).

## Run

```bash
cd orientation/demo-deck
pnpm install
pnpm dev          # opens http://localhost:3030
```

Press `o` for overview, `space` to advance, `g` for go-to-slide.

## Export

```bash
pnpm build        # → dist/ static SPA, deployable anywhere

# PDF export needs playwright-chromium (downloads a 169 MB Chromium):
pnpm add -D playwright-chromium
pnpm export       # → slides-export.pdf
```

## Content

`slides.md` — 14 slides, ~3-5 min walk-through:

1. Cover
2. The brief (7 categories, 36-hour gate)
3. Bottom line (Phase 1 met, 4 critical findings)
4. What works (structurally sound parts)
5. Critical findings section divider
6. Critical #1 — yjsToJson silent NULL
7. Critical #2 — WS session expiry
8. Critical #3 + #4 (two-col: Accountability N+1, no global error handler)
9. Per-category baselines section divider
10. Cats 1–3 baselines
11. Cats 4–7 baselines
12. Methodology rigor
13. Phase 2 plan section divider
14. Phase 2 plan
15. What this audit cost
16. Closing

Presenter notes (HTML comments) carry the spoken narrative for each slide.

## Why a separate Slidev project

This is a one-off demo deck, not a workspace package. It lives outside the `pnpm-workspace.yaml` listing (which covers `api/`, `web/`, `shared/`). `pnpm install` here creates a local `node_modules` independent of the root install.
