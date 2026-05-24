# Cat 5 — Test Coverage and Quality

**Branch:** `feat/phase2-tests` + `feat/phase2-task14-tests`
**Target:** 3 meaningful new tests for previously untested critical paths OR 3 fixed flaky tests with root cause analysis. Each test must include a comment explaining what risk it mitigates.
**Status:** ✅ Both shipped:
- 3 critical-path **regression** tests pinning the Phase 2 fixes from Cat 6 and DB-1.
- 3 critical-path **integration** tests covering the Task 14 spec topics: WebSocket session timeout, document body/properties drift, cascade-delete safety.

Total new coverage: 30 tests across 5 files (12 critical-path + 18 mapper-layer regression tests). Full suite: **494 tests pass** (was 464 before this category) across 35 files. Verified by 5 consecutive full-suite runs at HEAD.

## What was added

### Set A: Regression tests for Phase 2 fixes (`api/src/__tests__/phase2-regressions.test.ts`, 3 tests)

| Test | Mitigates | Audit ID | Type |
|---|---|---|---|
| `yjsToJson always returns a valid TipTap doc` | Silent NULL persist that empties `documents.content` while `yjs_state` survives | C-1 | Unit |
| `WS_CLOSE_SESSION_EXPIRED is 4401` | Frontend `SessionTimeoutModal` contract — distinguishes session expiry from network blip | C-2 | Constant pin |
| `JSONB hot-path indexes exist in the documents table` | DROP INDEX in a future migration silently regressing the 73% dashboard slowest-query win | DB-1 | Integration (live DB) |

### Set B: Task 14 critical-path tests

| Test file | Topic | Tests | Mitigates |
|---|---|---:|---|
| `api/src/collaboration/__tests__/session-timeout.test.ts` | WebSocket session timeout enforcement | 4 | A session that expires while a WS is open keeps accepting edits — violates NIST AAL2 15-min inactivity timeout. Pinned: `session_missing`, `inactivity_timeout`, `absolute_timeout`, and the negative case (active session stays open) |
| `api/src/__tests__/document-sync.test.ts` | Document body/properties drift | 3 | TipTap content updates without re-extracting properties leave dashboards reading stale `properties->>'plan'` while editor shows fresh body. Pinned: extractor sees body change, persist round-trip stays in sync, all 4 extractors lock-step with their headings |
| `api/src/__tests__/cascade-delete.test.ts` | Person archive cascade safety | 5 | Archiving a person leaves dangling `assignee_id` refs on issues. Pinned: (a) archive does NOT cascade-clear `assignee_id` — by design, audit history preserved — (b) the issue listing JOIN surfaces `assignee_archived=true` so the UI can render correctly, (c) `owner_id` IS cleared on programs/sprints (the documented exception), (d) person doc is soft-archived, not deleted |

Each test starts with a `// Mitigates:` block linking back to the audit finding (Set A) or to the Task 14 risk rationale (Set B). This matches the spec: "Each test must include a comment explaining what risk it mitigates."

### Why the Set B tests required a small refactor

`startWsSessionRevalidationTick` was a tight wrapper around `setInterval(...)` that pulled directly from module-scoped `conns` / `eventConns` maps and `pool.query` — testable only by spinning up a real server. The Task 14 spec's session-timeout test would have been heavy that way, so I extracted the decision logic into `revalidateWsSessions({ conns, eventConns, fetchSessions, now? })` — a pure function the tests drive directly. The setInterval wrapper still exists and calls the new function. No behavior change.

This refactor also means the close-code + reason contract is now structurally enforceable in a unit test, not just observable in a live integration run.

## Run

```bash
pnpm --filter @ship/api test src/__tests__/phase2-regressions.test.ts
# →  Test Files  1 passed (1)
#       Tests   3 passed (3)
```

Full suite stays green: `pnpm --filter @ship/api test` → 35 files, 494 tests (pre-existing 464 + 12 Task 14 + 18 mapper-layer regression).

## Why these three

Three Phase 1 critical findings (C-1, C-2, plus the high-severity DB-1) reached production-ish state. The fix in each case touches code that:
- Compiles cleanly without the regression coverage — so type-check alone wouldn't catch a future change.
- Has a non-obvious failure mode that wouldn't show up in routine smoke testing — silent NULLs, expired sessions still writing, EXPLAIN ANALYZE shape drift on a different schema migration.

Each test is intentionally narrow. The underlying components have their own deeper suites:
- `api/src/utils/__tests__/yjsConverter.test.ts` (added in Cat 6) — 7 tests covering the type contract end-to-end.
- `api/src/__tests__/error-handler.test.ts` (added in Cat 6) — 3 tests pinning the JSON-error-response shape.
- `api/src/__tests__/auth.test.ts` (15 tests, already in the codebase) — covers the cookie-and-throttle behavior that mirrors the session-touch throttle.

The 3 in this file exist to make a future regression visible at the **critical-path level** without forcing you to read 50 lines of test setup to understand what's being protected.

## Tradeoffs

- The DB-1 test runs against the live dev Postgres, so it requires `docker compose up -d` to pass. That matches the rest of the api test suite's expectations (the existing `api-content-preservation.test.ts` and `accountability.test.ts` already require it).
- The WS_CLOSE_SESSION_EXPIRED test is a constant-pin rather than a full integration test (mock client opens a WS, server closes it, client observes close code 4401). The full integration version needs an http.Server + WebSocketServer scaffold; under the deadline I shipped the constant-pin as the floor and noted it.
- No flaky tests in the existing suite met the "flaky" definition (passes sometimes, fails others). The audit's Cat 5 baseline ran the suite 3× and got identical results each time. Therefore the alternate path ("fix 3 flaky tests") wasn't applicable.
