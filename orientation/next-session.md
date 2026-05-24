# Next-Session Handoff — Phase 2

**Last touched:** 2026-05-20 (late evening CT)
**Phase 1 status:** ✅ **MET on 2026-05-20**
**Phase 2 deadline:** Friday 2026-05-22 11:59 PM CT (Main spec) — Kickoff says 12:00 PM CT
**Final submission:** Sunday 2026-05-24 10:59 PM CT
**Branch:** `master`
**Demo video:** Recorded (~10 min — overshot 5-min target; not re-recording per Cameron 2026-05-20)

---

## Where Phase 1 ended

| Deliverable | Location |
|---|---|
| Audit Report — executive | `orientation/audit-report.md` (282 lines) |
| Audit Report — detailed reference | `orientation/audit-report-detailed.md` (1,091 lines) |
| Codebase Orientation Checklist (PDF Appendix A) | `orientation/README.md` (855 lines, all 8 sections) |
| Discovery Write-up (3 things, Kickoff page-12 format) | `orientation/discovery.md` |
| Raw evidence | `orientation/baselines/` — 231 artifacts |
| Demo deck (HTML, the one used to record) | `orientation/demo-deck/html/index.html` |
| Demo deck (Slidev fallback, 28 slides + 22-slide v1) | `orientation/demo-deck/slides.md`, `slides-v1.md` |
| Demo read-aloud script | `orientation/demo-deck/script.md` |
| Internal spec (from PDF brief) | `orientation/prd.md` |
| Pre-audit architectural analysis | `orientation/presearch.md` |
| 6 deep-dives | `orientation/deep-dives/` |
| spec-compliance recheck audit trail | `orientation/prd-compliance-audit.md` |

**Critical-tier findings (all live-confirmed):**

1. `yjsToJson()` silent NULL persist — `documents.content` nulled while `yjs_state` survives. Defect-injection-then-revert protocol; no master diff.
2. WebSocket session validated only at HTTP upgrade. Destroyed session keeps writing via WS until browser closes.
3. Accountability service N+1 — 30–80 SQL queries per dashboard load at production volume.
4. No global Express error handler — uncaught throws return HTML, frontend `fetch().json()` throws `SyntaxError`.

---

## Git state at close of Phase 1

**Local `master` is 2 commits ahead of `origin/master`:**

```
cd2a401  docs(orientation): close 3 audit-side gaps from ShipShape Kickoff cross-check
3eafcbb  docs(orientation): close 6 PDF-compliance gaps from the prd cross-check
```

**Uncommitted, ready to commit:** `orientation/demo-deck/` (the entire dir; `node_modules/` and `dist/` are gitignored).

**Untracked, intentionally not tracked** (decision: 2026-05-20):

- `.agents/`, `.codex/`, `AGENTS.md` — peer-agent scratch + Codex instructions (not ours)
- `.env.example` — local env template; Ship's own `.gitignore` excludes `.env*`
- `orientation/next-session.md` — this file, kept as a working memo
- `api/coverage/`, `web/coverage/` — generated artifacts, audit said don't track

---

## First moves tomorrow

### 1. Verify stack is up

```bash
cd /Users/sheep/Desktop/Gauntlet/ship
docker ps --filter name=ship-postgres --format "{{.Names}} {{.Status}}"  # → ship-postgres-1  Up X
docker compose up -d                                                      # if not up
pnpm dev                                                                   # API :3000, web :5173+
curl -sf http://localhost:3000/health                                     # → {"status":"ok"}
```

### 2. Decide on the unpushed-commits + demo-deck push

Two pending git actions:

- (a) Commit `orientation/demo-deck/` (the demo deck + script). One commit, ~5 files.
- (b) Push `master` to `origin/master` (3 commits ahead after (a)).

Push to GitLab: `git push origin master`. Origin URL: `https://labs.gauntletai.com/cameroncandelori/shipshape.git`.

### 3. Start Phase 2 — pick the first improvement

Recommended sequencing (highest impact, lowest blast-radius first):

