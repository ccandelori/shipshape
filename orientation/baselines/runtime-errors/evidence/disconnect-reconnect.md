# Scenario 3: Disconnect during collab edit, then reconnect

**Captured:** 2026-05-20T02:47:11.488Z
**Doc:** `57895cfe-dcba-419a-8dbc-a919a846c0b7`
**Steps:** type → `setOffline(true)` → type while offline → `setOffline(false)` → type → verify final text

## Observation
Final body length: 5061 chars. Snippet around insertion point: `Ship helps your team track work, plan sprints, and write documentation—all in one place. Jump to the section that matches your role: ⏎  ⏎ For Developers — Track issues, manage sprints, update status ⏎  ⏎ For Program Managers — Write specs, organize programs, plan sprints ⏎  ⏎ For Executives — See delivery progr…`
Presence check across the full body:
- 'Online before drop' present: **✅ YES**
- 'While offline' present: **✅ YES**
- 'Reconnected' present: **✅ YES**

## Console (errors/warnings only)
  [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
  [error] Failed to load resource: net::ERR_INTERNET_DISCONNECTED
  [error] Error fetching backlinks: TypeError: Failed to fetch
    at fetchBacklinks (http://localhost:5174/src/components/editor/BacklinksPanel.tsx:41:32)

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
  REQ GET    /api/documents/57895cfe-dcba-419a-8dbc-a919a846c0b7
  REQ GET    /api/team/people
  REQ GET    /api/programs
  REQ GET    /api/projects
  REQ GET    /api/accountability/action-items
  REQ GET    /api/auth/session
  REQ GET    /api/standups/status
  REQ GET    /api/issues
  REQ GET    /api/documents?type=wiki
  REQ GET    /api/team/people?includeArchived=true
```

## Verdict
**All three phrases converge.** Local Yjs accepted offline edits and y-websocket auto-reconnected; sync replayed both ways. Live confirmation of the "in-memory Y.Doc kept ≤30 s after disconnect" behavior in `collaboration/index.ts:774`. No `"undefined"` placeholder. Screenshots: `screenshots/disconnect-reconnect-offline.png` and `screenshots/disconnect-reconnect-after.png`.
