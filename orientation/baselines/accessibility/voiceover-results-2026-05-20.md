# Cat 7 — VoiceOver baseline (2026-05-20)

**Captured:** 2026-05-20
**Method:** Automated — `orientation/baselines/accessibility/voiceover-walk.mjs` drives Playwright (headed Chromium) to login and navigate; [guidepup](https://www.guidepup.dev/) starts VoiceOver and records the official macOS speech-log via `voiceOver.spokenPhraseLog()`. **Every "What VoiceOver said" line below is an actual VoiceOver utterance, not a proxy.**
**Stack:** local dev — docker postgres, web preview on :4173 (production build) and web dev on :5173. Both runs preserved as raw artifacts (see "Raw runs" below).

This document closes the PRD's Phase 1 Cat 7 baseline gap (the audit's "no real screen-reader transcript exists" finding). It curates the best phrases from two runs of the walker — see "Raw runs" for the unedited transcripts that back this summary.

## Raw runs

| File | Stack | What it captured well | What it didn't |
|---|---|---|---|
| [`voiceover-results-2026-05-20-dev-stack.md`](./voiceover-results-2026-05-20-dev-stack.md) | dev (`pnpm dev`, :5173) | Full `/my-week` walk (30 meaningful phrases — headings, named buttons, sections). Properties sidebar of the document editor. | Editor body walk got snagged on the Tanstack-query-devtools floating widget (dev-mode only). |
| [`voiceover-results-2026-05-20-preview.md`](./voiceover-results-2026-05-20-preview.md) | preview (`vite preview`, :4173, production build) | Document editor: clean properties-sidebar walk + editor body successfully focused via Playwright (VO announced "text entry area Start writing... Insertion at beginning of text"). | `/my-week` walk got stuck outside the web area (VO repeated "Ship \| Ship web content" 26 times without entering). |

The dev-stack run is authoritative for `/my-week`; the preview run is authoritative for the document editor. Both runs hit the same DB seed and the same code at commit `076a183`.

## Findings — `/my-week` (Dashboard)

Source: dev-stack run, steps 10–30.

### What VoiceOver announces correctly

| Element | VoiceOver utterance | Verdict |
|---|---|---|
| Page title | `main. You are currently on a heading level 1.` | ✅ H1 landmark present and announced |
| Current/Previous-week navigation | `Previous week button, group` | ✅ Named button (verb-first) |
| Date range header | `May 18 – May 24, 2026. You are currently on a selectable text.` | ✅ Plain-text date readable |
| Next week button | `Next week button, group` | ✅ Named |
| ASSIGNED PROJECTS section | `heading level 2 ASSIGNED PROJECTS` | ✅ Proper heading hierarchy |
| Project link | `link Ship Core - Core Features Ship Core` | ✅ Link text describes destination |
| WEEKLY PLAN section | `heading level 2 WEEKLY PLAN` | ✅ |
| Plan link with content | `link Submitted 1. Refactor data access layer 2. ...` | ✅ Full plan content read |
| WEEKLY RETRO section | `heading level 2 WEEKLY RETRO` | ✅ |
| Create-retro CTA | `+ Create retro for this week button` | ✅ Named (includes leading "+" which a screen reader speaks as "plus") |
| DAILY UPDATES section | `heading level 2 DAILY UPDATES` | ✅ |
| Per-day write-update buttons | `Mon5/18 + Write update button, group` | ⚠️ Day-and-date jammed together ("Mon5/18") — see findings |

### Findings — `/my-week`

1. **`Mon5/18 + Write update button`** (and other per-day write-update buttons): VoiceOver runs the day abbreviation and date together with no whitespace. Listeners get "Monfivesixteen" instead of "Monday, May 18". → Phase 2 candidate: add a space or proper `aria-label="Monday, May 18 — Write update"`.
2. **Per-day "Upcoming" labels** (Thu/Fri/Sat): announced as `Upcoming. You are currently on a selectable text.` with no association to which day. A user navigating linearly hears `Thu 5/21 ... Upcoming` and has to remember which day was last. → Phase 2 candidate: associate the status with the date via `aria-describedby` or restructure as `<button aria-label="Thursday, May 21 — upcoming, no update yet">`.

## Findings — Document editor (wiki)

Source: preview run, steps 1–20 and the `extra` block.

### Properties sidebar