| Order | ID | Improvement | Rationale |
|---|---|---|---|
| 1 | ERR-1 | Wrap `yjsToJson` in try/catch; persist `yjs_state` only on conversion failure | Highest impact (silent data loss); ~5-line change in `api/src/collaboration/index.ts` |
| 2 | BU-2 | Gate `ReactQueryDevtools` behind `import.meta.env.DEV` | One-line change; visible bundle-size win |
| 3 | API-1 | Throttle `sessions.last_activity` write to match cookie-refresh (60s) | One middleware change; broad impact across all auth'd endpoints |
| 4 | DB-1 | Migration `038_jsonb_hot_path_indexes.sql` (expression indexes on `state`, `assignee_id`, `sprint_number`, `owner_id`) | Single migration; clear before/after EXPLAIN ANALYZE |
| 5 | BU-1 | Route lazy-load `Admin*`, `OrgChartPage`, `StatusOverviewPage`, `ReviewsPage`, `SetupPage`, `InviteAcceptPage` via `React.lazy()` + Suspense | Compounds with BU-2 to hit the 20% initial-load target |
| 6 | TS-1 | Extend root tsconfig in `web/tsconfig.json` + typed `mockPgQuery<T>` helper + `requireQueryString` validator | Mechanical refactor; large scope |
| 7 | ERR-2 | Mount global Express error handler returning `{error: {code, message}}` JSON | Cross-cutting; touches every uncaught route |
| 8 | ERR-3 | Periodic WS session re-validation tick (60s) + frontend `SessionTimeoutModal` on close 4401 | Security fix; collaboration server + frontend coordination |
| 9 | A11Y-1, -2, -3 | Radix `Dialog.Root` swap (3 modals) + form labels (~10 inputs) + Tailwind contrast token swap | UI work; touches many files but each touch is small |
| 10 | TST-1 | 3 critical-path tests (WS session expiry · assignee orphan · `yjsToJson` drift) with `// Mitigates:` comments | Validates the fixes from ERR-1, ERR-3, and Cat 5 critical paths |
| 11 (cross-cutting) | CI | `.github/workflows/test.yml` — runs `pnpm install`, `pnpm type-check`, `pnpm test` on PR | Closes presearch risk #1 (no CI gate); not a category improvement |

**Per the brief: each improvement requires before/after measurement, reproduction proof, and a per-category write-up at `orientation/improvements/<category>.md`.**

### 4. Discovery / final-submission deliverables still pending

- **Per-category improvement docs** (`orientation/improvements/<category>.md` × 7) — lands with each Phase 2 fix
- **Demo video file/link** — already recorded (~10 min); needs hosting (YouTube unlisted / Loom / similar) + linked from `SUBMISSION.md` or README
- **AI cost analysis** (`orientation/ai-cost-analysis.md`) — Cameron's spend on Claude Code for this project + reflection
- **Deployed application** — public URL for the improved fork; options: Vercel + Railway, Cloudflare Pages + Workers, or personal AWS
- **Social post** — X / LinkedIn, tagged @GauntletAI
- **Optional but recommended: `SUBMISSION.md` at repo root** — top-level pointer file for graders, with notes for reviewers (Cameron deferred deciding on 2026-05-20; can reconsider Friday)

---

## Open decisions queued for Cameron

1. **Push the 2 unpushed commits + the demo-deck commit?** GitLab origin still at `076a18371` plus 2 unpushed today.
2. **Demo video hosting choice** — YouTube unlisted, Loom, or other? Affects the link in the final submission.
3. **Reviewer-notes location** — separate `SUBMISSION.md`, top-of-README banner, or skip entirely?
4. **Phase 2 starting category** — recommended order above starts with ERR-1 (yjsToJson try/catch); flexible. Cameron may prefer to do all error fixes together or all bundle fixes together.
5. **Phase 2 branch strategy** — single `feat/phase2-all` branch with sequential commits, or `feat/phase2-<category>` branches with `--no-ff` merges into master (the Phase 1 convention)? The brief says "labeled branches" so the latter aligns better with the rubric.

---

## Recurring gotchas (preserve from Phase 1)

