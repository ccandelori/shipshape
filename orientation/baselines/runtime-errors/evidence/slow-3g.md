# Scenario 4: Slow-3G page load

**Captured:** 2026-05-20T02:53:02.301Z
**Throttle:** latency 2000 ms, throughput 50 Kbps (down/up), via CDP `Network.emulateNetworkConditions` AFTER login.
**Doc:** `ba2fc1e3-62c6-4f46-9313-9bd950b01933` (small wiki, 51 chars content).

## Observation
Total time from `goto` until throttle disabled + 5 s settle: ~17.1 s (NOT a clean TTI — includes the 10 s where throttle was active).

**At 3 s under throttle:** skeletons=0, ProseMirror nodes=0, spinner-like=0.
Body text (first 400 chars): ``

**At 10 s under throttle:** skeletons=0, ProseMirror nodes=0.
Body text (first 400 chars): ``

Final screenshot (throttle off, +5 s settle): `screenshots/slow-3g-final.png`. HTML at 3 s: `screenshots/slow-3g-3s.html`.

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
  RES 200    application/json             /api/auth/caia/status
  RES 200    application/json             /api/setup/status
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
  ws-close ws://localhost:5174/?token=jxNxqz55pBDf
  ws-close ws://localhost:3000/events
  ws-open  ws://localhost:5174/?token=jxNxqz55pBDf
  REQ GET    /api/auth/me
  RES 200    application/json             /api/auth/me
  REQ GET    /api/documents/ba2fc1e3-62c6-4f46-9313-9bd950b01933
  REQ GET    /api/team/people
  REQ GET    /api/programs
  REQ GET    /api/projects
  REQ GET    /api/accountability/action-items
  REQ GET    /api/auth/session
  REQ GET    /api/standups/status
  REQ GET    /api/issues
  REQ GET    /api/documents?type=wiki
  REQ GET    /api/team/people?includeArchived=true
  REQ GET    /api/auth/session
  ws-open  ws://localhost:3000/events
  RES 200    application/json             /api/documents/ba2fc1e3-62c6-4f46-9313-9bd950b01933
  RES 200    application/json             /api/team/people
  RES 200    application/json             /api/programs
  RES 200    application/json             /api/standups/status
  RES 200    application/json             /api/projects
  REQ GET    /api/documents/ba2fc1e3-62c6-4f46-9313-9bd950b01933/comments
  REQ GET    /api/documents/ba2fc1e3-62c6-4f46-9313-9bd950b01933/backlinks
  REQ GET    /api/documents/ba2fc1e3-62c6-4f46-9313-9bd950b01933/backlinks
  RES 200    application/json             /api/documents?type=wiki
  RES 200    application/json             /api/auth/session
  RES 200    application/json             /api/issues
  RES 200    application/json             /api/team/people?includeArchived=true
  RES 200    application/json             /api/auth/session
  RES 200    application/json             /api/accountability/action-items
  RES 200    application/json             /api/documents/ba2fc1e3-62c6-4f46-9313-9bd950b01933/comments
  RES 200    application/json             /api/documents/ba2fc1e3-62c6-4f46-9313-9bd950b01933/backlinks
  RES 200    application/json             /api/documents/ba2fc1e3-62c6-4f46-9313-9bd950b01933/backlinks
  ws-open  ws://localhost:3000/collaboration/wiki:ba2fc1e3-62c6-4f46-9313-9bd950b01933
```
