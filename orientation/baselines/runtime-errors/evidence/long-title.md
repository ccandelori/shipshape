# Scenario 6: Very long title (10 KB)

**Captured:** 2026-05-20T02:47:17.633Z
**Doc:** `4ac16a56-5c9a-461e-8d3f-18c80603ca74` (created during the run; safe to delete)
**Title length sent:** 10000 chars.
**Title length round-tripped from `GET /api/documents/{id}`:** 15 chars (persisted: `long-title-test...`).

## Direct PATCH probe
`PATCH /api/documents/4ac16a56-5c9a-461e-8d3f-18c80603ca74` body `{"title": "A"×10000}` → **400 application/json**

```
{"error":"Invalid input","details":[{"code":"too_big","maximum":255,"type":"string","inclusive":true,"exact":false,"message":"String must contain at most 255 character(s)","path":["title"]}]}
```

## Verdict
⚠️ **Server rejected the 10 KB title.** Persisted title remained at 15 chars (the original creation title). The autosave PATCH returned 400. This is *the* live confirmation of finding #6: a max-length is enforced server-side (likely zod max), but the client surfaces no inline validation — the user types away with no feedback, autosave silently fails, the displayed title differs from persisted state on reload. Live network log shows the autosave attempts as 400s.
Editor rendering: see `screenshots/long-title.png`. Sidebar/list-row rendering: see `screenshots/long-title-list.png`.

## Console (errors/warnings only)
  [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
  [error] (×5) Failed to load resource: the server responded with a status of 400 (Bad Request)

## Network
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
  REQ GET    /api/csrf-token
  RES 200    application/json             /api/auth/session
  RES 200    application/json             /api/csrf-token
  RES 200    application/json             /api/projects
  RES 200    application/json             /api/programs
  REQ POST   /api/documents
  RES 200    application/json             /api/issues
  RES 200    application/json             /api/standups/status
  RES 200    application/json             /api/documents?type=wiki
  RES 200    application/json             /api/auth/session
  RES 200    application/json             /api/team/people?includeArchived=true
  RES 201    application/json             /api/documents
  RES 200    application/json             /api/accountability/action-items
  ws-close ws://localhost:5174/?token=jxNxqz55pBDf
  ws-close ws://localhost:3000/events
```
