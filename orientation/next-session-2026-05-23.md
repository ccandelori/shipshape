# Next-Session Handoff — 2026-05-22 (deploy + flake fixes + Phase 3 merge)

**Last touched:** 2026-05-22 (late night CT, after droplet went live)
**Predecessor:** [`orientation/next-session-phase3.md`](next-session-phase3.md) (Phase 3 kickoff handoff)
**Final submission deadline:** Sunday 2026-05-24 10:59 PM CT — **TOMORROW**
**Live deploy:** http://143.198.163.184/ — Ship on a DigitalOcean droplet ($12/mo, NYC1, Ubuntu 24.04)

---

## What landed today (in order)

### 1. Phase 3 / Task 27 + 28 — `pnpm shipshape` orchestrator

Built the institutional-memory layer the predecessor handoff teed up. Single command reproduces every Phase 2 measurement and emits `orientation/shipshape-report.md`. Lite mode (`pnpm shipshape:ci`) wired into GitHub Actions.

- Branch (merged): `feat/phase3-shipshape`
- Architecture: `scripts/shipshape/{run.ts, run-ci.ts, types.ts, util.ts, report.ts, checks/*.ts}`
- Self-test verified: 15 `: any` markers → Cat 1 fails (548 → 563 past 560) → exit 1; remove fixture → exit 0
- Writeup: [`orientation/improvements/shipshape.md`](improvements/shipshape.md)

### 2. Phase 3 / Task 30 — collaboration integrity observability

`GET /health/collaboration` (JSON) + `GET /metrics` (Prometheus exposition) surfacing six runtime signals: `documents_content_null_count`, `documents_with_recent_persist`, `ws_connections_open`, `ws_session_4401_count_5m / _total`, `persist_failure_count_total` + `last_persist_failures` ring buffer.

- Branch (merged): `feat/phase3-collab-observability`
- Three integration tests pin one regression class each (`api/src/__tests__/collaboration-health.test.ts`)
- Hand-written Prom exposition (no prom-client dep)
- Writeup: [`orientation/improvements/collab-observability.md`](improvements/collab-observability.md)

Task 29 (Zod schemas) deferred — task spec itself flags 1-2 day refactor, too much risk this close to the deadline.

### 3. Both Phase 3 branches merged to master (`--no-ff`)

`master` now contains Tasks 27/28/30 + Phase 3 docs. `pnpm shipshape` on merged master: 5 PASS + 2 SKIP (Cat 3 + 7 need dev stack), exit 0.

Merge commits: `e08ffec` (shipshape), `11b5038` (collab observability). Tasks.json union resolved (Tasks 27, 28, 30 all `done`).

### 4. CodeRabbit config + cookie-injection hardening

`.coderabbit.yaml` scopes future reviews to code (excludes docs, baselines, lock files, build/coverage output, task state). CodeRabbit then flagged shell-injection risk on `SHIPSHAPE_SESSION_COOKIE` + `SHIPSHAPE_API_URL` interpolation in `scripts/shipshape/checks/api.ts`. Fixed with:

- Regex validation: `/^[A-Za-z0-9._%-]{16,1024}$/` for the cookie (accepts URL-safe base64 + Express signed cookies; rejects every shell metacharacter)
- `new URL()` parsing for `SHIPSHAPE_API_URL` + protocol restriction
- `execFileSync` array-args for autocannon (no shell at all)
- Nullable `baseline` on autocannon crash (was misleading `{p90:0, p97_5:0}`)

Adversarial probe: 2/2 legit cookies accepted, 6/6 injection attempts rejected (semicolon, quote, `$()`, backtick, short, newline). Commit `866d073`.

### 5. Full E2E suite run + dbContainer timeout fix

Ran all 71 spec files (869 tests) at 4 workers. 861 passed, 2 hard failures + 6 flakes. Diagnosis: all 8 failures had the same stack trace — `Test timeout of 60000ms exceeded while setting up "dbContainer"`. The per-test Playwright timeout (60s) was tighter than the fixture's `withStartupTimeout(120000)`, so cold-start tests in each worker died before their Postgres testcontainer was ready.

