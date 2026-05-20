# Keyboard walkthrough — Edit + modal flow

**Captured:** 2026-05-20T03:20:23.156Z
**Routes:** `/documents/57895cfe-dcba-419a-8dbc-a919a846c0b7` (wiki editor) and `/my-week` (AccountabilityGrid).

## Step 1: Tab order on opened editor (first 20 tabs)

```
 1. Tab        → `<a>` "Skip to main content"
 2. Tab        → `<button>` "1 accountability item is due today.1View items"
 3. Tab        → `<button>` "S"
 4. Tab        → `<button>` Dashboard
 5. Tab        → `<button>` Docs
 6. Tab        → `<button>` Programs
 7. Tab        → `<button>` Projects
 8. Tab        → `<button>` Teams (standup due)
 9. Tab        → `<button>` Settings
10. Tab        → `<button>` "D"
11. Tab        → `<button>` New document
12. Tab        → `<button>` Collapse sidebar
13. Tab        → `<a>` "Untitled"
14. Tab        → `<button>` Document actions
15. Tab        → `<a>` "malformed-yjs-test"
16. Tab        → `<button>` Document actions
17. Tab        → `<a>` "malformed-yjs-test"
18. Tab        → `<button>` Document actions
19. Tab        → `<a>` "long-title-test"
20. Tab        → `<button>` Document actions
```

## Step 2: Delete-confirmation dialog (Radix-based — expected to have focus trap)

Delete button reached and Enter pressed; dialog opened.
Focus immediately after Enter: `<button>` Delete document.

Tab cycle (10 presses):
```
 1. Tab        → `<textarea>` Untitled
 2. Tab        → `<div>` "Ship helps your team track work, plan sprints, and write doc"
 3. Tab        → `<button>` Drag to reorder block
 4. Tab        → `<button>` Collapse sidebar
 5. Tab        → `<select>` Document type
 6. Tab        → `<button>` "Select maintainer..."
 7. Tab        → `<button>` Open Tanstack query devtools
 8. Tab        → `<body>` "(no focus)" ⚠️ FOCUS LOST
 9. Tab        → `<a>` "Skip to main content"
10. Tab        → `<button>` "1 accountability item is due today.1View items"
```

Focus after Esc: `<button>` 1 accountability item is due today.1View items.

## Step 3: Command Palette (Mod+K)

Focus after Mod+K: `<input>` Type a command or search....
✅ Search input has focus when palette opens.
Arrow + Tab chain inside palette:
```
 1. ArrowDown  → `<input role=combobox>` Type a command or search...
 2. ArrowDown  → `<input role=combobox>` Type a command or search...
 3. ArrowDown  → `<input role=combobox>` Type a command or search...
 4. Tab        → `<input role=combobox>` Type a command or search...
```

## Step 4: Slash-command menu inside the editor body

Focus after `/` typed: `<div>` Ship helps your team track work, plan sprints, and write doc.
Arrow-down + Esc chain:
```
 1. ArrowDown  → `<div>` "Ship helps your team track work, plan sprints, and write doc"
 2. ArrowDown  → `<div>` "Ship helps your team track work, plan sprints, and write doc"
 3. Escape     → `<div>` "Ship helps your team track work, plan sprints, and write doc"
```

## Step 5: AccountabilityGrid `<div onClick>` cells (static finding — should NOT be Tab-reachable)

✅ **Confirmed:** in 30 Tabs from page load on `/my-week`, no `<div>` with grid-cell classes received focus. The static finding stands: the AccountabilityGrid cells use `<div onClick>` and are unreachable via keyboard.

## Static findings still load-bearing (Lighthouse can't trigger these — modal must be open)

- **ConversionDialog, MergeProgramDialog, BacklogPickerModal** have `role="dialog" aria-modal="true"` but no focus trap and no `aria-labelledby`. Code citations in audit-report.md §7. Not exercised live in this walk because triggering these modals requires UI states (a target wiki to convert, two programs to merge, a sprint planning page) not easily set up programmatically — they remain code-static findings, severity unchanged.
