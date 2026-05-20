# Keyboard walkthrough — Create-document flow

**Captured:** 2026-05-20T03:20:08.626Z
**Route:** `/docs`

## Step 1: Reach the "New" / "Add" button via Tab

Tab order over the first 25 Tabs from page-load focus:

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
13. Tab        → `<a>` "malformed-yjs-test"
14. Tab        → `<button>` Document actions
15. Tab        → `<a>` "malformed-yjs-test"
16. Tab        → `<button>` Document actions
17. Tab        → `<a>` "long-title-test"
18. Tab        → `<button>` Document actions
19. Tab        → `<a>` "malformed-yjs-test"
20. Tab        → `<button>` Document actions
21. Tab        → `<a>` "malformed-yjs-test"
22. Tab        → `<button>` Document actions
23. Tab        → `<a>` "<img src=x onerror=alert(1)><script>alert(2)</script>"
24. Tab        → `<button>` Document actions
25. Tab        → `<a>` "long-title-test"
```

**"New/Add/Create" button found at Tab #11.** Reachable via keyboard.

## Step 2: Trigger create-doc via keyboard

How: pressed Enter on Add button.
Focus immediately after: `<textarea>` Untitled.
✅ Focus auto-jumps to the title input — keyboard-driven create works.

## Step 3: From title, Tab forward (4 steps)

```
 1. Tab        → `<div>` (no label)
 2. Tab        → `<button>` Drag to reorder block
 3. Tab        → `<button>` Collapse sidebar
 4. Tab        → `<select>` Document type
```
Look for whether Tab from the title lands in the ProseMirror editor body, or whether it leaks to chrome elements outside the editor.