- **Port 5432 conflict.** Native Postgres.app and docker compete for 5432. If `docker compose up -d` says "bind: address already in use," stop Postgres.app first: `pg_ctl stop -D "~/Library/Application Support/Postgres/var-18" -m fast`. Postgres.app also has `trust` auth that breaks API login even when not bound to 5432.
- **Web dev port non-determinism.** `scripts/dev.sh`'s port-finder lands on the first free port from 5173. Different baseline scripts hard-code different ports — `normal-usage.mjs` defaults to `:5173`; `voiceover-walk.mjs` defaults to `:4173` (preview); `scenarios.mjs` defaults to `:5174` (override via `WEB=` env).
- **VoiceOver driver requirements.** iTerm needs Accessibility + Automation permissions. `defaults read com.apple.VoiceOver4/default SCREnableAppleScript` must return `1`. `/private/var/db/Accessibility/.VoiceOverAppleScriptEnabled` must exist. Verify with `node orientation/baselines/accessibility/voiceover-probe.mjs`.
- **`playwright-chromium` postinstall.** Downloads ~169 MB Chromium. Set `allowBuilds.playwright-chromium: false` in `pnpm-workspace.yaml` if you want to skip it.
- **Nested `pnpm install`.** Use `--ignore-workspace` when installing inside a sub-project (e.g., `orientation/demo-deck/`) so pnpm doesn't try to splice it into the root workspace.
- **`tasks.json` `.id` is a string.** `jq '… | select(.id == "25")'` works; `select(.id == 25)` returns empty silently. Always quote IDs.
- **Re-running baseline scripts is non-deterministic at the byte level.** `normal-usage.mjs` regenerates 14 evidence files with fresh timestamps; verify totals (1/0/0/0), not byte-diff. `git restore orientation/baselines/runtime-errors/` after re-runs.
- **K6 vs autocannon for Phase 2 API benchmarks.** Phase 1 captured spec-literal P95 via k6 on the 2 slowest endpoints. **Phase 2 before/after must use the same tool for the same endpoints** to be apples-to-apples. K6 driver: `orientation/baselines/api-response-time/k6-driver.sh`.
- **Cat 3 X-Bench rate-limit skip.** Already in master at `api/src/app.ts` (guarded by `isTestEnv`). Run benchmarks with `E2E_TEST=1 pnpm dev:api` + `bash orientation/baselines/api-response-time/benchmark-script.sh` (autocannon) or `k6-driver.sh` (k6).
- **Defect-injection-then-revert is a documented protocol.** Used for Cat 6 Critical #1 (yjsToJson NULL). Inject, run scenario, `git restore` immediately. No master diff. See `orientation/baselines/runtime-errors/evidence/yjs-to-json-null.md` for the protocol.

---

## Memory + skill notes

- **Memory:** `feedback_narrated_demo_timing.md` was saved 2026-05-20 — assistant's silent-read time estimate ran ~60% short of actual recording time (script estimated 6 min, recording was 10 min). For future demo scripts, multiply silent-read × 1.7×.
- **Taskmaster:** `.taskmaster/tasks/tasks.json` is tracked. Tasks 25 (Phase 1 Gate Repair) and 26 (Orientation Checklist Appendix A) are marked `done`. Tasks 10–24 are pending (Phase 2 + Phase 3 work). Verify with `jq -r '.master.tasks[] | select(.status == "pending") | "\(.id) [\(.priority)] \(.title)"' .taskmaster/tasks/tasks.json`.

---

## Quick-reference grader documents (the audit submission)

This is the canonical list of grader-relevant tracked docs as of 2026-05-20:

```
orientation/audit-report.md          ← executive summary of Phase 1
orientation/audit-report-detailed.md ← full prose reference
orientation/README.md                ← PDF Appendix A Orientation Checklist
orientation/discovery.md             ← Discovery (3 things, Kickoff format)
orientation/baselines/               ← 231 raw measurement artifacts
orientation/demo-deck/html/index.html ← demo video deck
orientation/demo-deck/script.md      ← demo video read-aloud script
```

Phase 2 will add `orientation/improvements/<category>.md` × 7.
