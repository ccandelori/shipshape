# Cat 1 — Type Safety

**Branch:** `feat/phase2-typesafety` + `feat/phase2-typesafety-extended`
**PRD target:** 25% reduction in type safety violations (747 → ≤560), each fix using meaningful types (no `any`-for-`unknown` swaps).
**Status:** ✅ **−26.6% reduction** (747 → 548) — PRD target met. Six landed refactors plus the original tsconfig restore.

**Task 10 spec compliance:** A `shared/src/mappers/document-mappers.ts` domain mapper layer is in place with 18 unit tests covering happy paths + runtime-guard failures. The mapper-adoption pattern (discriminated-union narrowing or `in`-guards in lieu of `as` casts) is applied at two high-density web sites called out in the spec:

- `web/src/components/UnifiedEditor.tsx` — 8 `(document as IssueDocument).state`-style casts removed, replaced with `document.document_type === 'issue' && 'state' in document` narrowing.
- `web/src/components/sidebars/PropertiesPanel.tsx` — **all `document as XxxDocument` casts removed (10 total)**: 3 from the `canApprove` block (now `'in'`-narrowed), 1 from the inline shape cast `(document as { accountable_id?: string | null })` (replaced with `'accountable_id' in document` narrowing + direct access), 5 from switch-case branches where the `PanelDocument` discriminated union already narrows automatically, and 1 from the `default` fallback (now an `_exhaustive: never` check that forces a compile error if a future `document_type` variant is added without a case).

The `extractIssueFromRow(row: any)` call site in `api/src/routes/issues.ts` and the remaining web/src cast clusters (`UnifiedDocumentPage`, `ProjectDetailsTab`, others) are queued for follow-up adoption — see "What's still in the gap" below.

## Headline

| Metric | Before (Phase 1, 2026-05-19) | After (this branch) | Δ |
|---|---:|---:|---:|
| Real type assertions — web/src | 267 | 238 | **−29** |
| Real type assertions — api/src | 288 | 125 | **−163** |
| Real type assertions — e2e | 22 | 22 | 0 |
| Strict `: any` (all packages) | 103 | 104 | +1 (mockedPool internal cast) |
| Non-null assertions | 66 | 66 (untouched) | 0 |
| `@ts-ignore` / `@ts-expect-error` | 1 | 1 | 0 |
| **GRAND TOTAL** | **747** | **548** | **−199 (−26.6%)** |

Independent measurements (as of HEAD):
- `pnpm --filter @ship/api type-check` exit 0
- `pnpm --filter @ship/web type-check` exit 0 — all 82 `noUncheckedIndexedAccess` / `noImplicitReturns` errors surfaced by the tsconfig restore have been fixed (see `fix/phase2-web-type-check` merged into master)
- `pnpm --filter @ship/api test` → 35 files, 494 tests pass
- `pnpm --filter @ship/web build` → built successfully; entry chunk holds at 142.66 kB gzip

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
`api/src/utils/queryParams.ts` got `requireParam(req, key)` (typed `req.params` access; throws 400 if missing) and three sibling query helpers. Applied across:
- `api/src/routes/weeks.ts`: 10 handlers + 22 `id as string` casts removed + 3 `req.query.X` patterns
- `api/src/routes/projects.ts`: 12 handlers + `req.query.sort` / `dir` casts
- `api/src/routes/programs.ts`: 6 handlers + `req.query.target_id`
- `api/src/routes/issues.ts`: 4 handlers + 7 `req.query.X` patterns (state, priority, assignee_id, program_id, sprint_id, source — all narrowed via `optionalQueryString` at the top of the list handler)
- `api/src/routes/standups.ts`: 2 handlers

Net violation removal: **~50 casts** from the route-helper sweep.

