# Runtime Error & Edge Case — Manual Reproduction Scripts

These scripts are intended for the parent thread to execute via Playwright MCP. Each lists precondition, steps, expected, actual. "Expected" is the corrected behavior we want after fixes; "Actual" is what is hypothesised today, based on static analysis. Live runs may surface additional behavior.

## 1. WebSocket session expiry mid-edit

- **Precondition**: User is logged in; opens a document at `/documents/<id>`. Session inactivity timeout is 15 minutes (`SESSION_TIMEOUT_MS`).
- **Steps**:
  1. Open editor; type a couple of paragraphs to confirm collab works.
  2. Leave the tab idle in the foreground for >15 minutes (no keystrokes, no scroll). Session-update only fires on REST hits, not on Yjs WS messages.
  3. Resume editing — type a sentence.
  4. Observe console + network panel.
- **Expected**: Server detects expired session, closes WS with a code the client maps to "session expired", and the SessionTimeoutModal prompts re-auth before edits are lost.
- **Actual (hypothesis)**: WS remains OPEN because session is only validated at the HTTP upgrade in `validateWebSocketSession()` (`api/src/collaboration/index.ts:347–393`). Edits are accepted into the in-memory Y.Doc and broadcast to peers, but the first subsequent REST call (auto-save, navigation) returns 401. The user sees a sign-out toast/redirect; the in-memory edits since expiry may persist (they were debounce-saved by `schedulePersist`), but the auth boundary is incoherent.

## 2. Two browser tabs editing the same field simultaneously

- **Precondition**: Same user (or two users) signed in; same document open in two tabs/sessions.
- **Steps**:
  1. Place cursor in the title field in tab A; in tab B place cursor in the same field.
  2. Type alternating characters in both, ~3 chars/sec each, for ~10 seconds.
  3. Refresh both tabs.
- **Expected**: Both tabs converge on the same Yjs-merged title; no characters lost; no console errors.
- **Actual (hypothesis)**: Title is a plain `<textarea>`, not Yjs-bound. The `documents.patch` endpoint last-write-wins on `title`. Whichever tab's debounce fires last clobbers the other. Body content (TipTap+Yjs) is fine.

## 3. Disconnect during collab edit, then reconnect

- **Precondition**: Editor open, collab connected (green indicator).
- **Steps**:
  1. Type a paragraph.
  2. With DevTools "Offline" toggle, drop network for 20–60 seconds.
  3. Continue typing while offline — observe whether the editor accepts input.
  4. Re-enable network. Watch console.
