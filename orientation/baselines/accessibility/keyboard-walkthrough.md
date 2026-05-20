# Keyboard-Only Walkthrough — Section 508 / WCAG 2.1.1

Run via Playwright MCP. The agent should drive Chromium with mouse never used after page load. Use only Tab, Shift+Tab, Enter, Space, Escape, and arrow keys. Record where focus goes after each keystroke, whether focus is visible, and whether each interactive element is reachable.

For each flow, capture:
- Pass/Fail per WCAG SC 2.1.1 (Keyboard) and 2.4.7 (Focus Visible)
- Focus order log (sequence of `document.activeElement` snapshots — capture `tagName`, `aria-label`, `textContent.slice(0,40)`)
- Any keyboard trap (Tab gets stuck) — WCAG 2.1.2
- Any element only operable by mouse

## Flow 1 — Login (route: `/login`)

1. Navigate to `/login`. Confirm initial focus is on email input (`autoFocus` per Login.tsx:247).
2. Tab through: email → password → "Sign in" submit button → any OAuth/SSO links if present.
3. Shift+Tab back to verify reverse order.
4. Type credentials; press Enter from password field to submit.
5. Verify focus moves to the new page (post-login) — should land on `<main>` (id=main-content, tabIndex=-1) or the skip link.

Expected pitfalls:
- Logo image is `<img alt="Ship">` — should NOT receive focus (decorative-ish).
- The skip-link "Skip to main content" should appear when Tab is pressed from the very top of any authenticated page (App.tsx:264-269).

## Flow 2 — Create a document (route: `/docs`)

1. From `/docs`, press Tab repeatedly until the "New" / create button is focused. Verify it has a visible focus ring.
2. Press Enter to create a new wiki document. Confirm focus auto-jumps to the title input ("Untitled" placeholder).
3. Type a title, press Enter or Tab into the editor body.
4. In the editor body, press `/` to open the slash command menu. Verify arrow-key navigation works and Enter inserts the chosen block.
5. Press Escape to dismiss the menu — focus should return to the editor.

Expected pitfalls:
- Slash command menu (`web/src/components/editor/SlashCommands.tsx`) and mention list (MentionList.tsx) — verify arrow keys cycle and the list has `aria-label="Mention suggestions"` (confirmed in grep) and items have `role="option"`.
- The TipTap `EditorContent` itself: confirm Tab from the title input lands in the editor and Shift+Tab exits cleanly back to the title (no trap).
- DragHandle is a contenteditable companion — should NOT be focusable via Tab when no block is selected.

## Flow 3 — Edit/save a document and open a modal

1. With a document open, Tab to the Properties sidebar collapse button (`aria-label="Collapse sidebar"`). Press Enter; verify collapse.
2. Tab forward to the Delete button (if shown). Press Enter; the ConfirmDialog (Radix Dialog) should open.
3. Inside the dialog: verify focus is trapped (Tab cycles within Cancel ↔ Confirm). Press Escape to close — focus should return to Delete.
4. Re-open. This time test the ConversionDialog flow if available (custom modal at `web/src/components/dialogs/ConversionDialog.tsx`) — verify focus is trapped (EXPECTED FAILURE — no focus trap implemented; Tab will escape to the page behind the backdrop). Press Escape to close.
5. Open the Command Palette (Cmd/Ctrl+K). Verify focus moves to the search input, arrow keys navigate results, Enter selects, Escape dismisses.

Expected pitfalls (pre-known):
- **ConversionDialog, BacklogPickerModal, MergeProgramDialog** have `role="dialog" aria-modal="true"` but no focus trap and no `aria-labelledby` pointing to their h2 — Tab will leak to the background page. **High severity** for federal/AT users.
- Radix-based dialogs (ConfirmDialog, ApprovalButton modal, SessionTimeoutModal, ProjectSetupWizard) handle focus trap natively — these should pass.
