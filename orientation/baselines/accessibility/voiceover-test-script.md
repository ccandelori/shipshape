# Cat 7 — VoiceOver screen-reader test script

**Status:** Script ready, results unfilled. Run on macOS with VoiceOver.
**Driver:** human (you), not automated. Claude Code can't drive VoiceOver — it sits behind macOS Accessibility and requires audio/keyboard input only a real user can provide.
**Target browser:** Safari (best VoiceOver integration) or Chrome 138+ if you prefer.
**Stack:** local dev — `pnpm dev` (web :5173, api :3000) with a seeded docker DB (`docker compose up -d`).

Record observations inline by replacing each `[ ] ` checkbox and the `> _record here_` blockquote stubs as you go. When done, save a copy as `voiceover-results-YYYY-MM-DD.md` so the baseline survives even if the script template changes.

---

## 1. Setup — do this once before starting

1. Quit any other apps that grab the audio output (Slack calls, Spotify, etc.) — VoiceOver's voice should be the only thing speaking.
2. **Turn VoiceOver ON:** press `Cmd+F5`. (You can also: System Settings → Accessibility → VoiceOver → Enable. Or Touch ID three-quick-press.)
3. In VoiceOver Utility (`VO+F8`):
   - **General** → keep default rate (~ 50%) so you can hear announcements clearly.
   - **Verbosity** → set Text to *Medium*; Punctuation to *Some*.
   - **Web** → make sure *Auto Web Spots* is **off**; turn *Single-Key Quick Nav* **on** (lets you press `H` for next heading without the VO modifier — speeds things up).
4. Open the target browser **after** VoiceOver is on. Sign in as `dev@ship.local` / `admin123`.
5. Open this file in a second window so you can take notes while testing.

### Notation

- `VO` = `Control + Option`. Everything VoiceOver uses is prefixed with these two keys.
- `VO+→` = next item; `VO+←` = previous item; `VO+Space` = activate.
- `VO+H` = next heading; `VO+L` = next link; `VO+J` = next form control; `VO+U` = open rotor.
- `Tab` = next focusable element (browser native, not VO-driven).

### Pass / Fail rubric

For each route, a "pass" requires **all four**:

1. **Navigation:** every interactive control on the page is reachable via either `Tab` or `VO+→` and announced.
2. **Labels:** every focused element has an announcement that names *what it is* — not just "button" or "image" or "empty group."
3. **Focus order:** focus moves in a logical reading order (top→bottom, left→right). No surprise jumps to off-screen widgets or hidden modals.
4. **Editor interaction (Flow B only):** typing in the document body produces announcements that match the typed characters; commands (slash menu, bold, etc.) are announced when invoked.

