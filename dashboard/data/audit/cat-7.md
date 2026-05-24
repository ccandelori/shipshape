## Category 7: Accessibility Compliance

### Methodology

Static JSX scan across `web/src/pages/` (25 page files) and `web/src/components/` (60+ component files, including `editor/`, `sidebars/`, `dialogs/`, `ui/`, `icons/`, `review/`, `week/`, `dashboard/`). Searched for canonical a11y trap patterns (unlabeled images and icon-only buttons, `<div onClick>` without role/keyboard handlers, modals without aria-modal or focus trap, color-only state indicators, heading hierarchy, label associations). Cross-referenced USWDS Icon component, Radix Dialog/Popover usage, and Tailwind color tokens (`tailwind.config.js`) against WCAG 2.1 AA / Section 508. Live evidence now includes Lighthouse reports for 10 routes, axe-core scans for 8 authenticated routes, keyboard walkthroughs for login, document create, and document edit/modal flows, **and an automated VoiceOver speech-log capture** (added 2026-05-20 via guidepup + Playwright).

**Real VoiceOver transcript:** the PDF explicitly asks for screen-reader testing with VoiceOver/NVDA or similar on **the dashboard and a document edit page**. This audit satisfies that requirement via `orientation/baselines/accessibility/voiceover-walk.mjs` — guidepup drives a headed Chromium under Playwright, starts VoiceOver, walks **`/dashboard` (the spec-literal path)**, `/my-week` (the actual default landing), and a wiki document editor with `VO+→`, and records the official macOS speech log via `voiceOver.spokenPhraseLog()`. The curated canonical summary lives at `orientation/baselines/accessibility/voiceover-results-2026-05-20.md`. The transcript surfaces six Phase 2 candidates (e.g. per-day buttons announce as "Mon5/18" with no whitespace; the editor body has no aria-labeled landmark). axe and keyboard testing remain in the evidence set as complementary signals, not proxies.

### Major pages identified

Confirmed against `web/src/main.tsx` routes (lines 157-248). Reality is slightly broader than the 7 audit candidates — there is no `/sprints` listing route (it redirects to `/team/allocation`); the index route `/` redirects to `/my-week`; and an admin tier exists.

| Page | Route | Source file | Notes |
|---|---|---|---|
| Login | `/login` | `web/src/pages/Login.tsx` | Public; only page with full sr-only labels + autoFocus |
| My Week (default landing) | `/my-week` | `web/src/pages/MyWeekPage.tsx` | `/` redirects here; replaces old "Dashboard" |
| Dashboard | `/dashboard` | `web/src/pages/Dashboard.tsx` | Legacy route, still rendered |
| Documents list | `/docs` | `web/src/pages/Documents.tsx` | Tree nav; `<ul role="tree" aria-label="Documents">` |
| Document editor (any type) | `/documents/:id/*` | `web/src/pages/UnifiedDocumentPage.tsx` + `web/src/components/Editor.tsx` | TipTap; unified for wiki/issue/project/program/sprint/person |
| Issues list | `/issues` | `web/src/pages/Issues.tsx` |   |
| Projects list | `/projects` | `web/src/pages/Projects.tsx` |   |
| Programs list | `/programs` | `web/src/pages/Programs.tsx` |   |
| Team — Allocation (sprint board substitute) | `/team/allocation` | `web/src/pages/TeamMode.tsx` | Kanban lives here via `KanbanBoard.tsx` |
| Workspace Settings | `/settings` | `web/src/pages/WorkspaceSettings.tsx` |   |
| Admin Dashboard | `/admin` | `web/src/pages/AdminDashboard.tsx` | Super-admin only |

The 7 audit-report candidates collapse to these in practice: **Login, My Week (`/` lands here), Document editor, Team/Allocation (sprint board equivalent), Projects, Issues, Settings**.

### Baseline metrics (measured 2026-05-19 via Lighthouse 13.3.0 / axe-core 4.11 — Playwright Chromium-1200 headless)

