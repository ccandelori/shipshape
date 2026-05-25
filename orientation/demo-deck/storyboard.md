# ShipShape Demo — Click-by-Click Storyboard

> Companion to `script-live.md`. Every screen action, in order, synced to the
> four acts. Read the narration from `script-live.md`; do the actions here.
> Tabs in the dashboard: **Overview · Categories · Evidence · Audit & Discovery · Operations**.

---

## Pre-flight (before you hit record)

**Browser (Acts 1, 2, 4):**
1. Open `http://143.198.163.184/dashboard/` in Chrome.
2. Fullscreen (Cmd+Ctrl+F). Set zoom so the Remediation Impact ledger's seven rows fit without scrolling (Cmd+Minus once or twice).
3. Hide the bookmarks bar (Cmd+Shift+B), turn on Do Not Disturb, close other tabs.
4. Hard-refresh (Cmd+Shift+R) right before recording so the ledger's mount animation plays fresh on the first Overview shot.

**Terminal (Act 3):** the live probe needs the patched, seeded Ship API on `:3000`.
1. `curl -s http://localhost:3000/health` → expect `{"status":"ok"}`. If not:
   - `cd /Users/sheep/Desktop/Gauntlet/ship && pnpm dev:api &` then wait for health.
   - If login later fails: `pnpm db:seed` (creates `dev@ship.local` / `admin123`).
2. Confirm the API is on the **patched** collaboration code (this branch). If unsure, restart `pnpm dev:api` so it reloads.
3. Open a clean terminal: `cd /Users/sheep/Desktop/Gauntlet/shipshapesec`, large font, dark theme, window sized so ~25 lines show.
4. Have `fixes/fix-03/repro-before.txt` open in a second pane or editor for the "before."

**Recording:** 1080p minimum, cursor-highlight on if your tool has it. Record Act 3 as its own take — it has a live command and is the riskiest to fluff.

---

## Act 1 — The audit · ~0:00–1:00

| # | Action | Lands on / shows | Narration cue |
|---|--------|------------------|---------------|
| 1 | Start on **Overview** (don't click yet) | Ledger + 7 dials visible | "Ship is a government web application…" |
| 2 | Click **Audit & Discovery** tab | Opens on the *Executive audit* sub-section | "The audit assessed seven quality categories…" |
| 3 | Scroll to **Critical findings — live-confirmed** | The silent-NULL defect (C-1) in the list | "The clearest one: a silent data-loss path…" |
| 4 | Hold on that finding | — | "…it shows up when someone's work disappears." |

> Tip: the silent-NULL detail also lives in **Categories → Cat 6 (Runtime Errors)** with evidence links, if you'd rather show it there. Pick one; don't show both.

---

## Act 2 — The remediation · ~1:00–2:30

| # | Action | Lands on / shows | Narration cue |
|---|--------|------------------|---------------|
| 5 | Click **Overview** tab | Remediation Impact ledger at top; bars animate in | "Phase 2 remediated every category. This is the impact ledger…" |
| 6 | Move cursor down the rows as you name each | bundle / DB / API / a11y / tests rows | "587 to 143 kilobytes… 0.149 to 0.040 milliseconds… 81 percent… eight to zero… thirty-three tests." |
| 7 | Click a ledger row — **Bundle Size** or **DB Query** | Jumps to **Categories** tab, scrolls to that panel | (pause) |
| 8 | Click the panel header to **expand** it | Before/after chart + evidence links + reproduce command | "Every number traces to an evidence file…" |

> The drill scrolls to the panel but leaves it collapsed (showing its summary). Click the header to expand and reveal the before/after chart. Rehearse this one click.

---

## Act 3 — The security probe · ~2:30–3:45

| # | Action | Shows | Narration cue |
|---|--------|-------|---------------|
| 9 | Cmd-Tab to the terminal | clean prompt in `shipshapesec/` | "…the eighth deliverable is an active security probe…" |
| 10 | `cat fixes/fix-03/repro-before.txt` | the documented **5 × CRITICAL** WS baseline | "Against Ship it found seventy-one issues… Five critical findings, one root cause." |
| 11 | Run the live probe (command below) | findings stream; ends **0 critical, 2 medium** | "That is now fixed…" |
| 12 | `curl -s http://localhost:3000/health` | `{"status":"ok"}` | "…the server survives the full frame-and-burst suite." |

Command for step 11 (one line):
```
./shipshapesec scan --headless --only websocket \
  --target http://localhost:3000 --ws ws://localhost:3000 \
  --login dev@ship.local:admin123 \
  --ship-dir /Users/sheep/Desktop/Gauntlet/ship
```

> **Honesty note:** the "before" (5 critical) is shown from the documented baseline (`repro-before.txt`), not re-run live — the code is already patched, so a live run shows the *fixed* state. Don't fake a live "before."
>
> **Flair option:** drop `--headless` to launch the Bubble Tea TUI (live scan dashboard) instead of streamed text. More impressive, but rehearse the picker → dashboard flow; headless is the predictable take.

---

## Act 4 — Reflection + wrap · ~3:45–4:45

| # | Action | Lands on / shows | Narration cue |
|---|--------|------------------|---------------|
| 13 | Cmd-Tab to browser; click **Audit & Discovery** → **Discovery** sub-nav | the Yjs dual-write finding | "Ship persists each document twice…" |
| 14 | Click **AI cost** sub-nav | the $40 / $9k figures | "…about nine thousand dollars; on a flat subscription it cost about forty." |
| 15 | Click **Overview** tab | full dashboard, ledger + dials | "Two artifacts came out of this… both are live, both reproducible." |
| 16 | Hold on the full Overview, then stop recording | — | (end) |

---

## After recording

1. Trim head/tail, export 1080p.
2. Upload (YouTube unlisted or Loom — brief accepts any public link).
3. Paste the URL into `orientation/demo-video.md` (replace `[FILL IN ONCE UPLOADED]`).
4. Re-time: target 3–5 min. If long, apply the cut-downs at the bottom of `script-live.md`.