Anything that fails one of those four is a finding. Record it in the matching subsection below with: which element, what VoiceOver said (or didn't say), and what should have been said.

---

## Flow A — Dashboard at `/my-week`

The PRD audit names this route specifically (dashboard / weekly view). Goal: confirm the per-person weekly plan, retros, and standup widgets all survive a screen-reader pass.

### A.1 Initial load

1. Navigate to `http://localhost:5173/my-week`. Wait for VoiceOver to finish the page-load announcement.
2. Record what VoiceOver says about the page itself when it lands:
   > _e.g. "My Week, web content has 5 headings, 12 links" — paste the exact phrase._

3. Press `VO+H` repeatedly to walk every heading on the page. List them in order:
   - [ ] H1: _____
   - [ ] H2: _____
   - [ ] H3: _____
   - [ ] _continue_

4. Verify the page has exactly **one** `<h1>` and that subsequent headings nest sanely (no `<h1>` → `<h4>` jumps). Note any nesting issues:
   > _record here_

### A.2 Focus order via Tab

1. From the top of `/my-week`, press `Tab` repeatedly until you land back where you started (or until focus visibly exits the document).
2. Record the sequence — write the announcement VoiceOver makes for each focused element:

   ```
    1. ______
    2. ______
    3. ______
    4. ______
   ```
   _Keep going until the loop closes. Aim for 15–25 stops; if it's more than 40 something is wrong._

3. Confirm focus is **visible** on every stop (you can see a ring or outline). Record any stop where focus is invisible:
   > _record here_

### A.3 Standup widget

1. Find the standup card (`AccountabilityBanner` / today's standup prompt). With VoiceOver focused on it:
   - [ ] The card has a meaningful accessible name (not just "group" or "region")
   - [ ] Status (e.g. "due", "posted") is announced as part of the name or via `aria-describedby`
   - [ ] The primary CTA button has a real label ("Post standup" — not "Button")

2. Findings:
   > _record here_

### A.4 Per-person weekly plan

1. Tab into one team-member's row. Confirm:
   - [ ] Person name is announced
   - [ ] Their plan items are reachable individually
   - [ ] Completion/status state is announced (e.g. "done" / "in progress")

2. Findings:
   > _record here_

### A.5 Retros and action items

1. Locate the retro section / action-items modal trigger.
   - [ ] Retro entries are announced with author + content
   - [ ] If a modal opens, focus is moved into it and Esc closes it back to the trigger

2. Findings:
   > _record here_

### A.6 Flow A verdict

- Navigation pass: `[ ] yes / [ ] no` — why: _____
- Labels pass: `[ ] yes / [ ] no` — why: _____
- Focus order pass: `[ ] yes / [ ] no` — why: _____
- Overall: `[ ] PASS / [ ] FAIL`

---

## Flow B — Document editor (wiki)

Target document: `/documents/57895cfe-dcba-419a-8dbc-a919a846c0b7` (matches the wiki used by other Phase 1 captures so screenshots/results line up). If the doc isn't present in your seed, pick any wiki doc from `/docs` and write its UUID below:

> Doc UUID used: ______

### B.1 Editor surface

1. Navigate to the doc URL above. Wait for the editor to mount and the WebSocket to connect.
2. Press `VO+H` once: VoiceOver should announce the document title as the first heading. Record:
   > _record here_

3. Press `Tab` from the title; verify focus enters the editor body (TipTap `ProseMirror`).
   - [ ] VoiceOver announces it as a text area / editable region
   - [ ] Announcement names the doc body (e.g. "Document body, editing")
   - [ ] If the announcement is "edit text" with no label, that's a finding.

4. Findings:
   > _record here_

### B.2 Editing announcements

1. With focus in the body, type the sentence: `The quick brown fox.`
2. VoiceOver should echo characters or words as you type (depending on Verbosity setting). Record what it does:
   > _record here_

3. Select the word `quick` (double-click is allowed since we're testing screen reader, not keyboard-only). Press `Cmd+B`. VoiceOver should announce the formatting change.
   - [ ] Bold announced (e.g. "bold on" or similar)
   - [ ] If no announcement, that's a finding.

4. Findings:
   > _record here_

### B.3 Slash command menu

1. Place caret at end of a line. Type `/`. The slash menu should open.
   - [ ] VoiceOver announces a list / menu opening
   - [ ] First option is announced
   - [ ] Arrow keys move announcement to next item
   - [ ] Esc closes it and announces return to editor

2. Findings:
   > _record here_

### B.4 Properties sidebar

1. With the editor focused, Tab forward until you reach the properties sidebar (rightmost panel). Walk each control:
   - [ ] Sidebar collapse button is labeled ("Collapse sidebar" / "Expand sidebar")
   - [ ] Each property (status, owner, dates, etc. for non-wiki types) is reachable and labeled
   - [ ] Inputs / selects announce their current value as part of the label

2. Findings:
   > _record here_

### B.5 Icon rail + tabs (if applicable)

1. The 4-panel layout has an icon rail on the far left. Walk it with `VO+→`:
   - [ ] Each icon button has a label (Docs, Issues, Projects, etc.) — not "button" alone

2. Findings:
   > _record here_

### B.6 Flow B verdict

- Navigation pass: `[ ] yes / [ ] no` — why: _____
- Labels pass: `[ ] yes / [ ] no` — why: _____
- Focus order pass: `[ ] yes / [ ] no` — why: _____
- Editor interaction pass: `[ ] yes / [ ] no` — why: _____
- Overall: `[ ] PASS / [ ] FAIL`

---

## Summary (fill in at the end)

| Flow | Pass | Findings count | Severity (high/med/low) |
|---|---|---:|---|
| A — /my-week | [ ] | __ | __ |
| B — Editor   | [ ] | __ | __ |

### Top 3 highest-severity findings

1. _____
2. _____
3. _____

### Notes for Phase 2 improvements

> _record here — e.g. "AccountabilityBanner card has no aria-label", "icon-only buttons in icon rail rely on tooltip text only"._

---

## After running

1. Save this file as `orientation/baselines/accessibility/voiceover-results-YYYY-MM-DD.md` (with today's date).
2. Commit on the `feat/phase2-cat-7-accessibility` branch.
3. Turn VoiceOver off with `Cmd+F5`.

This closes the PRD's Cat 7 baseline gap. Any "no" entries above become candidate work items for Cat 7 Phase 2 improvements.
