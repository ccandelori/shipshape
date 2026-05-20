# Scenario 10: Concurrent visibility-change race

**Captured:** 2026-05-20T03:03:17.508Z
**Doc:** `8335aa38-2f7d-47cf-b95f-34bf80b5e30e` (created during the run)
**Users:** pageA = `dev@ship.local` (super-admin, the flipper); pageB = `alice.chen@ship.local` (workspace member, the editor mid-keystroke). All seed users share password 'admin123' (api/src/db/seed.ts).
**Visibility flip:** `PATCH /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e` body `{"visibility":"private"}` → status 200, content-type application/json; charset=utf-8.
**WS closes on pageB after the PATCH (timestamp filter):** 1 event(s).
**Persisted body content** (read by pageA after the race): status 200, length 215.
Snippet: `{"id":"8335aa38-2f7d-47cf-b95f-34bf80b5e30e","title":"visibility-race-test","content":{"type":"doc","content":[{"type":"paragraph","content":[{"text":"Typing as user B before visibility change. ","type":"text"}]}]}}`

## Console — pageA (flipper)
  [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
  [warning] (×44) A user uses an unsupported color format {name: Alice Chen, color: hsl(310, 70%, 60%)}

## Console — pageB (editor mid-keystroke)
  [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)

## Network — pageB (with timestamps relative to ws/PATCH events)
```
  ws-open  ws://localhost:5174/?token=jxNxqz55pBDf
  REQ GET    /api/auth/me
  RES 401    application/json             /api/auth/me
  REQ GET    /api/setup/status
  REQ GET    /api/auth/caia/status
  REQ GET    /api/setup/status
  REQ GET    /api/auth/caia/status
  RES 200    application/json             /api/auth/caia/status
  RES 200    application/json             /api/setup/status
  RES 200    application/json             /api/auth/caia/status
  RES 200    application/json             /api/setup/status
  REQ GET    /api/csrf-token
  RES 200    application/json             /api/csrf-token
  REQ POST   /api/auth/login
  RES 200    application/json             /api/auth/login
  ws-open  ws://localhost:3000/events
  REQ GET    /api/accountability/action-items
  REQ GET    /api/auth/session
  REQ GET    /api/standups/status
  REQ GET    /api/issues
  REQ GET    /api/projects
  REQ GET    /api/programs
  REQ GET    /api/documents?type=wiki
  REQ GET    /api/team/people?includeArchived=true
  REQ GET    /api/auth/session
  RES 200    application/json             /api/auth/session
  RES 200    application/json             /api/standups/status
  RES 200    application/json             /api/programs
  RES 200    application/json             /api/issues
  RES 200    application/json             /api/projects
  RES 200    application/json             /api/team/people?includeArchived=true
  RES 200    application/json             /api/auth/session
  RES 200    application/json             /api/accountability/action-items
  RES 200    application/json             /api/documents?type=wiki
  ws-close ws://localhost:5174/?token=jxNxqz55pBDf
  ws-close ws://localhost:3000/events
  ws-open  ws://localhost:5174/?token=jxNxqz55pBDf
  REQ GET    /api/auth/me
  RES 200    application/json             /api/auth/me
  REQ GET    /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e
  REQ GET    /api/team/people
  REQ GET    /api/auth/session
  REQ GET    /api/documents?type=wiki
  REQ GET    /api/auth/session
  ws-open  ws://localhost:3000/events
  RES 200    application/json             /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e
  RES 200    application/json             /api/team/people
  RES 200    application/json             /api/auth/session
  RES 200    application/json             /api/documents?type=wiki
  RES 200    application/json             /api/auth/session
  REQ GET    /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e/comments
  REQ GET    /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e/backlinks
  REQ GET    /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e/backlinks
  RES 200    application/json             /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e/comments
  RES 200    application/json             /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e/backlinks
  RES 200    application/json             /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e/backlinks
  ws-open  ws://localhost:3000/collaboration/wiki:8335aa38-2f7d-47cf-b95f-34bf80b5e30e
  REQ GET    /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e/backlinks
  RES 200    application/json             /api/documents/8335aa38-2f7d-47cf-b95f-34bf80b5e30e/backlinks
  ws-close ws://localhost:3000/collaboration/wiki:8335aa38-2f7d-47cf-b95f-34bf80b5e30e
```

## Verdict
**Live confirmation:** pageB's WebSocket closed after pageA's PATCH. The handleVisibilityChange handler (`collaboration/index.ts:530–575`) does broadcast the close to disconnected non-admin clients. Pending Yjs updates that landed on the in-memory doc before close are visible in the persisted body above; messages from B after close are dropped.
