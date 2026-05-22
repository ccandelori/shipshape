# Cat 5 — Test Coverage and Quality

**Branch:** `feat/phase2-tests`
**PRD target:** 3 meaningful new tests for previously untested critical paths OR 3 fixed flaky tests with root cause analysis. Each test must include a comment explaining what risk it mitigates.
**Status:** ✅ 3 new tests landed in `api/src/__tests__/phase2-regressions.test.ts`, each pinning a Phase 2 fix that came out of a critical-tier audit finding.

## What was added

| Test | Mitigates | Audit ID | Type |
|---|---|---|---|
| `yjsToJson always returns a valid TipTap doc` | Silent NULL persist that empties `documents.content` while `yjs_state` survives | C-1 | Unit |
| `WS_CLOSE_SESSION_EXPIRED is 4401` | Frontend `SessionTimeoutModal` contract — distinguishes session expiry from network blip | C-2 | Constant pin |
| `JSONB hot-path indexes exist in the documents table` | DROP INDEX in a future migration silently regressing the 73% dashboard slowest-query win | DB-1 | Integration (live DB) |

Each test starts with a `// Mitigates:` block linking back to the audit finding, the original symptom, and the Phase 2 fix that addressed it. This is the structure the PRD asked for: "Each test must include a comment explaining what risk it mitigates."

## Run

```bash
pnpm --filter @ship/api test src/__tests__/phase2-regressions.test.ts
# →  Test Files  1 passed (1)
#       Tests   3 passed (3)
```

Full suite stays green: `pnpm --filter @ship/api test` → 30 files, 461 + 3 = 464 tests.

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
- No flaky tests in the existing suite met the "flaky" PRD definition (passes sometimes, fails others). The audit's Cat 5 baseline ran the suite 3× and got identical results each time. Therefore the alternate PRD path ("fix 3 flaky tests") wasn't applicable.
