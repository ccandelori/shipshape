# Normal-usage console baseline — Cat 6

**Captured:** 2026-05-20T14:35:57.241Z
**Web:** http://localhost:5173  **API:** http://localhost:3000
**Method:** clean browser context, login → walk routes → wait for network-idle → record errors/warnings/pageerrors per route.

## Totals

- console.error:   1
- console.warning: 0
- page errors:     0

## Per-route

| Route | Errors | Warnings | Page errors |
|---|---:|---:|---:|
| Login (unauth) (`/login`) | 1 | 0 | 0 |
| Dashboard (`/dashboard`) | 0 | 0 | 0 |
| My Week (`/my-week`) | 0 | 0 | 0 |
| Docs list (`/docs`) | 0 | 0 | 0 |
| Issues list (`/issues`) | 0 | 0 | 0 |
| Projects list (`/projects`) | 0 | 0 | 0 |
| Programs list (`/programs`) | 0 | 0 | 0 |
| Team allocation (`/team/allocation`) | 0 | 0 | 0 |
| Team directory (`/team/directory`) | 0 | 0 | 0 |
| Settings (`/settings`) | 0 | 0 | 0 |
| Document editor (wiki) (`/documents/57895cfe-dcba-419a-8dbc-a919a846c0b7`) | 0 | 0 | 0 |

See per-route detail files: `evidence/normal-usage-<slug>.md`.

## Notes

- The one `/login` error is a structurally-expected 401 from `/api/auth/me`: the app probes for an existing session on every page load; on the unauthenticated login route the probe always returns 401. It is logged by the browser as a console error because of how `fetch` surfaces non-2xx responses to the network panel, not because the app threw. This is the same behavior every unauthenticated visit produces and is not a regression candidate. All other walked routes are clean (0 errors, 0 warnings, 0 uncaught page errors).
- Capture method is reproducible: rerun via `node orientation/baselines/runtime-errors/normal-usage.mjs` with a clean dev DB (`docker compose up -d`) and the standard `pnpm dev` stack.