| Page | Lighthouse a11y | Audits failed | Critical (static) | Serious (static) | Notes |
|---|---:|---|---:|---:|---|
| Login (`/login`, unauth) | **0.98** | `landmark-one-main` (1 element) | 0 | 1 | Public page; no `<main>` landmark — login renders centered card directly in `<body>`. Best-in-class otherwise: sr-only labels, autoComplete, aria-invalid, role="alert" errors. |
| My Week (`/my-week`) | **0.96** | `color-contrast` (6 elements) | 0 | 2 | Three failing pairs: accent `#005ea2` on `bg-accent/20` `#0a1d2b` ratio 2.55 ("Current" badge), accent on near-black `#0c1114` ratio 2.82 (day labels), `text-muted/50` `#4c4c4c` on `#0d0d0d` ratio 2.26 (list numbers). |
| Documents list (`/docs`) | **1.00** | — | 0 | 1 | Tree nav `<ul role="tree">` correctly labeled. |
| Issues (`/issues`) | **1.00** | — | 0 | 2 | Color-only state dots present but not flagged (CSS-only — Lighthouse can't infer semantic meaning of `<span class="rounded-full">`). Static finding still applies. |
| Projects (`/projects`) | **1.00** | — | 0 | 1 | Filter inputs in `DocumentListToolbar` not exercised in default DOM — verify by running search. |
| Team/Allocation (`/team/allocation`) | **1.00** | — | 0 | 2 | `AccountabilityGrid.tsx:320,406` `<div onClick>` cells render but Lighthouse passes them because they lack `aria-disabled`/`role` attributes that would trigger keyboard-handler checks. Static finding still applies. |
| Settings (`/settings`) | **1.00** | — | 0 | 1 | All form labels paired correctly under default tab. |
| Document editor — wiki (`/documents/:wiki-id`) | **1.00** | — | 0 | 3 | TipTap contenteditable lacks aria-label but Lighthouse doesn't flag it (the rule is manual-only). Editor `<h1>` does not collide because `UnifiedDocumentPage` does not render its own h1. |
| Document editor — issue (`/documents/:issue-id`) | **0.96** | `color-contrast` (3 elements) | 0 | 3 | Issue properties sidebar buttons fail contrast: `text-muted` `#8a8a8a` on `bg-border` `#262626` ratio 4.38 (just below 4.5) for Programs/Projects assignment buttons; accent on accent/20 ratio 2.55 (same root cause as my-week). |
| Document editor — project (`/documents/:project-id`) | **1.00** | — | 0 | 3 | Project properties sidebar uses a different layout — no contrast failure. |
| **Custom modals (cross-cutting)** | not exercised | (none open in default DOM) | **3** | 0 | Lighthouse can only audit the default-rendered DOM; the 3 custom modals (`ConversionDialog`, `MergeProgramDialog`, `BacklogPickerModal`) require interaction to open. **Static finding stands**: `aria-modal` set without focus trap or `aria-labelledby` — verified by reading source. |

**Live-vs-static gap analysis.** Lighthouse / axe-core auto-rules flag what they can see in the as-rendered DOM at scan time and only have automated coverage for ~30 of WCAG 2.1's ~75 rules. Of the 8 static findings ranked below, **only 2 surfaced live** (`color-contrast` on my-week and the issue editor, `landmark-one-main` on login). The remaining 6 are either interaction-gated (modals require a click to open), semantic-only (`<div onClick>` cells aren't flagged because they lack ARIA hints that would trigger the rule), or affect comment/collab subsystems that Lighthouse's default load doesn't exercise. Lighthouse's 10 *manual* checks (focus order, focus trap, custom-control labels, etc.) are exactly the category our static review covered. **Recommendation:** treat the 8 static findings as authoritative; live Lighthouse confirms the *floor* and adds two specific contrast violations not previously enumerated.

**PDF-format deliverable table:**

