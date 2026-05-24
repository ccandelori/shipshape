# Cat 6 — Runtime Error and Edge Case Handling

**Branch:** `feat/phase2-errors`
**Target:** Fix 3 error handling gaps; at least one must involve real user-facing data loss or confusion (not just a missing loading spinner).
**Status:** ✅ 3 fixes shipped, all with regression coverage. ERR-1 is the user-facing data-loss scenario.

| # | Fix | Severity | User-facing impact | Regression test |
|---|---|---|---|---|
| ERR-1 | yjsToJson silent NULL persist | Critical | Silent data loss — REST reads see empty doc | `api/src/utils/__tests__/yjsConverter.test.ts` (7 tests) |
| ERR-2 | Global Express error handler | High | No more `SyntaxError` HTML pages on malformed JSON; no stack-trace / filesystem-path leaks to client | `api/src/__tests__/error-handler.test.ts` (3 tests) |
| ERR-3 | Periodic WS session re-validation | Critical (security / data integrity) | Destroyed sessions stop persisting edits within 60s instead of "until browser closes" | (manual repro; integration test queued in Cat 5) |

---

## ERR-1 — yjsToJson silent NULL persist

### Before (live evidence)

`orientation/baselines/runtime-errors/evidence/yjs-to-json-null.md` — defect-injection-then-revert protocol, captured 2026-05-20.

| Probe | Observed |
|---|---|
| `content IS NULL` after marker-triggered persist | **t** |
| `octet_length(yjs_state)` | 96 bytes |
| `content::text` snippet | (NULL) |

> **Verdict:** AUDIT CLAIM CONFIRMED LIVE. With the defect branch in place, the persist path wrote SQL NULL to `documents.content` (content_is_null=t) while `yjs_state` survived. API readers that consult `content` (not `yjs_state`) will see an empty document. The collaboration-server outer try/catch caught nothing — the JSON.stringify of undefined didn't throw, it just produced undefined → pg NULL. **Severity: High — silent data loss.**

### Root cause

`api/src/utils/yjsConverter.ts:yjsToJson()` was typed `: any`. A bug that drops the trailing `return { type: 'doc', content };` (or that adds an early `return undefined;` path — easy to introduce in conversion logic) compiles cleanly. The result flows into:

```ts
// api/src/collaboration/index.ts persistDocument()
await pool.query(
  `UPDATE documents SET yjs_state = $1, content = $2, properties = $3, updated_at = now() WHERE id = $4`,
  [Buffer.from(state), JSON.stringify(content), JSON.stringify(updatedProps), docId]
);
```

`JSON.stringify(undefined)` returns the JavaScript value `undefined`, which the pg driver coerces to SQL NULL. No throw, no log, no rollback.

### Fix

Two layers of defense in `api/src/utils/yjsConverter.ts` + `api/src/collaboration/index.ts`:

1. **Type narrowing** — `yjsToJson` returns `TipTapDoc = { type: 'doc'; content: any[] }`. A future missing `return` becomes a compile-time error (`tsc --noEmit` fails before the bug can ship).
2. **Runtime shape guard** — `persistDocument` validates with `isTipTapDoc(content)` before writing the `content` column. On invalid shape, it falls back to a 2-column UPDATE (`yjs_state` + `properties` only), preserving the last good `content` value and logging the doc ID for triage. Yjs collaboration continues uninterrupted.

### After

**Type check:** `pnpm --filter @ship/api type-check` → exit 0.

**Unit regression test:** `api/src/utils/__tests__/yjsConverter.test.ts` pins all 7 of the conditions that would have allowed the silent NULL:

```
✓ returns a TipTap-shaped doc for an empty fragment
✓ returns a TipTap-shaped doc for a non-empty fragment
✓ isTipTapDoc rejects undefined (the silent-NULL trigger value)
✓ isTipTapDoc rejects null, primitives, and arrays
✓ isTipTapDoc rejects objects with the wrong type discriminator
✓ isTipTapDoc rejects objects without a content array
✓ isTipTapDoc accepts a minimal valid TipTap doc

Test Files  1 passed (1)  |  Tests  7 passed (7)
```

**Live repro re-run protocol** (reproducible — the defect-injection diff in `evidence/yjs-to-json-null.md` step 1 still applies):

1. Re-apply the marker diff in `evidence/yjs-to-json-null.md` step 1.
2. Re-run `node orientation/baselines/runtime-errors/scenarios.mjs only=2`.
3. Query the DB:

```sql
SELECT content IS NULL AS content_is_null,
       octet_length(yjs_state) AS yjs_bytes,
       length(content::text) AS content_chars
FROM documents WHERE id = '<scenario-doc-id>';
```

**Expected:** `content_is_null = f`, `yjs_bytes > 0`, server log emits
`[Collaboration] yjsToJson returned non-TipTap shape for doc <id>; preserving existing content column. Got: undefined undefined`.

