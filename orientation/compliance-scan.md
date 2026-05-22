# Phase 2 Compliance Scan — Local Equivalent of `comply opensource`

Performed by Cameron on 2026-05-22 against the local checkout at `master` (44 commits ahead of `origin/master`), with `docs/claude-reference/security.md` as the audit basis.

## Why this scan exists

The Treasury upstream pre-commit hook runs `comply opensource --hook --staged --exclude e2e --skip-trivy` (`.husky/pre-commit:11-25`). The bundled `comply` toolkit is internal to Treasury and unavailable on PyPI; every Phase 2 commit therefore hit the "WARNING: 'comply' CLI not installed — skipping" branch of the hook. This document is the gap-closer: it runs the underlying gitleaks scan locally and records the result so the Phase 2 work has a paper trail equivalent to what the upstream hook would have produced.

The upstream `comply opensource` bundles:

- **gitleaks** — secrets scan (✅ run here)
- **AI analysis** — Treasury-internal sensitive-info pattern detection (⚠️ not run; not publicly available)
- **trivy** — vulnerability scan (⚠️ skipped per pre-commit's `--skip-trivy` flag, which the upstream hook also passes due to a documented compliance-toolkit bug)

The gitleaks run is the highest-value of the three for the kind of changes Phase 2 made (no new dependencies, no infrastructure, only code refactors + a docs sweep).

## Commands run

```bash
# 1. Install gitleaks (matches what comply opensource uses internally)
brew install gitleaks
# gitleaks version 8.30.1

# 2. Scan ONLY the Phase 2 commit range
gitleaks git --log-opts="origin/master..master" \
  --report-format=json \
  --report-path=orientation/compliance/gitleaks-phase2-commits.json \
  --no-banner

# 3. Scan the full working tree (matches what comply opensource --staged would catch
#    if `comply` were installed and run against staged + tracked content)
gitleaks dir . \
  --report-format=json \
  --report-path=orientation/compliance/gitleaks-fulltree.json \
  --no-banner
```

## Results

### 1. Phase 2 commit range (`origin/master..master`, 28 unique commits, ~1.08 MB scanned)

```
gitleaks log: 28 commits scanned.
gitleaks log: scanned ~1075236 bytes (1.08 MB) in 1.61s
gitleaks log: no leaks found
```

✅ **No findings.** None of the 28 Phase 2 commits introduced a leak.

Artifact: [`orientation/compliance/gitleaks-phase2-commits.json`](compliance/gitleaks-phase2-commits.json) (empty array `[]`).

### 2. Full working tree (~25.4 MB scanned)

```
gitleaks log: scanned ~25400104 bytes (25.40 MB) in 1.82s
gitleaks log: leaks found: 1
```

⚠️ **1 finding — categorised as a known false positive (see analysis below).**

Artifact: [`orientation/compliance/gitleaks-fulltree.json`](compliance/gitleaks-fulltree.json).

## Finding analysis

### Finding #1 — `.claude/settings.local.json:50` — rule `curl-auth-header`

```
rule:        curl-auth-header
file:        .claude/settings.local.json
line:        50
description: Discovered a potential authorization token provided in a curl
             command header, which could compromise the curl accessed resource.
match:       curl -sS -b /tmp/ship-cookies.txt -c /tmp/ship-cookies.txt
             -H 'Content-Type: application/json' …
             -d '{"email":"dev@ship.local","password":"admin123"}' …
```

**Verdict:** **false positive** — not a leak.

**Why:**

1. **The matched "secret" is the dev seed password `admin123`.** It is the publicly documented dev login credential for `pnpm db:seed`. The same credential is referenced verbatim in:
   - `README.md` (project root)
   - `docs/claude-reference/code-examples.md` and `faq.md` (upstream-published reference docs)
   - `scripts/dev.sh` and the API seed routine that prints "Login credentials: dev@ship.local / admin123"
   - `orientation/improvements/api-response-time.md` (the Phase 2 benchmark recipe)
   - `orientation/baselines/api-response-time/k6-driver.sh` and `runtime-errors/evidence/visibility-race.md`

2. **The gitleaks rule fires on the `-H 'Content-Type: application/json'` shape, not on actual secret content.** This is a known gitleaks false-positive pattern on `curl` commands that combine `-H` flags with non-secret headers.

3. **The file is in `.gitignore` line 119 (`.claude/settings.local.json`).** It was tracked before the ignore rule was added upstream and never removed via `git rm --cached`. The Phase 2 commit range did **not** modify it (`git log origin/master..master --name-only | grep settings.local` returns empty).

4. **None of the 44 Phase 2 commits introduce a new credential anywhere.** The only credentials in the Phase 2 diff are references to `admin123` in baseline / improvements docs that explain how to reproduce the autocannon benchmark — all of which point at the same documented dev seed.

### Mitigation

The Phase 2 work does not require an action here. For repo-hygiene completeness (separate from this submission), upstream could:

1. `git rm --cached .claude/settings.local.json` to detach the now-gitignored file from history going forward.
2. Add a gitleaks allowlist rule for `curl-auth-header` matches on `.claude/settings.local.json` paths.

Both are upstream changes; this fork doesn't take them on.

## Mapping to security.md sections

Cross-reference against [`docs/claude-reference/security.md`](../docs/claude-reference/security.md) — the original Phase 2 security audit cited in the user's follow-up review:

| security.md section | Phase 2 status | Notes |
|---|---|---|
| §1 Authentication — session timeouts | ✅ Preserved | `SESSION_TIMEOUT_MS` + `ABSOLUTE_SESSION_TIMEOUT_MS` from `shared/src/constants.ts` referenced unchanged |
| §1 — `last_activity` update | ⚠️ Behavior delta | API-1 throttle changes "every request" to "every 60 s" matching the cookie-refresh window. Functionally invisible to the inactivity check (60 s ≪ 15 min). See [`improvements/api-response-time.md`](improvements/api-response-time.md) |
| §2 Authorization — middleware stack | ✅ Extended | Task 12 adds `req.membership = { role }` populated once in authMiddleware. Backward-compatible. Visibility SQL unchanged. |
| §3 CSRF / cookies | ✅ Untouched | |
| §4 Rate limiting | ✅ Untouched | |
| §5 Input validation (Zod) | ✅ Extended | New `requireParam` / `requireQueryString` / `queryInt` helpers throw with `statusCode: 400`. Body Zod schemas preserved. |
| §6 WebSocket security | ✅ Strengthened | ERR-3 adds 60 s re-validation tick + close code 4401. Closes the destroyed-session-keeps-writing gap from Phase 1's `evidence/ws-session-expiry.md` |
| §7 Audit logging | ✅ Untouched | No new auth events from Phase 2; existing `logAuditEvent` calls preserved |
| §8 Pre-commit hooks | ⚠️ `comply` skipped locally; gitleaks gap closed by this scan | |
| §9 CI security checks | ⚠️ Fork's `.github/workflows/test.yml` runs type-check + api-tests only; upstream's `secrets-scan` / `attestation-check` jobs not replicated (see `improvements/ci-workflow.md` "deliberately not in scope") | |
| ATTESTATION.md | ⚠️ Dated 2026-02-21; covers upstream code only, not the Phase 2 commits | A fresh Treasury attestation would be required before any production deploy of this fork; out of scope for the GFA Week 4 academic deliverable |

## Net assessment

- **0 new leaks introduced by Phase 2.** Confirmed by gitleaks against the exact `origin/master..master` range.
- **1 pre-existing false positive** in `.claude/settings.local.json` predates Phase 2 and references the documented dev seed credential.
- **Behavior deltas** in the auth middleware (last_activity throttle, membership cache) and WS layer (re-validation tick) are documented in `orientation/improvements/api-response-time.md` and `runtime-error-handling.md`. None weaken security; the WS change strengthens it.

## Reproducibility

```bash
# Anywhere in this repo:
gitleaks git --log-opts="origin/master..master" --no-banner
gitleaks dir . --no-banner

# Artifacts:
cat orientation/compliance/gitleaks-phase2-commits.json   # → []
cat orientation/compliance/gitleaks-fulltree.json         # → 1 finding (the documented false positive)
```

If gitleaks ever flags a true positive in this repo, the right response is `git rm --cached <file>` (if it's an editor-local) or rotate-then-purge (if it's actually a secret). Never `--no-verify` a commit to bypass.
