# Scenario 1: WebSocket session expiry mid-edit

**Captured:** 2026-05-20T20:46:36.821Z
**Doc:** `5f38a18d-2537-4ce9-ae10-6dfdd31d4eea` (created during the run; safe to delete)
**Session row deleted:** `aa5d3c95eaa48b4c2e3df2be99cc998cd047b84950e93c627e51cd9dd5d33687` at `2026-05-20T20:46:32.754Z`
**Setup:** in lieu of waiting 15 minutes for a real idle timeout, this scenario forces session destruction by deleting the `sessions` row directly. The WS connection is unchanged at the TCP layer — the audit's claim is that the WS server never re-validates the session row, so the connection continues processing messages.

## Probes

| Probe | Expected if audit claim is right | Observed |
|---|---|---|
| Pre-expiry phrase persists via WS (sanity, session alive) | persists | ✅ persists |
| REST `/api/auth/me` after session DELETE | 401 (HTTP boundary dead) | **401** |
| Post-expiry phrase persists via WS (audit-target test) | persists despite dead session | ⚠️ **PERSISTS — confirms audit claim** |

## Verdict
⚠️ **AUDIT CLAIM CONFIRMED LIVE.** The HTTP session was destroyed (REST returns 401) but the WebSocket kept accepting and persisting edits. `After-expiry` phrase `AFTER-EXPIRY-PHRASE-1779309992761` was written to `documents.content` despite the session row no longer existing. This is exactly the "user whose session expires keeps editing until the browser closes" path described in the audit. **Severity: High.**

## DB rows
**Pre-delete `content`:** `{"type": "doc", "content": [{"type": "paragraph", "content": [{"text": "BEFORE-EXPIRY-PHRASE-1779309988643 ", "type": "text"}]}]}...`
**Post-delete `content`:** `{"type": "doc", "content": [{"type": "paragraph", "content": [{"text": "BEFORE-EXPIRY-PHRASE-1779309988643  AFTER-EXPIRY-PHRASE-1779309992761 ", "type": "text"}]}]}...`

## Console (errors/warnings only)
  [error] (×3) Failed to load resource: the server responded with a status of 401 (Unauthorized)
  [error] Error fetching backlinks: Error: Failed to fetch backlinks
    at fetchBacklinks (http://localhost:5173/src/components/editor/BacklinksPanel.tsx:45:17)
