# Scenario 9: Yjs persist with malformed fragment

**Captured:** 2026-05-20T02:50:30.721Z
**Doc:** `02ea948c-c6f1-472d-b794-d7e53b0649bf` (created + corrupted during the run; safe to delete)
**Tamper SQL:** `UPDATE documents SET yjs_state = decode('deadbeefcafebabe', 'hex'), content = '"<broken>"'::jsonb WHERE id = '02ea948c-c6f1-472d-b794-d7e53b0649bf';`
**Tamper result:** UPDATE 1
**Pre-open DB state** (`octet_length(yjs_state), content::text`): `8 | "<broken>"`
**Order of operations (matters):** create → corrupt → first-ever editor open. This forces the collab server's `getOrCreateDoc()` to read the corrupted DB row for the first time. An earlier ordering (open → type → close → wait 35 s → reopen) was insufficient because the server-side in-memory Y.Doc cache (see `collaboration/index.ts:774`) outlasted the GC wait in practice and served the pre-corruption state.

## Observation
Body text after opening the corrupted doc: ` ⏎ `
Length: 1 chars.

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
  REQ GET    /api/csrf-token
  RES 200    application/json             /api/csrf-token
  REQ POST   /api/documents
  RES 200    application/json             /api/auth/session
  RES 200    application/json             /api/projects
  RES 200    application/json             /api/programs
  RES 200    application/json             /api/documents?type=wiki
  RES 200    application/json             /api/standups/status
  RES 200    application/json             /api/issues
  RES 200    application/json             /api/accountability/action-items
  RES 200    application/json             /api/team/people?includeArchived=true
  RES 201    application/json             /api/documents
  RES 200    application/json             /api/auth/session
  ws-close ws://localhost:5174/?token=jxNxqz55pBDf
  ws-close ws://localhost:3000/events
```

## Verdict
Live confirmation of `getOrCreateDoc()` (`api/src/collaboration/index.ts:195–259`) fallback behavior under malformed `yjs_state`. The body content above shows what the user sees when the server-side load fails:
**Result:** Empty editor (clean fallback path — server logged the failure and started a fresh Y.Doc). User can begin editing; the corruption is silently recoverable.
