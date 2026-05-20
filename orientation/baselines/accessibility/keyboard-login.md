# Keyboard walkthrough — Login flow

**Captured:** 2026-05-20T03:20:00.789Z
**Tests:** WCAG 2.1.1 (Keyboard), 2.4.7 (Focus Visible), 2.4.3 (Focus Order).

## Step 1: Initial focus on cold-load `/login`

Focus on load: `<input>` Email address.
✅ Email input has correct autofocus (`Login.tsx:247`).

## Step 2: Tab order through the login form

```
 1. Tab        → `<input>` Password
 2. Tab        → `<button>` "Sign in"
 3. Tab        → `<button>` Open Tanstack query devtools
 4. Tab        → `<body>` "(no focus)" ⚠️ FOCUS LOST
 5. Tab        → `<input>` Email address
 6. Shift+Tab  → `<body>` "(no focus)" ⚠️ FOCUS LOST
 7. Shift+Tab  → `<button>` Open Tanstack query devtools
 8. Shift+Tab  → `<button>` "Sign in"
 9. Shift+Tab  → `<input>` Password
```

## Step 3: Type credentials + press Enter from password

Focus before Enter: `<input>` Password.
Post-login URL: `http://localhost:5174/docs`.
Focus after navigation: `<button>` Close.

## Step 4: Skip-link & post-login focus order (first 3 Tabs)

```
 1. Tab        → `<button>` "Post standupPost standup for Week 14 (5 issues assigned)Week"
 2. Tab        → `<button>` "Got it"
 3. Tab        → `<button>` Close
```
Look for a "Skip to main content" entry in the chain. It should appear as the first focusable element after page load (`App.tsx:264-269`).