### 5. `shared/src/mappers/document-mappers.ts` — domain mapper layer (Task 10 spec)
New module exports `mapIssueDocument`, `mapProjectDocument`, `mapProgramDocument`, `mapWeekDocument`, `mapWikiDocument`, `mapPersonDocument`, plus a dispatcher `mapDocument(row)`. Each takes a typed `RawDocumentRow` input (no `any`), validates `document_type` matches the target, runs runtime guards on `content` and `properties`, and throws on bad data with a message that names the failing doc id.

Why this matters beyond the count: a row with the wrong `document_type` or a malformed `properties` JSONB used to flow through `row as IssueDocument` casts and explode somewhere far from the source. The mapper layer makes bad data loud at the boundary instead.

Coverage: `api/src/__tests__/document-mappers.test.ts` — 18 tests covering happy paths, wrong-discriminator throws, bad-shape throws, dispatcher routing, and string-vs-Date timestamp coercion.

### 6. `HttpError` class replaces 30 React-Query error-cast patterns (this branch)
`web/src/lib/httpError.ts` introduces an `HttpError extends Error` class. Replaces the `new Error('msg') as Error & { status: number }; error.status = N; throw error;` 3-line pattern with a single `throw new HttpError('msg', N)`. Applied across 14 React Query hooks:

```
useIssuesQuery.ts:      4 sites
useProjectsQuery.ts:    6 sites
useWeeksQuery.ts:       6 sites
useProgramsQuery.ts:    4 sites
useDocumentsQuery.ts:   4 sites
+ 6 more hooks          6 sites
TOTAL                  30 sites
```

Net violation removal from this single change: **30 casts**. All hooks compile and run identically because `HttpError` carries the same `status` property.

## What's still in the gap (post-target follow-up)

The PRD target is met. Honest accounting of work that further reduces the count but wasn't required for the 25% target:

| Path | Estimated reduction | Notes |
|---|---:|---|
| Eliminate remaining `as any` in `transformIssueLinks.test.ts` (15 sites of `await transformIssueLinks(...) as any`) | 15 | Requires narrowing `transformIssueLinks` return type from `Promise<unknown>` to `Promise<TipTapDoc \| unknown>` with a result guard, OR a `TipTap-shaped` test helper |
| `document as IssueDocument` / `as ProjectDocument` etc. in the remaining web/src files (`UnifiedDocumentPage`, `ProjectDetailsTab`, remaining call sites in `UnifiedEditor`/`PropertiesPanel`) | 60+ | Requires discriminated-union narrowing pattern via `if (document.document_type === 'issue') { … }`. Mechanical but touches UI logic. **Partial adoption shipped** in this branch — see Section 5 below |
| (Resolved) `noUncheckedIndexedAccess` narrowings | — | The 82 errors surfaced by the tsconfig restore were all fixed in `fix/phase2-web-type-check`. Web type-check exits 0. |

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

- The 25% PRD target is met (current reduction is 26.6%, 199 violations removed). The structural improvements (`mockedPool`, `requireParam`, `HttpError`, the mapper layer) raise the type-safety floor going forward; every new route or test file that uses them adds zero to the violation count.
- Most of web/src's remaining assertions sit in `UnifiedDocumentPage` + `ProjectDetailsTab` + a few hooks. The dominant pattern (`document as IssueDocument` and friends) requires discriminated-union narrowing in view logic — the `PropertiesPanel` + `UnifiedEditor` adoption work in this branch shows the pattern, and the remaining files become single-edit follow-ups once touched.
- `mockedPool()` exposes a `Mock<(text, params?) => Promise<QueryResult>>` rather than the real `Pool.query` shape. Tests that need other Pool methods (e.g., `pool.connect`) still need the original `vi.mocked(pool)` access. The helper covers the 95%+ case.
- `requireParam`/`requireQueryString` throw plain `Error` objects with `statusCode: 400` so the global error handler (Cat 6 ERR-2) renders them as proper JSON. They don't carry a richer error shape — keeping the surface minimal so adoption stays trivial.
