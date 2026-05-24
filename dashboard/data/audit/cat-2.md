## Category 2: Bundle Size

### Methodology

Measured with a live production build: `pnpm build:web`, which runs `build:shared` first and then `@ship/web`'s Vite build. Output was captured in `orientation/baselines/bundle/build.txt`; chunk sizes were copied to `files-js.txt` / `files-css.txt`; package attribution was captured in `per-package.txt`; and the interactive treemap artifact exists at `orientation/baselines/bundle/bundle-baseline.html`.

**Reproducibility (resolved 2026-05-20):** `web/vite.config.ts` now conditionally loads `rollup-plugin-visualizer` when `BUNDLE_ANALYZE=1`. `orientation/baselines/bundle/regenerate.sh` regenerates the treemap and the build log from a clean checkout in one command. Anyone with a fresh clone can reproduce `bundle-baseline.html` and `build.txt` byte-for-byte (modulo non-deterministic hashes in dist filenames).

### Baseline metrics (live `pnpm build:web` run 2026-05-19)

| Metric | Baseline |
|---|---|
| Total production bundle size (`web/dist/`) | **4.5 MB** (uncompressed disk) |
| Total JS (uncompressed) | sum of 261 chunks |
| Total CSS | **65.0 KB** (single CSS bundle) |
| **Largest JS chunk** | **`index-C2vAyoQ1.js` — 2,073.70 KB minified / 587.59 KB gzipped** (the eager monolith — router + Editor + devtools + emoji-picker + dnd-kit) |
| 2nd largest JS chunk | `ProgramWeeksTab` — 16.76 KB / 5.52 KB gzipped |
| Number of chunks | **261 JS files** (1 monolith + 13 lazy doc-tab chunks from `lib/document-tabs.tsx` + 247 per-icon micro-chunks from USWDS Icon component) |
| Code-splitting in use? | Partial. `React.lazy()` used for 13 document-tab components in `web/src/lib/document-tabs.tsx:52-66`, plus the USWDS Icon component's `import.meta.glob` produces a chunk per icon SVG. **No route-level lazy loading:** `web/src/main.tsx` statically imports all ~25 page components. No `manualChunks` in `vite.config.ts`. |
| Initial-load bundle (eager-loaded) | **~2,074 KB / 588 KB gzipped** (the `index-*.js` monolith; 99% of JS weight) |

**Vite's own warning** at build time (from `bundle/build.txt`): *"Some chunks are larger than 500 kB after minification."* The `index-*.js` chunk is 4× over that threshold. Vite suggests three remedies, all of which the audit's findings already prescribe: dynamic `import()`, `manualChunks`, and increasing the warning limit (the last being a band-aid only).

**Top 10 packages by rendered weight (measured 2026-05-19 via `rollup-plugin-visualizer`):**

| Rank | Package | Rendered KB | Gzip KB | % of bundle | Files |
|---|---|---:|---:|---:|---:|
| 1 | `emoji-picker-react` | **399.6** | **72.3** | **8.5%** | 1 |
| 2 | `highlight.js` (via `lowlight` `common`) | **377.9** | **118.4** | **8.1%** | 39 |
| 3 | `yjs` | 264.9 | 55.4 | 5.7% | 1 |
| 4 | `prosemirror-view` | 236.3 | 57.1 | 5.0% | 1 |
| 5 | `@tiptap/core` | 181.2 | 36.9 | 3.9% | 1 |
| 6 | `react-dom` | 131.7 | 42.3 | 2.8% | 8 |
| 7 | `prosemirror-model` | 121.2 | 28.6 | 2.6% | 1 |
| 8 | `@uswds/uswds` | 111.7 | 71.8 | 2.4% | **245** |
| 9 | `lib0` (yjs util) | 106.5 | 34.1 | 2.3% | 37 |
| 10 | `@dnd-kit/core` | 101.0 | 21.1 | 2.2% | 1 |

Other notable contributors below the top 10: `@tiptap/extension-code-block-lowlight` (80.0 KB), `prosemirror-transform` (79.9 KB), `react-router` (79.6 KB), `@tanstack/query-core` (77.4 KB across 18 files), `prosemirror-tables` (70.1 KB), `linkifyjs` (59.1 KB), `y-prosemirror` (58.7 KB across 6 files), `@popperjs/core` (57.3 KB across 54 files), `tailwind-merge` (70.3 KB).