| Metric | Baseline |
|---|---|
| Lighthouse accessibility score (per page) | 7 of 10 routes 1.00; `/login` 0.98; `/my-week` 0.96; `/documents/<issue>` 0.96. Per-page JSONs: `lighthouse-{login,my-week,docs,issues,projects,team_allocation,settings,editor-wiki,editor-issue,editor-project}.json` |
| Total Critical/Serious violations | **9** (4 Critical + 5 Serious) across 8 authenticated routes via `@axe-core/playwright` deep scan. Per-route JSONs: `axe-{login,docs,my-week,issues,projects,settings,team-allocation,editor-wiki}.json` |
| Keyboard navigation completeness | **Partial.** Happy paths work (login Tab/Enter, create-doc Tab chain, Mod+K palette, skip-to-main-content link), but four specific failures break "every interactive element via keyboard": (a) editor body unreachable via Tab from the doc title; (b) delete-document Radix dialog focus-trap fails (Tab escapes the dialog into the page); (c) `AccountabilityGrid` `<div onClick>` cells (`AccountabilityGrid.tsx:320, 406`) have no `role="button"`/`tabIndex`/`onKeyDown`; (d) login Tab cycle loses focus to BODY twice within a single Tab pass. Plus minor: ReactQueryDevtools is in the production Tab chain. |
| Color contrast failures | **9 nodes** on `/my-week` + 3 on `/documents/<issue>` editor. Root cause: Tailwind opacity modifiers destroy design-token contrast guarantees (`text-muted/50` blends to `#4c4c4c` on `#0d0d0d` = 2.26:1; `bg-accent/20` blends to `#0a1d2b` background, accent-on-accent labels = 2.55:1). Single token swap fixes all sites. |
| Missing ARIA labels or roles | 3 custom modals declare `aria-modal` but no `aria-labelledby` / no focus trap (`ConversionDialog`, `MergeProgramDialog`, `BacklogPickerModal`); ~10 placeholder-only input labels across `Documents.tsx`, `AdminDashboard.tsx`, `WorkspaceSettings.tsx`, etc.; `/settings` role `<select>` (Admin/Member) lacks any accessible name; workspace switcher single-letter button uses `title=` not `aria-label`; `CommentDisplay` reply inputs injected via innerHTML lack labels. |

Raw data: `orientation/baselines/accessibility/lighthouse-{login,my-week,docs,issues,projects,team_allocation,settings}.json` plus `lighthouse-editor-{wiki,issue,project}.json` (10 files, ~120 KB each).

### axe-core deep scan + keyboard walkthroughs (added 2026-05-19 21:55 CT)

Lighthouse audits only ~30 WCAG rules and only against the as-rendered DOM. To close those gaps for Phase 1, the audit added (a) an `@axe-core/playwright` deep scan over 8 authenticated routes with the full WCAG 2.0/2.1 A/AA + Section 508 rule set, and (b) keyboard-only walkthroughs of the 3 representative flows (login, document-create, edit + modal) via a Playwright Node script. The MCP couldn't be used (chromium-1200 only). Driver scripts: `axe-scan.mjs` and `keyboard-walks.mjs` next to the Lighthouse JSONs.

**axe deep-scan summary** (full results: `axe-summary.md` + per-route `axe-<name>.json`):

| Route | Critical | Serious | Moderate | Minor | Total |
|---|---:|---:|---:|---:|---:|
| `/login` | 0 | 0 | 0 | 0 | 0 |
| `/docs` | 1 | 1 | 0 | 0 | **2** |
| `/my-week` | 0 | 1 | 0 | 0 | 1 |
| `/issues` | 0 | 0 | 0 | 0 | 0 |
| `/projects` | 0 | 1 | 0 | 0 | 1 |
| `/settings` | 1 | 0 | 0 | 0 | 1 |
| `/team-allocation` | 0 | 0 | 0 | 0 | 0 |
| `/documents/<wiki-id>` (editor) | 2 | 1 | 0 | 0 | **3** |