Fix: bumped per-test timeout to 120000ms in `playwright.config.ts`. Commit `e3dbdc2`.

### 6. Tasks 31 + 32 filed (and then fixed)

After the timeout fix, two real test-design races survived — they kept showing up as flakes. Filed Tasks 31/32 + new Task 33 (the my-week-stale-data flakes that survived even after the Task 31/32 fixes).

Branch: `fix/e2e-test-flakes` (not yet merged).

**Task 31 — combobox ARIA test selector race.** Test used `.first()` against `[aria-haspopup="listbox"], [role="combobox"]` which was picking up the issues-list filter combobox instead of the properties-sidebar one. Fix: added `data-testid="properties-panel"` wrapper to `PropertiesPanel.tsx` + scoped the test's locator through that testid + auto-waiting matchers. 10/10 soak passed. Commit `0399ea4`.

**Task 32 — allocation grid read-after-write race.** `POST /api/weekly-plans` uses `(person_id, week_number)` uniqueness without scoping by `project_id`. A prior test's plan with a different project_id was returned by the POST, then the grid query (which filters by project_id) didn't match. Fix: PATCH the plan's project_id explicitly after POST. 10/10 soak passed. Commit `68c2cb4`.

**Task 33 — filed, not fixed.** my-week-stale-data tests read /my-week before debounced Yjs persist commits. Suggested fix in the task: wait for the editor's `data-testid="sync-status"` to show "Saved" before navigating. Commit `65a25e0`.

### 7. DigitalOcean droplet deploy — the big one

After looking at the cost of standing up the upstream AWS topology (~$110/mo idle on the as-shipped Terraform — EB + Aurora Serverless + NAT Gateway + WAF + CloudFront + Route53), pivoted to a $12/mo DigitalOcean droplet. Full bootstrap + deploy from a clean Ubuntu 24.04 box. Branch: `feat/droplet-deploy` (not yet merged).

**Code changes (4 commits):**

| Commit | What |
|---|---|
| `7329a2d` | `api/src/config/ssm.ts` — skip AWS SSM call when `DATABASE_URL` + `SESSION_SECRET` are already in env. Was hard-crashing on `CredentialsProviderError` in production mode. |
| `81535c3` | First pass at `cookie.secure` override (only Express session, not the auth `session_id` cookie). |
| `cf98672` | Centralized `COOKIE_SECURE` in `api/src/utils/cookieSecure.ts` — applied to **all five** `res.cookie('session_id', ...)` call sites + Express session. The original symptom: login returned 200 but `session_id` had `Secure` attribute, browsers dropped it over HTTP, every subsequent request was 401 → "expired" redirect. |
| `18b1262` | Documented `/events` WS endpoint in the deployment.md routing diagram. |

**Infra commits:**

| Commit | What |
|---|---|
| `a0d39b0` | `scripts/deploy-droplet.sh` — one-command pipeline (build → pnpm deploy → strip cruft → rsync → symlink swap → systemctl restart → smoke). `orientation/deployment.md` rewritten from EB-shaped to droplet-shaped. `.gitignore` for `.deploy/`. |

**On the droplet:**

- Ubuntu 24.04.3 LTS, Node 22.22, pnpm 10.27, Postgres 16.14, nginx 1.24, fail2ban, certbot
- `ship` user (sudo, NOPASSWD, SSH-key auth)
- `ship-api.service` systemd unit, `EnvironmentFile=/etc/ship/env`
- Postgres tuned for 2 GB (shared_buffers=512MB, etc.), 42 migrations marked applied, 18 tables
- `/opt/ship/releases/<ts>/{api,web}/`, `/opt/ship/current` symlink
- nginx routes `/api/*` (HTTP), `/collaboration/*` (WS upgrade), `/events` (WS upgrade), `/health` (HTTP), `/*` (SPA fallback)
- ufw allows 22/80/443

**Verification:**