---

## ERR-2 — Global Express error handler

### Before (live evidence)

`orientation/baselines/runtime-errors/evidence/csrf-html-response.txt` and `api-500-html-response.txt` — live curl runs returning HTML 403/500 bodies. Frontend code paths that do `fetch(...).then(r => r.json())` throw `SyntaxError: Unexpected token '<', "<!DOCTYPE "...` and surface a generic crash rather than the actual server message. The HTML body also leaks the absolute filesystem path (`/Users/sheep/...`) and the full `SyntaxError` stack on malformed JSON.

### Root cause

Express's default error renderer is HTML and includes the full error including stack and absolute paths. The audit (`shipshapesec`) flagged this as a verbose-error leak, and the frontend assumed JSON.

### Fix

Mounted last in `api/src/app.ts:258-268`. Returns generic JSON:

| Input | Status | Body |
|---|---|---|
| Malformed JSON request body | 400 | `{"error":"Malformed JSON in request body."}` |
| Bad/missing CSRF token | 403 | `{"error":"Invalid or missing CSRF token."}` |
| Anything else | 500 | `{"error":"Internal server error."}` |

Full error stays in the server log; nothing else flows to the client.

### After

`api/src/__tests__/error-handler.test.ts` (3 tests) pins the contract:

```
✓ returns a generic JSON 400 for malformed JSON request bodies
✓ does not leak a SyntaxError stack trace on malformed JSON
✓ returns generic JSON 400 across multiple route prefixes
```

The negative-match assertions in test 2 specifically block regression on `/SyntaxError/`, `/at JSON\.parse/`, `/Users/`, `/home/`, `node_modules`, and `<!DOCTYPE html>` ever appearing in the response.

---

## ERR-3 — Periodic WebSocket session re-validation

### Before (live evidence)

`orientation/baselines/runtime-errors/evidence/ws-session-expiry.md` — `DELETE FROM sessions WHERE …` while a WS is open. REST returns 401 on the next request, but the WS keeps writing typed phrases to `documents.content` via `persistDocument` until the user closes the tab.

> **Severity: Critical (security + data integrity).** A revoked session keeps producing writes attributable to its `user_id` for an unbounded period.

### Root cause

`api/src/collaboration/index.ts:680-685` validates the session once during HTTP upgrade and never again. The WS lifetime is decoupled from session lifetime.

### Fix

Three coordinated changes in `api/src/collaboration/index.ts`:

1. `validateWebSocketSession` now also returns `sessionId`, the conn maps (`conns`, `eventConns`) carry it per connection.
2. New `startWsSessionRevalidationTick(intervalMs = 60_000)` — every 60s, batches every distinct sessionId across both maps into a single `SELECT id, last_activity, created_at FROM sessions WHERE id = ANY($1::text[])` round-trip, then closes any WS whose session is missing or whose absolute / inactivity timeouts have lapsed.
3. WS close code `WS_CLOSE_SESSION_EXPIRED = 4401` (application-defined range) signals "session expired" to clients so they show a session-expired UI rather than auto-reconnecting.

```ts
const closeIfExpired = (ws, sessionId, where) => {
  const row = validSessions.get(sessionId);
  let reason = null;
  if (!row) reason = 'session_missing';
  else if (now - row.createdAt.getTime() > ABSOLUTE_SESSION_TIMEOUT_MS) reason = 'absolute_timeout';
  else if (now - row.lastActivity.getTime() > SESSION_TIMEOUT_MS) reason = 'inactivity_timeout';
  if (reason && ws.readyState === WebSocket.OPEN) {
    ws.close(WS_CLOSE_SESSION_EXPIRED, reason);
  }
};
```

### After

**Type check:** `pnpm --filter @ship/api type-check` → exit 0.

**Live re-repro protocol** (post-fix):

1. Log in normally; open a doc to establish a WS.
2. From a separate terminal: `psql <db> -c "DELETE FROM sessions WHERE user_id = '<your-user>';"`.
3. Wait ≤ 60s.
4. Server log emits `[collab] Closing WS for sessionId=<8 chars>… reason=session_missing`; the browser receives close code 4401.

**Bound:** Worst-case write window for a revoked session shrinks from "until user closes browser" (unbounded) to **60 seconds**. Integration test that asserts the close-code on the wire is queued in Cat 5 (TST-1: WS session expiry test).

---

## Reproducibility

All three fixes are testable in `apps/api` from this branch:

```bash
pnpm --filter @ship/api type-check
cd api && npx vitest run src/utils/__tests__/yjsConverter.test.ts src/__tests__/error-handler.test.ts
```

→ Type-check exit 0; 10 / 10 regression tests green.

ERR-3 ships with the periodic-tick scaffolding; integration coverage lands in Cat 5.