**New rules surfaced by the deeper scan** (not in Lighthouse's default audit set):

- **`aria-required-children` (critical)** — `/docs` and `/documents/<id>`. The Workspace tree `<ul role="tree" aria-label="Workspace documents">` contains `<li tabindex="…">` children, but a `role="tree"` requires `role="treeitem"` children. Fix: either set `role="treeitem"` on the `<li>` (and a `role="group"` wrapper for nested children) or remove the `role="tree"` and let the default `<ul><li>` semantics carry the structure.
- **`aria-allowed-attr` (critical)** — `/documents/<id>`. TipTap drag-handle renders `<div aria-expanded="false" style="position: relative;">`. `aria-expanded` is not valid on a bare `<div>` without a button-like role. Fix: add `role="button"` (and a `tabindex`), or drop the attribute.
- **`listitem` (serious)** — Sibling failure to the tree-grid issue: `<li>` rendered without a `role="list"` parent. Same fix family.
- **`select-name` (critical)** — `/settings`. The first table row's role `<select>` (Admin/Member) has no `<label>`, no `aria-label`, and no `title`. Screen reader announces "combobox, Admin or Member" with zero context. **Severity: Critical** — federal user-management screens cannot ship like this.
- **`color-contrast` (serious)** — re-confirmed on `/my-week` (accent on accent/20: 2.55:1) and newly surfaced on `/projects` (`text-muted` on `bg-muted/30`: 3.65:1, applies to the planned-count chip in the filter toolbar). Both stem from the same Tailwind-opacity-modifier root cause (top finding #10).

**Keyboard walkthrough findings** (full per-flow logs: `keyboard-{login,create-doc,edit-modal}.md`):

| Flow | Specifically tested | Verdict |
|---|---|---|
| Login | initial focus, Tab order, submit-by-Enter, post-login focus | ✅ email input autofocus, ✅ Tab order email → password → "Sign in", ✅ submit by Enter works. ⚠️ **`ReactQueryDevtools` button is in the Tab chain in dev/prod (Tab #3 after Sign In).** Confirms `web/src/main.tsx:6,265` — the devtools render unconditionally. Compound finding with §2 bundle-size finding #3 (~50–100 KB gzipped). ⚠️ Tab leaks to BODY twice within a single Tab cycle of the login form (focus-lost frames). ⚠️ No `<main>` landmark — confirms Lighthouse `landmark-one-main`. |
| Create-doc | reach New button, focus after create, Tab from title | ✅ Skip-to-main-content link reachable at Tab #1. ✅ All sidebar mode buttons in logical order. ✅ "New document" button at Tab #11. ✅ Pressing Enter creates a doc and focus jumps to the title textarea. ⚠️ **Tab from the title textarea does NOT land in the ProseMirror editor body** — it goes to the DragHandle button, then to "Collapse sidebar" outside the editor. Editor body is not reachable via simple Tab from title; users must click into it. WCAG 2.1.1 partial fail for editor entry. |
| Edit + modal | delete dialog focus trap, Mod+K palette, slash command, AccountabilityGrid cells | ⚠️ **Delete-confirmation "dialog" leaks focus.** Pressing Enter on the keyboard-reached Delete button did not move focus into a trapped Radix dialog; the Tab cycle continued into the title textarea, editor body, drag handle, "Collapse sidebar", document-type select, maintainer button, ReactQueryDevtools button, then BODY (focus lost), then Skip-to-main-content, then a top-of-page toast button. Either the Delete control doesn't open a dialog, or the dialog doesn't trap focus. **Worth code-investigation; if Radix is supposed to trap focus, it isn't doing so here.** ✅ **Mod+K command palette** — search input gets focus correctly; combobox role; Arrow/Tab navigation works. ⚠️ **Slash-command menu didn't open** — pressing `/` in the editor body did not surface a menu. Either the extension is conditional, or the key didn't register in this context — manual verification needed. ✅ **AccountabilityGrid `<div onClick>` cells confirmed unreachable** — 30 Tabs from `/my-week`, no grid-class `<div>` received focus. Static finding stands. |

These walkthroughs strengthen findings #1 (modals — now the supposedly Radix-based Delete dialog is also implicated), #2 (form labels — Settings's role `<select>` lacks a label), #3 (AccountabilityGrid keyboard inaccessibility), and #10 (Tailwind opacity contrast) with live evidence, and surface a new finding (editor-body Tab unreachability from the title) that wasn't in the static review.

### Static findings inventory

| Category | Count | Top locations |
|---|---:|---|
| `<img>` missing `alt` | 0 | All 3 `<img>` tags have alt (`Login.tsx:185`, `Setup.tsx:113`, `ResizableImage.tsx:62`) |
| Icon-only buttons missing `aria-label` | ~6 suspected | `Editor.tsx:996` (BubbleMenu "Comment" has text, OK); `App.tsx:302` workspace switcher uses `title=` not `aria-label` (single-letter button); 113 `aria-label` occurrences overall — broadly good |
| `<a>` empty / icon-only | 0 found | All `<Link>` instances reviewed have text children |
| `<input>` w/ placeholder only (no label) | ~10 | `Documents.tsx:200`, `AdminDashboard.tsx:260`, `AdminWorkspaceDetail.tsx:377`, `TeamMode.tsx:577`, `OrgChartPage.tsx:517`, `WorkspaceSettings.tsx:591`, `ProjectRetro.tsx:270/305`, `ProjectSetupWizard.tsx:98`, `PublicFeedback.tsx:133`, `InviteAccept.tsx:235/246` |
| `<div onClick>` without `role="button"` + keyboard handler | 6+ | `AccountabilityGrid.tsx:320-337` (project allocation cells), `AccountabilityGrid.tsx:406-412` (week cells); ConversionDialog uses div onClick only for backdrop (acceptable) |
| Color-only state indicators | 8 | `App.tsx:597` (orange unread badge), `App.tsx:1066,1127,1268` (issue state dots), `ProjectContextSidebar.tsx:328/344`, `WeekReconciliation.tsx:357`; `Editor.tsx:862` (sync status — has aria-live text equivalent, OK) |
| Heading hierarchy issue | 1 systemic | `Editor.tsx:843` renders an h1 for the document title *inside* the main content while pages like `UnifiedDocumentPage` may already render their own h1 — likely **two h1s** when the editor is mounted on a page that already has one. Needs live verification. |
| Modal without focus trap / labelledby | 3 | `ConversionDialog.tsx`, `MergeProgramDialog.tsx`, `BacklogPickerModal.tsx` — all set `role="dialog"` + `aria-modal="true"` but no focus trap, no `aria-labelledby`, no return-focus on close |
| Missing `aria-current` on active nav | 0 | `App.tsx:856`, `DocumentTreeItem:107`, `ContextTreeNav:130` all correct |
| Skip-link | present | `App.tsx:264-269` "Skip to main content" → `#main-content` (App.tsx:541 `<main role="main" tabIndex={-1}>`) — Section 508 box checked |

### USWDS component review

USWDS surface is intentionally minimal: only the icon library is imported (`web/src/components/icons/uswds/Icon.tsx`). No `usa-banner`, `usa-button`, `usa-form`, etc. classes used outside the icon SVG paths.

- **Icon component** (`Icon.tsx`): Correctly applies `aria-hidden="true" + focusable="false"` when no title is set (decorative), and `role="img" + aria-label={title}` when a title is provided. Matches USWDS guidance.
- **Federal banner / skip-link:** No `usa-banner` ("An official website of the United States government") is present. If Treasury delivery requires it, this is a Section 508 / federal branding gap (separate from WCAG).
- **Forms:** Login uses pure Tailwind + native `<label htmlFor>` pattern (not USWDS classes). Acceptable but means USWDS's strong label/error/required affordances are not inherited — each form must roll its own. Most do; a few (search inputs, admin invite form) skip the label.
- **Color tokens:** `tailwind.config.js:11` documents the muted color was deliberately bumped from `#737373` (4.09:1) to `#8a8a8a` (5.1:1) to clear WCAG AA. `--accent` is `#005ea2` (USWDS-derived); 4.8:1 against the `#0d0d0d` background. Good baseline.

### TipTap editor a11y

`web/src/components/Editor.tsx` (1107 lines):

- **Title:** Rendered as an `<h1>` (line 843); the editable large title below is a textarea — both use `"Untitled"` placeholder. The header h1 may collide with page-level h1s on routes that wrap the editor.
- **Editor body:** `<EditorContent editor={editor} />` (line 981) — TipTap renders `contenteditable` with no explicit `aria-label`, `role="textbox"`, or `aria-multiline`. Screen readers will announce a generic editable region. **Recommendation:** wrap in a div with `role="region" aria-label="Document content"`.
- **No tabIndex on the editor wrapper** — relies on contenteditable's default focusability (correct).
- **BubbleMenu** (line 985-1005): floating menu with one "Comment" button. Visible text + icon, so accessible name is set. Menu itself has no `role="toolbar"` or aria-label.
- **Sync status** (line 853-877): Excellent — `role="status" aria-live="polite" aria-atomic="true"` with a colored dot (`aria-hidden="true"`) plus text ("Saved" / "Cached" / "Saving" / "Offline"). Color is *not* the only signal.
- **Collab cursor avatars** (line 894-905): rely on `title=` attribute only for the user's name; no `aria-live` announcement when a new collaborator joins. Minor screen-reader gap.
- **Custom extensions:** `MentionList`, `EmojiList`, `BacklinksPanel`, `DragHandle`, `DetailsComponent` all have aria-labels (verified). `CommentDisplay` (`Editor.tsx:122,181`) injects raw HTML `<input type="text">` strings for reply boxes — **no associated label**, only a placeholder. Serious finding for comment threads.
- **Keyboard shortcuts:** Not surfaced via a "?" help dialog or `aria-keyshortcuts`. Slash command menu is keyboard-driven (Arrow/Enter/Escape) and accessible.

### Top findings

1. **Custom modals leak focus** — `ConversionDialog`, `MergeProgramDialog`, `BacklogPickerModal` declare `aria-modal="true"` but Tab escapes to background; no `aria-labelledby` on the heading. Federal AT users hit a confusing dialog with no announced title and a keyboard trap going the wrong way. **Severity: High.** Fix by replacing with Radix `Dialog.Root` (already in use elsewhere) — one-line architectural fix. (Not exercised by Lighthouse default load — requires interaction; static-only.)
2. **Search/filter inputs use placeholder-only labeling** — ~10 inputs across Documents, OrgChart, TeamMode, AdminDashboard, AdminWorkspaceDetail, ProjectRetro, ProjectSetupWizard, WorkspaceSettings. Axe will flag each as serious (`label` rule). **Severity: High** (count drags Lighthouse score down most). (Live Lighthouse passes `label` because these inputs use `placeholder` *and* `name`/`type`; axe-core in standalone mode would still serve a `label` violation since accessible name = placeholder. Lighthouse 13's threshold for the `label` rule is more permissive than axe.)
3. **`<div onClick>` cells in AccountabilityGrid** — week-allocation grid cells (`AccountabilityGrid.tsx:320,406`) are clickable navigation but have no `role="button"`, `tabIndex`, or `onKeyDown`. Keyboard users cannot enter the accountability detail. **Severity: High** (WCAG 2.1.1). (Lighthouse passed Team/Allocation 1.0 — confirms the limit: the rule `interactive-element-affordance` is a manual check.)
4. **Color-only state dots in lists** — Issue list and sidebars (`App.tsx:1066`, `WeekReconciliation.tsx:357`, `ProjectContextSidebar.tsx:328/344`) use a colored dot to convey backlog/in-progress/done/changed status with no text or aria-label sibling. Color-blind users get no signal. **Severity: Medium** (WCAG 1.4.1).
5. **CommentDisplay raw-HTML inputs lack labels** — `Editor.tsx:122,181` injects `<input type="text" placeholder="Reply...">` via `innerHTML`. No label, no aria. **Severity: High** — comments are a primary collaboration vector in a federal-audit context. (Not exercised — requires opening a comment thread.)
6. **Editor h1 collision risk: NOT confirmed in this scan** — `Editor.tsx:843` renders `<h1>{title}</h1>`; the wiki/issue/project Lighthouse scans show no `heading-order` failures, indicating `UnifiedDocumentPage` does *not* currently render its own h1 alongside the editor. **Status revised to Low** based on live evidence; finding kept on file in case a future route adds a wrapping h1.
7. **Workspace switcher uses single-letter button with `title` only** — `App.tsx:302-308`. Renders `currentWorkspace?.name?.charAt(0).toUpperCase()` as visible text and `title=` for full name; no `aria-label`. Screen readers announce a single letter. **Severity: Medium.** (Not flagged by Lighthouse — `button-name` rule passes when a button has any visible text; the single letter counts.)
8. **No `usa-banner` (official-government banner)** — not strictly WCAG, but standard for federal apps. **Severity: Low** (compliance/branding).

**Live additions** (found by Lighthouse, not in original static review):

9. **Login page has no `<main>` landmark** — `web/src/pages/Login.tsx` wraps the form in `<div>` instead of `<main>`. Drops Lighthouse from 1.00 → 0.98. **Severity: Low** — one-attribute fix, doesn't block AT use but breaks landmark navigation. Found via `lighthouse-login.json` `landmark-one-main` audit.
10. **Tailwind opacity modifiers (e.g. `text-muted/50`, `bg-accent/20`) destroy the contrast guarantees baked into the design tokens.** Six failing nodes on /my-week and three on the issue editor stem from this pattern. The `tailwind.config.js:11` comment claims `#8a8a8a` clears 5.1:1, but `text-muted/50` blends to effective `#4c4c4c` on `#0d0d0d` (2.26:1). Same for `bg-accent/20` → `#0a1d2b` background, which makes accent-on-accent labels 2.55:1. **Severity: High** — likely affects every page that uses `bg-accent/20` for "current" / "selected" states. **Fix:** replace `text-muted/50` with a dedicated `text-muted-soft` token (e.g. `#6b6b6b`) and `bg-accent/20` with a pre-blended `bg-accent-soft` token that maintains 4.5:1 against `text-accent`. Single token swap; entire app benefits.

### Improvement target (per brief)

Use the looser of the two:
- **10+ point Lighthouse a11y improvement on the lowest-scoring page** (`/my-week` and the issue editor are currently the lowest at 0.96), **OR**
- **Fix all Critical/Serious axe violations on the 3 most important pages**: Document editor (`/documents/:id`), Issues list (`/issues`), and Login (`/login`).

The top-7 fixes above will likely cover both targets in one pass — modals + form labels + AccountabilityGrid keyboarding alone should move the editor and team pages by >10 points.

### Raw data files

- `orientation/baselines/accessibility/scan-script.sh` — Lighthouse runner (axe-core/cli stanza retained but disabled for protected pages — the CLI lacks a `--cookie` option; rely on Lighthouse's bundled axe-core for authenticated routes)
- `orientation/baselines/accessibility/axe-scan.mjs` — @axe-core/playwright driver against 8 authenticated routes with WCAG 2.0/2.1 A/AA + Section 508 tags
- `orientation/baselines/accessibility/axe-summary.md` + `axe-summary.json` — quick-scan summary
- `orientation/baselines/accessibility/axe-{login,docs,my-week,issues,projects,settings,team_allocation,editor-wiki}.json` — per-route violations
- `orientation/baselines/accessibility/keyboard-walks.mjs` — 3-flow keyboard-only driver
- `orientation/baselines/accessibility/keyboard-walkthrough.md` — original 3-flow keyboard test script (now executed)
- `orientation/baselines/accessibility/keyboard-{login,create-doc,edit-modal}.md` — per-flow focus chain + verdicts
- `orientation/baselines/accessibility/lighthouse-login.json` — public login page (unauth), score **0.98**, fails `landmark-one-main`
- `orientation/baselines/accessibility/lighthouse-my-week.json` — score **0.96**, 6 contrast failures
- `orientation/baselines/accessibility/lighthouse-docs.json` — score **1.00**
- `orientation/baselines/accessibility/lighthouse-issues.json` — score **1.00**
- `orientation/baselines/accessibility/lighthouse-projects.json` — score **1.00**
- `orientation/baselines/accessibility/lighthouse-team_allocation.json` — score **1.00**
- `orientation/baselines/accessibility/lighthouse-settings.json` — score **1.00**
- `orientation/baselines/accessibility/lighthouse-editor-wiki.json` — score **1.00** (`/documents/<wiki-id>`)
- `orientation/baselines/accessibility/lighthouse-editor-issue.json` — score **0.96**, 3 contrast failures
- `orientation/baselines/accessibility/lighthouse-editor-project.json` — score **1.00**

---