**Top local-source files in the bundle:**

| File | Rendered KB | Gzip KB |
|---|---:|---:|
| `src/pages/App.tsx` | 74.9 | 11.4 |
| `src/pages/ReviewsPage.tsx` | 53.9 | 9.0 |
| `src/components/IssuesList.tsx` | 48.7 | 9.3 |
| `src/components/icons/uswds/Icon.tsx` | 41.7 | 3.5 |
| `src/pages/TeamMode.tsx` | 33.8 | 6.6 |
| `src/pages/WorkspaceSettings.tsx` | 30.9 | 5.1 |
| `src/components/Editor.tsx` | 30.5 | 7.1 |

Full ranked list (295 entries): `orientation/baselines/bundle/per-package.txt`. Interactive treemap: `orientation/baselines/bundle/bundle-baseline.html`.

**Reality check on earlier estimates:**
- I had estimated `lowlight + highlight.js` at **250-400 KB gzipped**. Actual: **118 KB gzipped**. My estimate was ~3× too high.
- I had estimated `@tiptap/*` at **150-250 KB gzipped**. Actual core+extensions sum: ~120 KB gzipped (across `@tiptap/core` 36.9 + extension-code-block-lowlight 23.3 + extension-collaboration ~7 + extension-collaboration-cursor ~5 + others). My estimate was on the high end.
- I had estimated `emoji-picker-react` at **80-150 KB gzipped**. Actual: **72 KB gzipped** — close but slightly under.
- I had said `@uswds/uswds` was *only* consumed via the SVG glob and "the npm JS module is not in the bundle". **That was wrong** — 245 files / 111 KB / 72 KB gzipped are in the bundle, contributing 2.4%. This is the SVG-icon glob materializing as 245 JS modules, one per icon. Lazy-loaded per icon, but eagerly shipped to anyone touching the `<Icon>` component.

**Unused dependencies identified:**

- **`@tanstack/query-sync-storage-persister`** — declared in `web/package.json:25` but **zero** importers in `web/src/`. `web/src/lib/queryClient.ts:103` defines a hand-rolled IDB persister using `idb-keyval` directly. Safe to remove. Severity: Low.
- **`@uswds/uswds`** (caveat — NOT unused): no `from '@uswds/uswds'` imports exist, but the package is consumed via `import.meta.glob('/node_modules/@uswds/uswds/dist/img/usa-icons/*.svg', ...)` in `web/src/components/icons/uswds/Icon.tsx`. The npm JS module is not in the bundle; only individual rendered SVGs are. **Do not remove** — needed for the SVG asset glob.

### Top findings

1. **No route-level code splitting.** `web/src/main.tsx:19-43` statically imports ~25 page components including `AdminDashboardPage`, `AdminWorkspaceDetailPage`, `WorkspaceSettingsPage`, `OrgChartPage`, `ReviewsPage`, `StatusOverviewPage`, `SetupPage`, `InviteAcceptPage`. Every visitor downloads admin and setup code on first load; super-admin pages account for an estimated 5–10% of route code. **Fix family:** wrap each `<Route element={...}>` in `React.lazy(() => import('@/pages/X'))` and add a top-level `<Suspense fallback={…}>`. Highest leverage targets: `Admin*`, `OrgChartPage` (carries `@dnd-kit/*`), `StatusOverviewPage`, `ReviewsPage`, `SetupPage`, `InviteAcceptPage`. Severity: **High**.

2. **`lowlight` loads ~37 syntax-highlight grammars at startup.** `web/src/components/Editor.tsx:12` does `import { common, createLowlight } from 'lowlight'`; line 46 wires `common` into `CodeBlockLowlight`. Any page containing `<Editor>` triggers the full common grammar set on first paint. Realistic single-largest contributor to JS weight. **Fix family:** switch to `createLowlight({})` and `register()` only the languages actually used (typescript, javascript, python, bash, sql, json), or move language registration behind a dynamic `import()` triggered when the user focuses a code block. Severity: **High**.

3. **`ReactQueryDevtools` ships to production.** `web/src/main.tsx:6` statically imports `@tanstack/react-query-devtools` and line 265 always renders `<ReactQueryDevtools initialIsOpen={false} />`. Devtools are ~50–100 KB gzipped and intended for dev only. **Fix family:** gate behind `import.meta.env.DEV` with a dynamic import. Severity: **High** (free win, zero UX cost).

