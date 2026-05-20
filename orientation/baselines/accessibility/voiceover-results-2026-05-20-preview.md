# Cat 7 — VoiceOver walk transcript (2026-05-20)

**Captured:** 2026-05-20T16:16:32.813Z
**Driver:** `orientation/baselines/accessibility/voiceover-walk.mjs` — guidepup + Playwright (Chromium, headed)
**Stack:** http://localhost:4173, docker postgres

This is an actual VoiceOver spoken-phrase log (not a proxy). guidepup
reads VO's speech-log facility, so every `phrase` below is what VO
literally said as it walked the page with VO+→.

## Routes covered

- **Dashboard (/my-week)** — `/my-week`
- **Document editor (wiki)** — `/documents/57895cfe-dcba-419a-8dbc-a919a846c0b7`

## Dashboard (/my-week) (`/my-week`)

Step | What VoiceOver said
---:|---
1 | New Tab description, New tab button. You are currently on a button, inside of a group. To click this button, press Control-Option-Space. Press Control-Option-Command-Slash to bring up the more content menu. To exit this group, press Control-Option-Shift-Up Arrow.
2 | Search tabs menu pop up pop up button. You are currently on a pop up button, inside of a group. To display a list of options, press Control-Option-Space. To exit this group, press Control-Option-Shift-Up Arrow.
3 | toolbar item palette. You are currently on a toolbar item palette, inside of a group. To interact with the items on this toolbar, press Control-Option-Shift-Down Arrow. To exit this group, press Control-Option-Shift-Up Arrow.
4 | Ship \| Ship web content. You are currently on a web content, inside of a group. To enter the web area, press Control-Option-Shift-Down Arrow. To exit this group, press Control-Option-Shift-Up Arrow.. iTerm2, Alert, Session ✳ Review PRD compliance audit document (node) #1: Claude is waiting for your input group To open the notifications menu, press Control-Option-N.
5 | Ship \| Ship web content
6 | Ship \| Ship web content
7 | Ship \| Ship web content
8 | Ship \| Ship web content
9 | Ship \| Ship web content
10 | Ship \| Ship web content
11 | Ship \| Ship web content
12 | Ship \| Ship web content
13 | Ship \| Ship web content
14 | Ship \| Ship web content
15 | Ship \| Ship web content
16 | Ship \| Ship web content
17 | Ship \| Ship web content. Slack, Gauntlet AI, cohort-main, Matt Hulme: @here Hey everyone my name is Matt Hulme, I was in Cohort 3 and now work at Gauntlet. I'm here to be a resource and help you however I can during your Cohort. I'll do rounds 3x a week. First round starts now! Excited to meet you all. group To open the notifications menu, press Control-Option-N.
18 | Ship \| Ship web content. Notification Center window empty scroll area. Google Chrome for Testing Ship \| Ship - Google Chrome for Testing window Ship \| Ship web content
19 | Ship \| Ship web content. You are currently on a web content, inside of a group. To enter the web area, press Control-Option-Shift-Down Arrow. To exit this group, press Control-Option-Shift-Up Arrow.
20 | Ship \| Ship web content
21 | Ship \| Ship web content
22 | Ship \| Ship web content
23 | Ship \| Ship web content
24 | Ship \| Ship web content
25 | Ship \| Ship web content
26 | Ship \| Ship web content
27 | Ship \| Ship web content
28 | Ship \| Ship web content
29 | Ship \| Ship web content
30 | Ship \| Ship web content

## Document editor (wiki) (`/documents/57895cfe-dcba-419a-8dbc-a919a846c0b7`)

Step | What VoiceOver said
---:|---
1 | Drag to reorder block button. You are currently on a button. To click this button, press Control-Option-Space.
2 | end of main. You are currently on a main, inside of web content. To exit this web area, press Control-Option-Shift-Up Arrow.
3 | Document properties complementary. You are currently on a complementary, inside of web content.
4 | Properties. You are currently on a selectable text.
5 | Collapse sidebar button, group. You are currently on a button, group. To click this button, press Control-Option-Space. Press Control-Option-Command-Slash to bring up the more content menu.
6 | Type. You are currently on a selectable text.
7 | Wiki Document type menu pop up collapsed button. You are currently on a button. To display a list of options, press Control-Option-Space.
8 | Maintainer. You are currently on a selectable text.
9 | Select maintainer... dialog pop up collapsed button. You are currently on a button. To display a list of options, press Control-Option-Space.
10 | Visibility. You are currently on a selectable text.
11 | Workspace dimmed dialog pop up collapsed button. Only the document creator can change visibility You are currently on a button. This item is dimmed.
12 | Created. You are currently on a selectable text.
13 | May 19, 2026. You are currently on a selectable text.
14 | Updated. You are currently on a selectable text.
15 | May 19, 2026, 10:20 PM
16 | heading level 3 Backlinks. You are currently on a heading level 3.
17 | No backlinks. You are currently on a selectable text.
18 | end of Document properties complementary. You are currently on a complementary, inside of web content. To exit this web area, press Control-Option-Shift-Up Arrow.
19 | group. You are currently on a group, inside of web content. To interact with items in this group, press Control-Option-Shift-Down Arrow. To exit this web area, press Control-Option-Shift-Up Arrow.
20 | group
extra-marker | --- begin extra: focus editor body via Playwright, then type and capture echo ---
extra | (playwright) editor body focused
extra | group
extra | text entry area Start writing... Insertion at beginning of text. main. You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra | You are currently on a text area.
extra-marker | --- end extra: focus editor body via Playwright, then type and capture echo ---

## Notes

- Step labels `extra` denote scripted post-walk actions (e.g. typing into the editor body) included for editor-interaction coverage.
- guidepup occasionally captures very long compound phrases when VO surfaces system context (e.g. iTerm window state). These appear as the first step of a route and can be safely ignored when assessing the route's own a11y.
- For findings, scan for phrases that say `button` or `group` with NO descriptive name preceding them, or focus moves to elements VO can't name. Those are the Phase 2 candidates.
