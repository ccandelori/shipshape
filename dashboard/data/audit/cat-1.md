## Category 1: Type Safety

### Methodology

Static text analysis with ripgrep 14.1.1 over four scopes — `web/src` (React + Vite + TipTap), `api/src` (Express + Yjs collab), `shared/src` (cross-package types), and `e2e/` (Playwright) — restricted to `.ts` / `.tsx`. Five violation classes were measured: explicit `: any` (colon-form), type assertions (`as <Type>`, excluding `as const` and `import …as`), non-null assertions (`!.`, `![`, `!)`), `@ts-ignore`, and `@ts-expect-error`. Each `as <Type>` count was further filtered to a curated union of primitive type names + PascalCase identifiers, then sampled by hand to discount false positives such as SQL `column AS alias` inside template-literal queries, English prose ("treat X as Y"), and `if (!['a','b'].includes(x))` patterns producing spurious `![` hits. Per-file densities computed via `sort | uniq -c | sort -rn` over the filtered match list. `pnpm type-check` was **re-run live on 2026-05-19 from the main thread** after the audit agent's sandbox had blocked it. **Result: exit 0 — all three packages type-check clean.** **Scope caveat:** `pnpm type-check` recurses across the packages in `pnpm-workspace.yaml`, which lists only `api`, `web`, and `shared` — **`e2e/` is not in the workspace and has no `tsconfig.json` of its own, so it is not type-checked by any current command.** 76 `.ts` spec files under `e2e/` are silently un-verified. *Phase 2 action item:* add `e2e/tsconfig.json` extending root + register `e2e` in `pnpm-workspace.yaml` (or add a root script `tsc --noEmit -p e2e/tsconfig.json`). The 747 violations counted below are not compile errors; they are stylistic / safety-net concerns the compiler currently accepts under the strict-mode flags that *are* enabled. Phase 2 improvements should focus on making the violations *unnecessary* (via mappers + better types), not on fixing compile errors. Live output saved to `orientation/baselines/type-safety/tsc-output.txt`. Raw match files are preserved under `orientation/baselines/` so Phase-2 work can re-derive any sub-metric without re-running ripgrep. tsconfig settings read from `/tsconfig.json` and each package's `tsconfig.json`; `extends` chains followed.

### Baseline metrics

| Metric | Baseline |
|---|---|
| Total explicit `any` types (`: any`) | **103** |
| Total type assertions (`as`) — excluding `as const` & imports | **577** |
| Total non-null assertions (`!`) | **~66** |
| Total `@ts-ignore` | **0** |
| Total `@ts-expect-error` | **1** |
| Strict mode enabled (root) | Yes |
| `noUncheckedIndexedAccess` (web / api / shared) | **No / Yes / Yes** |
| `exactOptionalPropertyTypes` (root) | No |
| `pnpm type-check` error count | **0** (live `pnpm type-check` run 2026-05-19, exit 0; output at `baselines/type-safety/tsc-output.txt`) |
| **Total combined violations** | **747** |

**Per-package breakdown:**

| Package | `: any` | `as Type` | `!` (non-null) | `@ts-*` | Subtotal |
|---|---:|---:|---:|---:|---:|
| `api/src`    | 75 | 288 | ~22 | 0 | **385** |
| `web/src`    | 24 | 267 | ~28 | 1 | **320** |
| `e2e/`       |  4 |  22 | ~16 | 0 |  **42** |
| `shared/src` |  0 |   0 |   0 | 0 |   **0** |
| **Total**    | **103** | **577** | **~66** | **1** | **747** |

Reconciliation with the earlier presearch "~1,474 as-assertions": that figure matches the raw `' as '` line count (1,546) which includes SQL column aliases inside route SQL template literals (`d.title as name`) and `import * as X` statements. Once SQL aliases and imports are excluded, real TypeScript-level `as <Type>` assertions drop to **577**. Both numbers are kept on file so callers can pick the bound they prefer.

**Production-vs-test split (added 2026-05-20):** of the 747 total, approximately **498 are in production code** and **249 are in test files** (~67% / 33%). The split was derived by re-running the audit's exact `: any` and `as <Type>` ripgrep filters with a `\.test\.(ts|tsx)|__tests__/` path predicate:

| Package | `: any` prod / test | `as <Type>` prod / test |
|---|---|---|
| `api/src` | 54 / 21 | 116 / 172 |
| `web/src` | 24 / 0 | 252 / 15 |
| `e2e/` | 4 / 0 | 22 / 0 |

The test-side concentration is the pg-mock `as any` cluster in `api/src/services/accountability.test.ts` + 3 sibling test files (172 `as <Type>` matches across api tests; the `as any` form dominates). One typed `mockPgQuery<T>` helper collapses ~150 of these. The headline 747 is real; the Phase 2 target is defensible because the production-only count (~498) is still well above the 560 target — i.e., even if all test-side noise were removed first, real production work is still required.

**Top 5 violation-dense files** (combined `: any` + real `as` assertions):