Cameron created the admin account via the web setup flow, logged in, landed on `/docs` with the sidebar populated. `[RealtimeEvents] Connected` + `Received: "connected"` + `Received: "pong"` in the browser console — WS is fully alive. The nginx access log confirms `GET /events → HTTP 101 Switching Protocols` (twice — initial connect + a reconnect). A single `/api/auth/me 401` in the console is a benign page-load race (the SPA fires the auth probe before the cookie has propagated; the second call succeeds, which is why the M avatar + sidebar render).

---

## Branch map (end of session)

| Branch | Commits ahead of master | Status |
|---|---|---|
| `master` | — (66 commits ahead of `origin/master`) | Phase 3 merged; not pushed |
| `feat/droplet-deploy` | 5 | **Not merged.** Production deploy code lives here. |
| `fix/e2e-test-flakes` | 3 | **Not merged.** Tasks 31 + 32 fixes + Task 33 file. |
| `feat/phase3-shipshape` | (merged into master) | Done. |
| `feat/phase3-collab-observability` | (merged into master) | Done. |

Recommended merge order (whenever Cameron decides):

```bash
git merge --no-ff fix/e2e-test-flakes      # E2E reliability
git merge --no-ff feat/droplet-deploy      # production deploy code paths
pnpm shipshape                              # final scorecard on merged master
```

---

## Live state of the droplet

- **URL:** http://143.198.163.184/
- **Health:** `curl http://143.198.163.184/health` → `{"status":"ok"}`
- **Admin account:** cameron.nigro@gmail.com (password Cameron set, 8+ chars)
- **SSH access:** `ssh ship@143.198.163.184` (NOPASSWD sudo) or `ssh root@143.198.163.184`
- **Resource usage:** ~67 MB RSS for ship-api, ~50 MB Postgres, plenty of headroom on 2 GB
- **Postgres:** local, no managed-DB. Tuned for the box.
- **TLS:** none. HTTP only. certbot is installed; needs a DNS A record pointing here to issue Let's Encrypt.

---

## Known open items

### Phase 2 submission punch list (unchanged from predecessor handoff — Cameron's offline work)

| # | Task | What |
|---|---|---|
| 20 | AI cost analysis | $ figures + reflection paragraph from Claude billing dashboard |
| 21 | Demo video | Re-record ≤5 min, host (YouTube unlisted / Loom), URL into `SUBMISSION.md` |
| 22 | Deployed fork URL | **DONE today** — http://143.198.163.184/. Update `SUBMISSION.md` "Deployed Application" section. |
| 23 | Social post | Drafts in `orientation/social-post.md`. Post, paste URL. |
| 24 | Final submission | Push `master` → `origin/master` after 20/21/23 fill in. |

### E2E + deploy follow-ups

| # | Source | What |
|---|---|---|
| Task 33 | E2E reliability | my-week-stale-data flakes — wait for sync-status "Saved" before navigating |
| — | Deploy hardening | CAIA SecretsManager noise on every `/api/caia/*` hit. Same fix pattern as SSM — env-var bypass. |
| — | Deploy hardening | PHP-scanner bot getting `200 + index.html` on every probe. Add nginx 404 rules + configure fail2ban (already installed, no jails set up). |
| — | Deploy hardening | TLS — once Cameron points a domain at the droplet, `sudo certbot --nginx -d <domain>` issues Let's Encrypt + rewrites nginx. |
| — | Deploy hardening | Disable root SSH login after verifying `ship` user works across reboots. One line in `sshd_config`. |
| — | Deploy hardening | Session store is in-memory (`MemoryStore`). Fine for one process; needs `connect-pg-simple` or redis if scaling. |

### Branches awaiting merge

- `fix/e2e-test-flakes` (3 commits)
- `feat/droplet-deploy` (5 commits)

Both clean, both pre-merged-state. The droplet has the `feat/droplet-deploy` code running because we rsynced the dist/ directly — but the source on master doesn't yet reflect it.

---

## Recommended next-session priorities (Sunday deadline)

