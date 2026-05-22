# Cat 1 — Type Safety

**Branch:** `feat/phase2-typesafety` + `feat/phase2-typesafety-extended`
**PRD target:** 25% reduction in type safety violations (747 → ≤560), each fix using meaningful types (no `any`-for-`unknown` swaps).
**Status:** ⚠️ **−19.3% reduction** (747 → 603) via three landed refactors plus the original tsconfig restore. Gap to 25%: 43 violations.

## Headline

| Metric | Before (Phase 1, 2026-05-19) | After (this branch) | Δ |
|---|---:|---:|---:|
| Real type assertions — web/src | 267 | 267 | 0 |
| Real type assertions — api/src | 288 | 143 | **−145** |
| Real type assertions — e2e | 22 | 22 | 0 |
| Strict `: any` (all packages) | 103 | 104 | +1 (mockedPool internal cast) |
| Non-null assertions | 66 | 66 (untouched) | 0 |
| `@ts-ignore` / `@ts-expect-error` | 1 | 1 | 0 |
| **GRAND TOTAL** | **747** | **603** | **−144 (−19.3%)** |

Independent measurements:
- `pnpm --filter @ship/api type-check` exit 0
- `pnpm --filter @ship/api test` → 31 files, 464 tests pass
- `pnpm --filter @ship/web type-check` still surfaces ~80 noUncheckedIndexedAccess errors from the tsconfig restore (documented below — they're the next batch of work, all real bugs)

Methodology: identical to baseline (`orientation/baselines/type-safety/counts.txt`):
```bash
for d in web/src api/src shared/src e2e; do
  rg -n ' as ' --type ts "$d" | grep -v 'as const' | grep -v 'import .* as' \
    | grep -cE ' as ([A-Z][a-zA-Z_0-9]*|any|unknown|string|number|boolean|never|void)'
done
```

## Fixes shipped

### 1. `web/tsconfig.json` extends root + 2 critical sites narrowed
Already documented in the first TS-1 commit. Restored 3 safety flags that had been silently dropped from the web package. Fixed 2 real correctness bugs (`cn.ts` hex parsing, `useSelection.ts` range/focus narrowing).

### 2. `pgResult<T>` typed test helper
First commit converted 73 `mockResolvedValue({ rows: […] } as any)` patterns to `pgResult([…])` in 4 test files. The conversion was incomplete on its own — see #3 below for the chain-typing fix that actually drops them from the count.

### 3. `mockedPool()` typed alias drops the `as any` chain pattern (this branch)
Vitest's overload inference on `Pool.query` types the mock chain as `Promise<void>` once any `as any` parameter passes through. That forced every subsequent `mockResolvedValueOnce(pgResult([…]))` to also need an `as any` cast, defeating the point of the typed helper.

Fix: a single typed alias `MockedPgQuery` plus a `mockedPool()` accessor in `api/src/test-utils/pgMock.ts`:

```ts
export type MockedPgQuery = Mock<
  (text: string, params?: unknown[]) => Promise<QueryResult<QueryResultRow>>
>
export function mockedPool(): MockedPgQuery {
  return vi.mocked(pool.query) as unknown as MockedPgQuery
}
```

The internal `as unknown as MockedPgQuery` is ONE cast that pays for itself across 7 test files: every call site replaces `vi.mocked(pool.query)` with `mockedPool()`, and every chained `mockResolvedValueOnce(pgResult([…]) as any)` drops its trailing cast.

Files refactored:
- `api/src/services/accountability.test.ts`
- `api/src/__tests__/auth.test.ts`
- `api/src/__tests__/activity.test.ts`
- `api/src/__tests__/transformIssueLinks.test.ts`
- `api/src/routes/issues-history.test.ts` (new — pg-mock cluster member not in original TS-1B scope)
- `api/src/routes/projects.test.ts` (new)
- `api/src/routes/iterations.test.ts` (new)

Net violation removal from this single change: **~95 casts**.

### 4. `requireParam` + `requireQueryString` + `queryInt` route helpers (this branch)
`api/src/utils/queryParams.ts` got `requireParam(req, key)` (typed `req.params` access; throws 400 if missing) and three sibling query helpers. Applied across `api/src/routes/weeks.ts`:
- 10 handlers: `const { id } = req.params;` → `const id = requireParam(req, 'id');` (now typed `string`, not `string | undefined`)
- 22 sites: `id as string` casts removed (no longer needed)
- 3 sites: `req.query.X as string` / `parseInt(req.query.X as string, 10)` → typed helpers

Net violation removal from `weeks.ts` alone: **~22 casts**.

## What's still in the gap (43 violations to 25%)

Honest accounting of the remaining work, prioritized by yield:

| Path | Estimated reduction | Notes |
|---|---:|---|
| Apply `requireParam` to remaining route files (programs.ts, projects.ts, team.ts, issues.ts) | 20+ | Same mechanical refactor as weeks.ts |
| Eliminate remaining `as any` in `transformIssueLinks.test.ts` (15 sites of `await transformIssueLinks(...) as any`) | 15 | Requires narrowing `transformIssueLinks` return type from `Promise<unknown>` to `Promise<TipTapDoc \| unknown>` with a result guard, OR a `TipTap-shaped` test helper |
| `document as IssueDocument` / `as ProjectDocument` etc. in web/src (`UnifiedEditor`, `UnifiedDocumentPage`, `ProjectDetailsTab`, `PropertiesPanel`) | 60+ | Requires discriminated-union narrowing pattern via `if (document.document_type === 'issue') { … }`. Mechanical but touches UI logic |
| Finish `noUncheckedIndexedAccess` narrowings exposed by the tsconfig restore (~80 web errors) | (compile errors, not in audit count) | The errors are real bugs (DOM data attributes, lookups with no bounds check). Each fix is small but they're scattered |

The mechanical work (route helpers across the other 4 route files) alone would push the reduction past 25%. The deeper work (web/src `document as Type` narrowings) is high-leverage but riskier — each change touches view-level state coupling.

## Reproducibility

```bash
pnpm --filter @ship/api type-check    # → exit 0
pnpm --filter @ship/api test          # → 31 files, 464 tests pass

# Per-package count, baseline methodology
for d in web/src api/src shared/src e2e; do
  echo -n "$d: "
  rg -n ' as ' --type ts "$d" 2>/dev/null \
    | grep -v 'as const' | grep -v 'import .* as' \
    | grep -cE ' as ([A-Z][a-zA-Z_0-9]*|any|unknown|string|number|boolean|never|void)'
done
```

Raw baseline counts: `orientation/baselines/type-safety/counts.txt` + `orientation/baselines/raw/type-safety/*`.

## Tradeoffs

- The 25% PRD target was not hit head-on. The structural improvements (`mockedPool`, `requireParam`) raise the type-safety floor going forward; every new route or test file that uses them adds zero to the violation count.
- The web/src 267 assertions sit untouched in this branch because the dominant pattern (`document as IssueDocument` and friends) requires discriminated-union narrowing in view logic. Doing it safely is a per-file refactor — too risky inside the Friday deadline.
- `mockedPool()` exposes a `Mock<(text, params?) => Promise<QueryResult>>` rather than the real `Pool.query` shape. Tests that need other Pool methods (e.g., `pool.connect`) still need the original `vi.mocked(pool)` access. The helper covers the 95%+ case.
- `requireParam`/`requireQueryString` throw plain `Error` objects with `statusCode: 400` so the global error handler (Cat 6 ERR-2) renders them as proper JSON. They don't carry a richer error shape — keeping the surface minimal so adoption stays trivial.
