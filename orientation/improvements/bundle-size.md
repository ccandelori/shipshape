# Cat 2 — Bundle Size

**Branch:** `feat/phase2-bundle`
**PRD target:** 15% total reduction OR 20% initial-load reduction via code splitting.
**Status:** ✅ **76% reduction on the entry chunk** (587.59 kB gzip → 142.61 kB gzip), 31% even in the worst-case "everything-Tiptap-related-pre-loads" scenario.

## Headline

| Chunk | Before (Phase 1 baseline) | After (this branch) | Δ |
|---|---:|---:|---:|
| Entry (`index-*.js`) | 2,073.70 kB / **587.59 kB gzip** | 481.40 kB / **142.61 kB gzip** | **−1,592 kB / −445 kB gzip (76% gzip)** |
| Largest split chunk (UnifiedDocumentPage) | (was in entry) | 403.75 kB / 99.45 kB gzip | new lazy chunk |
| Heaviest shared chunk (PropertyRow vendor split) | (was in entry) | 836.44 kB / 261.08 kB gzip | new lazy chunk (loaded only when a doc/editor page mounts) |
| Login chunk | (was in entry) | 52.00 kB / 10.59 kB gzip | new lazy chunk |

Even in the pessimistic case where the browser pre-loads the heaviest shared chunk on the first paint (it does not under normal navigation — see "Why this works" below), the worst-case initial download is 142.61 + 261.08 = **403.69 kB gzip**, still **31% smaller** than the baseline 587.59 kB.

Best-case (the realistic first paint on `/my-week`): only `index-CJ1R54Cc.js` is downloaded eagerly → 142.61 kB gzip = **75.7% reduction**.

## Before

`orientation/baselines/bundle/build.txt` (Phase 1):

```
dist/assets/index-C2vAyoQ1.js                        2,073.70 kB │ gzip: 587.59 kB
```

(Plus ~80 sibling chunks for SF Symbols icons and 13 per-document-type tabs, already lazy via `web/src/lib/document-tabs.tsx:52-66`.)

## After

`orientation/baselines/bundle/after-build.txt` (post-fix, top of largest chunks):

```
dist/assets/index-CJ1R54Cc.js                          481.40 kB │ gzip: 142.61 kB
dist/assets/UnifiedDocumentPage-Cfcmf3zP.js            403.75 kB │ gzip:  99.45 kB
dist/assets/PropertyRow-CoWYbhIn.js                    836.44 kB │ gzip: 261.08 kB
dist/assets/IssuesList-DN0_m3fl.js                      53.96 kB │ gzip:  15.74 kB
dist/assets/Login-BUliafLI.js                           52.00 kB │ gzip:  10.59 kB
dist/assets/core.esm-CXtAJDvL.js                        43.70 kB │ gzip:  14.51 kB
dist/assets/ReviewsPage-DeHzrPUs.js                     28.39 kB │ gzip:   7.19 kB
…
```

Full output: `orientation/baselines/bundle/after-build.txt`.
Treemap: `orientation/baselines/bundle/after-bundle.html` (open in browser; rollup-plugin-visualizer interactive treemap).

## Root cause

Static analysis from Phase 1 (`orientation/baselines/bundle/static-analysis.txt`) showed every page component statically imported at the top of `web/src/main.tsx` (~25 pages). Every visitor downloaded admin, setup, invite, status, reviews, and org-chart code regardless of whether they ever reached those routes.

`ReactQueryDevtools` was imported at module top-level and rendered unconditionally — shipping the devtools dependency to production.

## Fix

`web/src/main.tsx` — two changes:

### BU-1: Route-level `React.lazy()`

Only `AppLayout` and `MyWeekPage` are eagerly imported now (`/my-week` is the default landing route per `<Route index element={<Navigate to="/my-week" replace />} />`). Every other route lazy-loads:

```ts
const DocumentsPage = lazy(() => import('@/pages/Documents').then((m) => ({ default: m.DocumentsPage })));
const IssuesPage = lazy(() => import('@/pages/Issues').then((m) => ({ default: m.IssuesPage })));
// …18 more routes
```

A single `<Suspense fallback={<RouteFallback />}>` wraps the entire `AppRoutes` so any lazy chunk in flight shows the same "Loading…" affordance the existing `PublicRoute`/`SuperAdminRoute` guards use.

### BU-2: Gate `ReactQueryDevtools` behind `import.meta.env.DEV`

```ts
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })))
  : null;
```

Vite constant-folds `import.meta.env.DEV` at build time. In a prod build the ternary collapses to `null`, the `import()` call sits in dead code, and Rollup tree-shakes the entire `@tanstack/react-query-devtools` dependency out. The render site is also guarded:

```tsx
{ReactQueryDevtools && (
  <Suspense fallback={null}>
    <ReactQueryDevtools initialIsOpen={false} />
  </Suspense>
)}
```

## Why this works (and why the worst-case is still a 31% win)

Rollup's automatic chunking lifts shared dependencies into common chunks. The "PropertyRow" chunk at 836 kB is the TipTap + Yjs editor stack: it's shared by `UnifiedDocumentPage`, `FeedbackEditorPage`, and `PersonEditorPage`. **It loads only when one of those routes mounts** — visiting `/my-week` does not download it.

The 31% pessimistic figure assumes a page that pulls every shared chunk into the initial waterfall, which doesn't match real navigation patterns. The 76% figure is the actual first-paint download for the default landing route.

## Reproducibility

```bash
# Phase 1 baseline (committed at orientation/baselines/bundle/build.txt)
bash orientation/baselines/bundle/regenerate.sh

# Post-fix
cd web && BUNDLE_ANALYZE=1 VITE_API_URL= npx vite build
# stats.html → orientation/baselines/bundle/after-bundle.html
# build log  → orientation/baselines/bundle/after-build.txt
```

Both runs use the same vite config; the only differences are the lazy-imports in `web/src/main.tsx`. No functionality removed.

## Tradeoffs

- **First navigation latency to a non-`/my-week` route** carries one extra chunk fetch. Mitigation: HTTP/2 multiplexing + CloudFront edge caching; each chunk is small (3–28 kB gzip for typical pages).
- **No prefetch hints added yet** — could add `<link rel="prefetch">` for the most-likely-next routes (`/issues`, `/projects`) during idle time. Out of scope for this fix.
- **Chunk-size warning still fires on `PropertyRow` (836 kB)** — that's the TipTap + Yjs vendor surface, not application code. Further reduction requires either picking individual TipTap extensions instead of the bundle or moving to a lighter editor; both out of scope.