1. **Update `SUBMISSION.md` Deployed Application section** with `http://143.198.163.184/`. Short task. **Unblocks the submission deliverable.**
2. **Merge `feat/droplet-deploy` and `fix/e2e-test-flakes` to master** — both clean, both ready.
3. **Cameron pulls Claude $ figures** + writes the reflection paragraph in `orientation/ai-cost-analysis.md`.
4. **Re-record demo video ≤5 min.** Outline in `orientation/demo-video.md`. Per memory: silent-read time × 1.7 = recording time; aim for ~3-min text-read script.
5. **Push `master` → `origin/master`** once 1-4 are settled.
6. **Post X + LinkedIn drafts.** Paste posted URLs into `orientation/social-post.md`.

After that, the brief's 8 deliverables are all green.

Stretch (not required for submission):
- Address the CAIA SecretsManager noise (same env-var bypass as SSM)
- nginx hardening for the scanner bot
- DNS + TLS for the droplet (gives the demo a proper URL)
- Task 33 my-week stale-data flake fix

---

## Commands to verify cold-state

```bash
# 1. State of master
cd /Users/sheep/Desktop/Gauntlet/ship
git log --oneline -10
git branch | grep -E "feat/droplet|fix/e2e|master"

# 2. shipshape on master
pnpm shipshape   # expect 5 PASS + 2 SKIP, exit 0

# 3. Droplet healthy
curl -sf http://143.198.163.184/health   # expect {"status":"ok"}

# 4. ship-api status
ssh root@143.198.163.184 'systemctl is-active ship-api nginx postgresql'

# 5. droplet deploy from scratch (any subsequent deploy)
bash scripts/deploy-droplet.sh   # build + rsync + restart + smoke
```

---

## Quick-reference: gotchas surfaced today

1. **macOS ships openrsync now** (not GNU rsync). Doesn't support `--info=stats2`. The deploy script uses `-az` only.
2. **`pnpm deploy` needs `--legacy` in pnpm 10** (no `inject-workspace-packages=true` in the workspace).
3. **`pnpm deploy` target must be inside the workspace tree** — outside-tree targets trigger a path-resolution bug where the virtual store ends up at `/Users/tmp` (macOS) instead of `/tmp`. The deploy script uses `.deploy/` inside the workspace.
4. **Ship's migrate.ts halts on first "already exists" error.** When schema.sql is the cumulative state AND migration files re-create those tables, migrations 010+ fail. Workaround: pre-populate `schema_migrations` with all migration versions after schema.sql succeeds (deploy-droplet.sh doesn't currently do this — would need to add for clean first-deploys to a fresh DB).
5. **The "deferred WAS the bug" pattern.** Both deploy fixes (SSM bypass, cookie.secure override) were AWS-tied code paths that crashed/silently broke on non-AWS hosts. Pattern worth remembering: production-only branches often assume AWS — guard them with env-var feature flags so non-AWS deploys don't trip.
6. **`secure: true` on HTTP origins drops the Set-Cookie SILENTLY** — Express's session middleware doesn't even emit the header. Cookies appear to work (response is 200) but never persist. Anyone serving Ship over HTTP for any reason needs `SHIP_COOKIES_SECURE=0`.
7. **Ship has TWO WebSocket endpoints**, not one. `/collaboration/{type}:{uuid}` for Yjs per-doc sync + `/events` for realtime notifications. nginx needs upgrade headers on BOTH.

---

## What I'd do differently next time

- **Scaffold the droplet bootstrap as a one-shot script first**, then iterate. Doing it in-shell with SSH heredocs was reliable but slow; a `scripts/bootstrap-droplet.sh` would have been faster to debug and is the right artifact for "do this on a fresh box" reproducibility.
- **Catch the AWS-only paths upfront** with a `grep -r '@aws-sdk\|AWS_' api/src` audit before deploying anywhere non-AWS. Would have saved two redeploy cycles (SSM + Secrets Manager + cookie.secure issues all surfaced sequentially in the same pattern).
- **Don't trust `os.freemem()` on macOS.** It reports a tiny number (0.3 GB) because the kernel uses inactive memory for buffer cache. Real available is `free + inactive + speculative + purgeable` from `vm_stat` (~13 GB on the same box). Cost me a "wait is this box about to swap" digression while sizing Playwright workers.