4. **`emoji-picker-react` is eagerly loaded.** `web/src/components/EmojiPicker.tsx` is the only consumer, but it is statically imported wherever used. Emoji picker is discretionary — most users never open it. **Fix family:** convert `EmojiPicker.tsx` itself, or its callers, to `React.lazy()` so the 80–150 KB emoji dataset only loads on demand. Alternative: replace with a much smaller SVG/sprite-based picker. Severity: **Medium**.

5. **`@dnd-kit/core` + `sortable` + `utilities` (~2.1 MB unpacked) ship for everyone but are used in 2 files.** `KanbanBoard.tsx` and `OrgChartPage.tsx` are the only consumers. **Fix family:** lazy-load `KanbanBoard` and `OrgChartPage` (compounds with finding #1). Severity: **Medium**.

6. **No `build.sourcemap` configured.** `web/vite.config.ts` does not set `build.sourcemap`; Vite's production default is `false`. This means **`source-map-explorer` cannot work even when a build runs**, and blocks future bundle-composition analyses. **Fix family:** set `build.sourcemap: 'hidden'` — keeps Lighthouse happy while enabling analyzer tooling. Severity: **Medium** (process blocker for ongoing audits).

7. **No `manualChunks` strategy.** Without `build.rollupOptions.output.manualChunks`, Rollup's automatic chunker may co-locate the editor blob with the router/shell, defeating route-level splits later. **Fix family:** once route lazy-loading is in place, add a `manualChunks` function that pulls TipTap+yjs+lowlight into a single `editor` chunk and `@tanstack/*` into a `query` chunk. Severity: **Medium** (dependent on #1 and #2).

8. **Dead dependency: `@tanstack/query-sync-storage-persister`.** No importer in `web/src/`. Drop from `web/package.json`. Severity: **Low**.

9. **`tippy.js` CSS is bundled inline.** `Editor.tsx:43` does `import 'tippy.js/dist/tippy.css'`. Small (~3 KB gzipped) but lives in the eager Editor module. **Fix family:** defer alongside any editor-chunk split. Severity: **Low**.

10. **~~Bundle treemap generation is not reproducible from checked-in config.~~ [Resolved 2026-05-20.]** `web/vite.config.ts` now conditionally loads `rollup-plugin-visualizer` when `BUNDLE_ANALYZE=1`. `orientation/baselines/bundle/regenerate.sh` produces `build.txt` + `bundle-baseline.html` in one command from a clean checkout. Severity: was Medium (process gap), now closed.

### Improvement target (per brief)

**15%** reduction in total production bundle, OR **20%** reduction in initial-load bundle via code splitting. Removing features doesn't count.

Realistic plan to clear the target with margin (compounded):
- Lazy-load admin/setup/org-chart/reviews routes (#1) → est. **10–15%** off initial-load.
- Strip `ReactQueryDevtools` from production (#3) → est. **3–7%** off total/initial.
- Replace `lowlight`'s `common` with targeted language list (#2) → est. **5–10%** off total, larger off the editor chunk specifically.
- Lazy-load `EmojiPicker` (#4) → est. **2–5%** off initial-load.

Compounded, the 20% initial-load target is achievable without removing any user-facing functionality.

### Raw data files

- `orientation/baselines/bundle/build.txt` — live `pnpm build:web` output (2026-05-19, built in 2.61s)
- `orientation/baselines/bundle/files-js.txt` — all 261 JS chunks sorted by size
- `orientation/baselines/bundle/files-css.txt` — CSS chunks
- `orientation/baselines/bundle/static-analysis.txt` — code-splitting, lazy-loading, Suspense, manualChunks, sourcemap, Editor weight, devtools-in-prod findings derived from source.
- `orientation/baselines/bundle/unused-deps.txt` — per-dep ripgrep import counts in `web/src/` plus resolved package sizes from `node_modules/.pnpm/`.
- `orientation/baselines/bundle/bundle-baseline.html` — interactive treemap artifact; regenerable from a clean checkout via `bash orientation/baselines/bundle/regenerate.sh` (closed 2026-05-20).

---
