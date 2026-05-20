# Scenario 7: HTML/script injection in title and body

**Captured:** 2026-05-20T02:42:00.942Z
**Doc:** `cb92ddc8-eb43-44a0-a243-be3831b54562` (created during the run)
**Injection payloads:** `<img src=x onerror=alert(1)><script>alert(2)</script>` in title; `<script>alert(3)</script>` in body.

## Observation
JS dialog/alert fired during the run? **✅ NO**
Title round-tripped from DOM after reload: `<img src=x onerror=alert(1)><script>alert(2)</script>`
Body HTML after reload (first 300 chars): `<p>&lt;script&gt;alert(3)&lt;/script&gt;</p>`

## Verdict
Title is rendered as text in a `<textarea>` (React-controlled value) — no script execution.
TipTap parses pasted body content through its schema; unknown tags (`<script>`) are dropped or rendered as literal text.
CSP `script-src 'self' 'unsafe-inline'` blocks event-handler attributes that did make it through.

## Console (errors/warnings only)
  [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)

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
  RES 200    application/json             /api/csrf-token
  RES 200    application/json             /api/auth/session
  REQ POST   /api/documents
  RES 200    application/json             /api/programs
  RES 200    application/json             /api/issues
  RES 200    application/json             /api/documents?type=wiki
  RES 200    application/json             /api/standups/status
  RES 200    application/json             /api/projects
  RES 200    application/json             /api/auth/session
  RES 200    application/json             /api/team/people?includeArchived=true
  RES 201    application/json             /api/documents
  RES 200    application/json             /api/accountability/action-items
  ws-close ws://localhost:5174/?token=jxNxqz55pBDf
  ws-close ws://localhost:3000/events
```