| File | `as` | `: any` / `as any` | Total | Why dense |
|---|---:|---:|---:|---|
| `api/src/services/accountability.test.ts` | 34 | 33 | **67** | Every `vi.mocked(pool.query).mockResolvedValue({rows: []} as any)` line — pg mock setup, ~30 calls. |
| `api/src/__tests__/transformIssueLinks.test.ts` | 28 | 37 | **65** | Mock-call introspection: `vi.mocked(...).mock.calls[0]![1] as any[]` — combines non-null + `as any[]` on each assertion. |
| `api/src/__tests__/auth.test.ts` | 33 | 24 | **57** | Express request-builder fixtures stubbed as `any` to dodge missing session-shape declarations. |
| `api/src/__tests__/activity.test.ts` | 23 | 21 | **44** | Same pattern: mock pool rows + `mock.calls[n]![m] as string`. |
| `api/src/routes/weeks.ts` | 25 | 10 | **35** | Production route casts: `req.query.user_id as string`, `id as string`, raw pg rows widened to `Record<string, unknown>`. |

(`web/src/pages/UnifiedDocumentPage.tsx` at 29 narrowly trails — **densest production-code file**: 25+ lines casting `document.properties?.x as string | undefined` because `UnifiedDocument` does not narrow its `properties` JSON blob per document type.)

### Top findings

1. **Web tsconfig drops three safety flags from root.** `web/tsconfig.json` is a standalone config that sets `"strict": true` but **omits `noUncheckedIndexedAccess`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`** that the root enables for `api`/`shared`. Result: React code can index arrays/records without `T | undefined` propagation, and switch fallthrough is silently allowed. **Fix:** change `web/tsconfig.json` to `{"extends": "../tsconfig.json", "compilerOptions": { /* DOM lib + jsx + paths only */ }}`. Severity: **High** — entire web package is one flag away from catching dozens of real bugs at compile time.

2. **Test files saturated with `as any` over pg mocks.** `api/src/services/accountability.test.ts` and the four `api/src/__tests__/*.test.ts` collectively contain ~160 `as any` casts. **Fix:** introduce a typed `mockPgQuery<T>(rows: T[])` helper that returns `QueryResult<T>` already-shaped; one helper collapses ~150 violations. Severity: **Medium** — test-only, no runtime risk, but masks future schema/API changes.

3. **Production `req.query.x as string` everywhere in routes.** `api/src/routes/weeks.ts:91,123,124,800,1238,…` plus `team.ts`, `projects.ts`, `claude.ts`. These assertions silently widen `string | string[] | undefined` to `string`, so any client sending `?user_id=a&user_id=b` produces an array that flows through as a string and breaks SQL. **Fix:** introduce a single `requireQueryString(req, 'user_id')` validator (or adopt Zod request schemas) — already partially in place via OpenAPI registration per CLAUDE.md. Severity: **High** — real input-validation gap, security/correctness adjacent.

4. **`document.properties as <T>` casts in web mirror the unified-document-model untyping.** `UnifiedDocumentPage.tsx`, `UnifiedEditor.tsx`, `PropertiesPanel.tsx`, `ProjectDetailsTab.tsx`, and all `document-tabs/*Tab.tsx` files repeat the same shape: `document.properties?.foo as string | undefined`. ~80 such casts. **Fix:** define discriminated `DocumentByType` (`IssueDocument`, `ProjectDocument`, `WeekDocument`, …) and a `narrowDocument(doc): DocumentByType` mapper invoked once at the edge of each tab. Collapses all `properties?.x as Y` casts to direct property access. Severity: **Medium** — pure refactor, big DX win across the 4-panel editor.

5. **Non-null assertions on hook refs / route params.** `useSessionTimeout.ts` clears intervals via `countdownIntervalRef.current!`, `useProjectsQuery.ts:369/390` calls `fetchProjectIssues(projectId!)`, and `Editor.tsx` uses `wsProvider!` on three lines. These bypass the safety the strict null checks were supposed to provide. **Fix:** wrap React Query `useQuery` calls with the `enabled: !!projectId` pattern and let the `queryFn` use `projectId` after narrowing — TS 5+ already understands this idiom. For `wsProvider!`, gate the call site on a real null check. Severity: **Low/Medium**.

**Bonus:** `api/src/types/y-protocols.d.ts` contains 11 `any` declarations because `y-protocols` ships no `.d.ts`. Replacing with a proper module declaration cuts 11 violations and unlocks Yjs IntelliSense. Severity: **Low**.

### Improvement target (per brief)

Eliminate **25%** of type-safety violations. Baseline: **747** → target: **560** (reduction of **187**). Two single moves — fixing `web/tsconfig.json` to extend root (finding 1) + introducing the typed pg-mock helper (finding 2) — together project to eliminate ~150 violations on their own. Adding `requireQueryString`/Zod adoption (finding 3) lands the remaining gap with margin.

### Raw data files

- `orientation/baselines/type-safety/tsc-output.txt` — live `pnpm type-check` (exit 0, all packages clean)
- `orientation/baselines/type-safety/counts.txt` (full per-package counts, method notes, tsconfig table)
- `orientation/baselines/raw/type-safety/` — 58 raw ripgrep outputs per package (any/as/non-null/assertions strict/no-imports). Evidence-of-process; the methodology block above is the reproducibility contract.

---