- **Expected**: Local Yjs document continues to accept edits; on reconnect, sync step 1 replays diffs both ways; persisted state in DB reflects the union. No "undefined" placeholder. No silent loss.
- **Actual (hypothesis)**: y-websocket auto-reconnects. In-memory Y.Doc on server is reused for ~30 s after the last connection drops (see cleanup `setTimeout` at `collaboration/index.ts:774`). Edits made offline are present locally and sync on reconnect. **Risk**: if reconnection takes >30 s and no other peers are connected, the server-side doc is GC'd and `getOrCreateDoc()` reloads from DB; merged state should still converge via the client's full Yjs state. The unverified failure path is if `yjsToJson()` throws during a persist (see finding #3) — `content` could be written as the literal string `"undefined"`.

## 4. Slow-3G page load — what hangs?

- **Precondition**: A non-cached doc URL.
- **Steps**:
  1. In DevTools Network panel, set throttling to "Slow 3G".
  2. Cold-load `/documents/<id>`.
  3. Note which UI elements render vs which spinners hang. Time to interactive.
- **Expected**: Skeleton/loading state for each panel; no blank screen; no infinite spinner; queries time out with user-visible error within ~30 s.
- **Actual (hypothesis)**: TanStack Query has default retry behavior (3x with exponential backoff). On slow 3G, the editor's WS upgrade may race with the REST fetch of the document; if the REST fetch is still pending when WS connects, the server reads from DB and clients see flicker. Likely: skeleton shows but a few subviews lack `<ErrorBoundary>` wrapping (only `<Outlet>` in `App.tsx:542` and `<EditorContent>` in `Editor.tsx:980` are wrapped).

## 5. Submit empty form

- **Precondition**: New issue/project creation flow.
- **Steps**:
  1. Open the dialog/form to create an issue.
  2. Submit with no fields filled.
- **Expected**: Client-side validation prevents submission; or server returns 400 with field-level details and the UI binds them to the offending field.
- **Actual (hypothesis)**: For `documents.post` (which backs the create flow), `createDocumentSchema.safeParse` runs and a 400 is returned with `{error: 'Invalid input', details: parsed.error.errors}`. UI likely surfaces this via the `MutationErrorToast` rather than inline field errors. Empty title may still be accepted because `title` defaults to "Untitled".

## 6. Very long title (10 KB)

- **Precondition**: Editor open.
- **Steps**:
  1. Paste a 10,000-character string into the title `<textarea>`.
  2. Save (autosave or blur).
- **Expected**: Either client truncates with a warning, or server returns 400 with a max-length violation, or DB accepts it (column is `TEXT`) but UI handles the layout sanely.
- **Actual (hypothesis)**: No max length enforced in `createDocumentSchema`/`updateDocumentSchema` (need to verify). DB column accepts it. Sidebar list rows will wrap awkwardly or overflow. No console error.

## 7. HTML/script injection in title and body

- **Precondition**: Editor open.
- **Steps**:
  1. Paste `<img src=x onerror=alert(1)>` and `<script>alert(1)</script>` into the title and body.
  2. Save, reload.
- **Expected**: Content stored as text; React renders the literal string; no script execution; CSP `script-src 'self' 'unsafe-inline'` still blocks event-handler injection.
- **Actual (hypothesis)**: Title rendered as React text — safe. Body goes through TipTap parser which strips unknown tags; only allowed marks/nodes survive. Risk surface: the `dangerouslySetInnerHTML` audit (a separate baseline) should confirm; PRESEARCH says one location uses it.

## 8. Network 500 from API — does the UI choke?

- **Precondition**: Force a 500 from any endpoint (e.g., kill the DB pool temporarily).
- **Steps**:
  1. Navigate to a list page (Issues, Documents).
  2. Observe response when API throws.
- **Expected**: Toast or inline "Something went wrong, try again". No white-screen.
- **Actual (hypothesis)**: Because there is **no global Express error handler** (finding #1), any uncaught throw inside an `async` route handler propagates to Express 4's default handler, which returns an HTML page `<pre>Error: ...</pre>` with status 500. The frontend uses `fetch(...).then(r => r.json())` in most places, which throws `SyntaxError: Unexpected token '<'` during parsing — surfaced to TanStack Query as an opaque error, then routed through `MutationErrorToast`. The toast message will be unhelpful.

## 9. Yjs persist with malformed fragment

- **Precondition**: A document whose `yjs_state` is corrupted (rare, but reachable via the API-converted JSON path).
- **Steps**:
  1. Manually update one document row to set `yjs_state` to an arbitrary byte string and `content` to `'<broken>'`.
  2. Open it in the editor.
- **Expected**: Server logs the failure, falls back to empty doc; UI shows empty editor with a notice.
- **Actual (hypothesis)**: `getOrCreateDoc()` (`collaboration/index.ts:195–259`) wraps `Y.applyUpdate` and JSON parsing in try/catch and falls back to empty. **BUT** `persistDocument()` calls `yjsToJson(fragment)` and then `JSON.stringify(content)` inside one try/catch (lines 115–178). If `yjsToJson` *returns* a malformed object that `JSON.stringify` can serialize as the literal `"undefined"` (e.g. circular ref → throw, but undefined property → silently stringified), the `content` column gets written with bad data. Browser then sees the doc as empty on next API read.

## 10. Concurrent visibility-change race

- **Precondition**: Document open by two users (A creator, B non-admin).
- **Steps**:
  1. User A toggles visibility to "private" via the REST API.
  2. While B has the doc open and is mid-keystroke.
- **Expected**: B is disconnected (WS close 4403) with a clear message; B's pending edits are discarded gracefully.
- **Actual (hypothesis)**: `handleVisibilityChange` (`collaboration/index.ts:530–575`) does close the WS. B's pending Y.Doc updates in-flight just before the close may be applied to the in-memory doc (and persisted) before B is kicked. Minor data-integrity edge case.
