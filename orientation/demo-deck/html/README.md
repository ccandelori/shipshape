# ShipShape Audit Deck — Handcoded HTML version

Self-contained 28-slide HTML deck, no framework. Built when the Slidev canvas
constraints stopped letting dense tables fit. Federal audit-report aesthetic:
light background, dark text, single accent color, sans-serif body, conservative
typography.

## View

```bash
open orientation/demo-deck/html/index.html
```

Any modern browser. No build step, no server, no dependencies. The whole thing
is one `index.html`, one `styles.css`, one `script.js`.

For recording: hit `F` to fullscreen.

## Keys

| Key | Action |
|---|---|
| `→` `space` `j` `PageDown` | next slide |
| `←` `k` `PageUp` | previous slide |
| `Home` | first slide |
| `End` | last slide |
| `F` | toggle fullscreen |
| `N` | toggle presenter-notes overlay at the bottom |
| click (right half / left half) | next / previous |

The slide counter and progress bar are at the bottom-right and top, respectively.

## Files

- `index.html` — the deck (28 `<section>` slides, each a viewport)
- `styles.css` — the design system (federal audit-report aesthetic)
- `script.js` — keyboard + click nav + notes toggle
- `README.md` — this file

## Presenter notes

Each slide has an `<aside class="notes">` element with the spoken script. Press
`N` to show the notes overlay at the bottom of the screen. The notes are
identical to the Slidev presenter notes in `../slides.md` / `../slides-v1.md`.

## Why this exists

The Slidev deck (`../slides.md`, dracula theme) had overflow issues — the
canvas size + theme defaults wouldn't fit the density of the per-category
deliverable tables. This deck uses CSS to let tables size themselves naturally
within a 100vh × 100vw section, with controlled padding and font scaling.

## Print to PDF

The CSS has a print stylesheet — `Cmd-P` → save as PDF for a static artifact.
Each slide becomes a page; counter/progress/hint UI is hidden.

## Fallback chain

If something breaks, the Slidev decks are still under `../`:
- `../slides.md` — current Slidev version (28 slides, dracula)
- `../slides-v1.md` — earlier Slidev version (22 slides, dracula)