| Element | VoiceOver utterance | Verdict |
|---|---|---|
| Properties landmark | `Document properties complementary. You are currently on a complementary, inside of web content.` | ✅ Proper landmark |
| Section heading | `Properties. You are currently on a selectable text.` | ⚠️ Plain text — should be a heading (see findings) |
| Collapse sidebar | `Collapse sidebar button, group` | ✅ Named |
| Type field label | `Type. You are currently on a selectable text.` | ⚠️ Selectable text not associated with the control below it |
| Type field control | `Wiki Document type menu pop up collapsed button` | ✅ Current value announced |
| Maintainer field control | `Select maintainer... dialog pop up collapsed button` | ✅ Named |
| Visibility (disabled) | `Workspace dimmed dialog pop up collapsed button. Only the document creator can change visibility You are currently on a button. This item is dimmed.` | ✅ Disabled state + reason announced |
| Created date | `Created. ... May 19, 2026.` | ✅ |
| Updated timestamp | `Updated. ... May 19, 2026, 10:20 PM` | ✅ |
| Backlinks heading | `heading level 3 Backlinks` | ✅ Proper heading |

### Editor body

| Step | VoiceOver utterance | Notes |
|---|---|---|
| `(playwright) editor body focused` | `text entry area Start writing... Insertion at beginning of text. main. You are currently on a text area.` | ✅ Editor announces as a text area with placeholder + insertion point |
| Typing echoes | `You are currently on a text area.` ×20 | ⚠️ See findings |

### Findings — Document editor

1. **"Properties" label is `<selectable text>`, not a heading.** Sidebar section names should be headings (or `aria-labelledby` on the landmark) so screen-reader users can jump to them with VO+H or rotor. → Phase 2 candidate.
2. **Field-label/control association is ambiguous.** "Type", "Maintainer", "Visibility", "Created", "Updated" announce as `selectable text` separately from their controls. Screen-reader users hear two stops per field instead of one labeled control. → Phase 2 candidate: wrap each in a proper `<label>` or use `aria-labelledby` on the control.
3. **Typing in the editor body does not produce per-character echoes** at default VoiceOver verbosity. VO only reports the current container (`text area`) on each keystroke. This is partly a VO setting (verbosity → typing echo) and partly a TipTap behavior — confirm whether ProseMirror is firing the input events VO needs to read keystrokes back. → Phase 2 candidate: test with VO verbosity set to "characters" and confirm; if still silent, investigate `aria-live` regions on the editor.
4. **No editor-specific landmarks.** The transcript shows `end of main` immediately followed by `Document properties complementary` — there's no `<region>` or named landmark for the editor body, so a user using rotor → Landmarks gets one entry for the whole page. → Phase 2 candidate: add `aria-label="Document body"` or `<section aria-label="...">` around the ProseMirror.

## Pass / fail summary (per PRD criteria)

| Criterion | `/my-week` | Editor (wiki) |
|---|---|---|
| Navigation: every interactive control reachable via VO+→ or Tab | ✅ Pass | ✅ Pass (sidebar) / ⚠️ Editor body only reachable via Tab or Playwright-click, not via `next()` chain |
| Labels: every focused element has a real name (not "button" alone) | ✅ Mostly pass — see findings #1, #2 on /my-week | ⚠️ Mixed — see findings #1, #2 on editor |
| Focus order: logical reading order | ✅ Pass | ✅ Pass |
| Editor interaction: typing/formatting announced | n/a | ⚠️ Partial — body focus announced, character echoes silent at default verbosity |
| **Overall** | **PASS with 2 findings** | **PASS with 4 findings** |

Both routes are operable with VoiceOver. The 6 findings above are Phase 2 candidates, not Phase 1 baseline failures.

## How to reproduce

```bash
# Prereqs: docker compose up -d; pnpm dev (or pnpm --filter @ship/web preview)
# macOS prereqs: iTerm has Accessibility + Automation permissions;
#                "Allow VoiceOver to be controlled with AppleScript" enabled
#                (the script sets this defaults key automatically).

# Production-build capture (recommended — no dev widgets):
pnpm --filter @ship/web preview        # in one terminal
node orientation/baselines/accessibility/voiceover-walk.mjs

# Dev-stack capture (includes HMR + devtools widgets):
WEB=http://localhost:5173 node orientation/baselines/accessibility/voiceover-walk.mjs
```

Output goes to `voiceover-results-<YYYY-MM-DD>.{md,json}`. The script will refuse to start VoiceOver if AppleScript control isn't enabled and will tell you exactly which checkbox to tick.
