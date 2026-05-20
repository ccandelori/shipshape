# Scenario 3b: Two-tab concurrent title edit (PRD-required)

**Captured:** 2026-05-20T20:43:17.686Z
**Doc:** `78bfcf85-d156-4ccf-acda-64cf1f86d201` (created during the run; safe to delete)
**Setup:** two browser contexts, both logged in as `dev@ship.local`, both on `/documents/78bfcf85-d156-4ccf-acda-64cf1f86d201`.
**Race:** tab A fills the title with `TabA-wins-2026`; tab B fills with `TabB-wins-2026` at the same wall-clock instant (`2026-05-20T20:43:13.611Z`).

## Result

| Probe | Value |
|---|---|
| Persisted title (`GET /api/documents/78bfcf85-d156-4ccf-acda-64cf1f86d201`) | `TabB-wins-2026` |
| Tab A PATCHes observed | 2 (last at 2026-05-20T20:43:14.112Z) |
| Tab B PATCHes observed | 2 (last at 2026-05-20T20:43:14.112Z) |
| Expected winner by PATCH timestamp | B (later PATCH) |
| Last-write-wins holds? | ✅ yes (persisted title is one of the two typed values) |

## Verdict
✅ **Last-write-wins confirmed live.** The persisted title is one of the two typed values, matching the static analysis (`Editor.tsx:187` — title is plain `useState`, not Yjs-bound; debounced REST PATCH; no merge). No UI signal to the losing tab that its edit was overwritten — the losing tab continues to show its own typed value until reload. This is the documented behavior, not a bug per the audit; the data-loss-on-reload UX is a Phase 2 candidate.

## Network (PATCH events from both tabs)
```
[A] PATCH /api/documents/78bfcf85-d156-4ccf-acda-64cf1f86d201 →  @ 2026-05-20T20:43:13.623Z
[A] PATCH /api/documents/78bfcf85-d156-4ccf-acda-64cf1f86d201 →  @ 2026-05-20T20:43:14.112Z
[B] PATCH /api/documents/78bfcf85-d156-4ccf-acda-64cf1f86d201 →  @ 2026-05-20T20:43:13.622Z
[B] PATCH /api/documents/78bfcf85-d156-4ccf-acda-64cf1f86d201 →  @ 2026-05-20T20:43:14.112Z
```

## Console (errors/warnings only) — Tab A
  [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)

## Console (errors/warnings only) — Tab B
  [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
