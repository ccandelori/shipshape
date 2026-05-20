# Deep Dive — Authentication Providers

> Companion to `orientation/README.md §3 Request Flow` and `request-flow-and-auth.md`.
> Sources read: `docs/application-architecture.md`, `docs/fpki-auth-client-dcr-analysis.md`, `docs/claude-reference/gotchas.md`, `docs/claude-reference/security.md`.
> Code to verify against: `api/src/routes/auth.ts`, `api/src/routes/caia-auth.ts`, `api/src/routes/api-tokens.ts`, `api/src/routes/admin-credentials.ts`, `api/src/middleware/auth.ts`, `vendor/@fpki/auth-client/` (if present).

## The one-sentence mental model

**Ship has three coexisting auth providers — PIV/CAC mTLS (primary, for federal users), password (fallback, for testing and external users), and API tokens (for CLI and automation) — all of which converge on the same session cookie and the same `req.user`. The complexity sits in the *front* of the auth stack; downstream code mostly doesn't know which provider got the user in.**

CLAUDE.md says "auth uses session cookies." That's true after the user is in.
It is dramatically incomplete about *how they get in*.

## Why this matters for the audit

- **Type Safety** — three providers means three serialization shapes for credentials. Untyped FFI to a vendored SDK is a frequent `any` source.
- **Runtime Error Handling** — the providers fail differently (mTLS handshake failure ≠ wrong password ≠ revoked token). The audit category for error UX has to cover all three failure surfaces, not just one.
- **Security / Compliance** — Ship is government code; the brief mentions Section 508 / WCAG. PIV/CAC compliance is the *real* table-stakes here.
- **Test Coverage** — PIV is almost certainly untested in E2E because it needs a real cert. The password path is the only one E2E can exercise without mocks.

## The architectural shape

```
                              ┌──────────────────────────────────────┐
                              │      Application Load Balancer       │
                              │                                      │
   Federal user, PIV/CAC ───▶ │  mTLS termination, cert → header(s)  │
                              │                                      │
                              └────────────────┬─────────────────────┘
                                               │
                                               ▼
                              ┌──────────────────────────────────────┐
                              │           Express (api/)             │
                              │                                      │
   Password POST   ─────────▶ │   POST /api/auth/login               │
                              │                                      │
   API token in header ─────▶ │   middleware/auth.ts (token check)   │
                              │                                      │
                              │   middleware/auth.ts attaches        │
                              │   req.user from session cookie       │
                              │                                      │
                              └──────────────────────────────────────┘
                                               │
                                               ▼
                              ┌──────────────────────────────────────┐
                              │      route handlers — provider-      │
                              │      agnostic from here on           │
                              └──────────────────────────────────────┘
```

The "convergence point" is the session cookie. Once a provider authenticates
a user, it issues the same cookie shape. Downstream middleware (visibility,
route-specific) doesn't read provider identity — it reads `req.user`.

## Provider 1 — PIV/CAC via mTLS (the primary path)

**The high-level flow**

PIV (Personal Identity Verification) and CAC (Common Access Card) are smart
cards every federal civilian/military employee carries. They hold an X.509
certificate. Browsers can perform **mTLS** (mutual TLS) using that cert: the
TLS handshake itself proves identity, before any HTTP traffic happens.

Ship's ALB terminates mTLS. The cert is validated against trusted federal
PKI roots, and identifying claims (subject, EDIPI, etc.) are forwarded to
Express as HTTP headers.

**The DCR (Dynamic Client Registration) elaboration**

For SSO with external FPKI brokers (not just direct mTLS), Ship uses the
OAuth Dynamic Client Registration extension. The flow, per
`fpki-auth-client-dcr-analysis.md`:

1. **Discovery** — fetch the broker's OIDC discovery doc.
2. **Keypair generation** — Ship generates an RSA keypair locally.
3. **Registration** — Ship registers as an OAuth client, advertising its
   public key for `private_key_jwt` client authentication.
4. **Credential storage** — `client_id` + `private_key_pem` go into AWS
   Secrets Manager.
5. **JWKS serving** — Ship publishes its public key at
   `/.well-known/jwks.json` so the broker can verify Ship's signed JWTs.

This is implemented via a **vendored SDK** at `vendor/@fpki/auth-client/`
(not npm). The vendoring exists so Ship can patch the SDK without waiting
for upstream releases — and **Ship has patched it**: a `discoverEndpoint`
option that's not present upstream. See `fpki-auth-client-dcr-analysis.md`
lines 751–774.

**What to verify in code**

- [ ] How does mTLS data flow from ALB → Express? Look for header names like
  `x-amzn-mtls-clientcert`, `x-client-cert`, or a Terraform listener config.
- [ ] Where is the cert-to-user mapping? It's probably keyed off EDIPI or
  cert subject CN. Find `api/src/routes/caia-auth.ts` and walk it.
- [ ] What happens on a cert that's well-formed but unknown? Auto-provision?
  Reject?
- [ ] Is the JWKS endpoint actually mounted? Search for `well-known/jwks`.
- [ ] Confirm the `discoverEndpoint` patch is still in the vendored SDK; if
  the SDK has been re-vendored from upstream, the patch may have been lost
  silently.

**Audit hooks specific to PIV**

- Cert expiration handling — what does the user see when their PIV cert
  expires mid-session? This is a category-6 (runtime error) finding waiting
  to happen.
- mTLS revocation checking — OCSP / CRL — does the ALB do it, or does the
  app trust the ALB's verdict blindly? Stale revocation lists are a real
  vulnerability.
- The vendored SDK is a long-term tech-debt item; flag it under "tradeoffs
  explicitly accepted" in the architecture-assessment section.

## Provider 2 — Password (the fallback path)

Plain old `POST /api/auth/login` with email + password. The point of this
provider is *not* to be the primary auth method — it exists so:

- Tests can run without a smart card reader.
- External users (contractors, non-federal stakeholders) can get in.
- Local development doesn't require PIV hardware.

**Implementation details to verify**

- [ ] Password hashing algorithm — almost certainly bcrypt or argon2; if you
  find PBKDF2 with a low iteration count, or worse, that's a finding.
- [ ] Account lockout / brute-force protection — does the route rate-limit?
- [ ] Password reset flow — is there one? Does it leak whether an account
  exists?
- [ ] Confirm `admin-credentials.ts` isn't doing something special with
  passwords for admin users (a known source of "hardcoded admin" bugs).

**Audit hooks**

- The password provider is the one E2E tests can actually use. Verify the
  test fixture (`e2e/fixtures/isolated-env.ts`) creates users with known
  passwords. If E2E tests bypass the login form by injecting cookies
  directly, that's a test-coverage gap because the login route itself
  isn't covered.
- Compare the password login response shape with the PIV login response —
  if they diverge, that's a type-safety smell.

## Provider 3 — API tokens (the programmatic path)

For CLIs, automation, the `ship-claude-cli` integration, and anything else
that can't run a browser. Per `application-architecture.md` 380–408:

- **Format:** `ship_<64 hex chars>` — the `ship_` prefix is a visible
  marker so leaked tokens are easy to spot in logs and grep.
- **Storage:** SHA-256 hash at rest. The plaintext is shown **once** at
  creation; if the user loses it, they have to rotate. This is the
  industry-correct shape (GitHub, Stripe, etc. all do this).
- **Expiration:** optional.
- **Transport:** almost certainly `Authorization: Bearer <token>` — verify
  in `api/src/routes/api-tokens.ts`.

**Implementation details to verify**

- [ ] Is the hash compared with a constant-time comparison
  (`crypto.timingSafeEqual`)? `===` is a timing attack.
- [ ] When a token authenticates a request, does the auth middleware set
  `req.user` the same way as the session path, or is there a parallel code
  path?
- [ ] Are token-authed requests subject to the same visibility middleware as
  cookie-authed ones? If not, that's a hole.
- [ ] What does the audit log say about token requests? If the audit logs
  table records `user_id` but not "this was a token, not a session," then
  forensic analysis can't distinguish CLI activity from human activity.

**Audit hooks**

- Search prod logs for `ship_` followed by hex. If real tokens are appearing
  in logs (URL params, error messages, request bodies that get logged),
  that's a category-6 finding *and* a security incident.
- Test the revocation path: revoke a token, then try to use it. Is it
  rejected immediately, or only after a cache TTL?

## The session cookie — where the providers converge

Once *any* provider authenticates the user, Express issues the same session
cookie. Per `gotchas.md` 20–35:

- **15-minute inactivity timeout** — `maxAge` is refreshed on every
  authenticated request. Idle for 15 minutes → next request fails with 401.
- **12-hour absolute timeout** — based on issue time. Even with continuous
  activity, the session expires at 12 hours.
- **Enforced in both REST middleware *and* the WebSocket handler.** This is
  the critical asymmetry — if the WS handler enforces inactivity but doesn't
  check absolute timeout (or vice versa), the contract breaks. Verify both.

**The WebSocket case specifically**

Per CLAUDE.md, real-time collab uses session cookies for upgrade auth.
The upgrade is one HTTP request — the cookie is sent, the auth middleware
runs, the upgrade succeeds. After that, the connection is open. The
inactivity timeout, then, has to be either:

1. **Refreshed on every WS message received** — same shape as REST, just
   triggered by frames instead of requests. The expected design.
2. **Frozen at upgrade time and re-checked at intervals** — possible but
   surprising.
3. **Ignored entirely** — a bug.

This is **the** audit hook for the runtime-error category around real-time
collab. Reproduce: open editor, type continuously for ≥15 minutes, then
stop typing for ≥15 minutes, then resume. Does the next keystroke
disconnect you? Does it disconnect you *silently*?

**Verify in code**

- [ ] `api/src/middleware/auth.ts` — find both timeout enforcements.
- [ ] `api/src/collaboration/index.ts` — find the inactivity/absolute
  timeout calls inside the WS handler. If they're absent, that's a finding.

## Workspace memberships — what `req.user` doesn't tell you

`workspace_memberships` is a separate table from `users` and from the
`person` documents (per `document-model-conventions.md` 49–74 and
`unified-document-model.md` 24–50). It holds:

- `user_id` — FK to users
- `workspace_id` — which workspace
- `role` — `admin` | `member`

The middleware that attaches `req.user` may or may not eagerly join
memberships. Whether it does affects:

- **Number of queries per request** (DB efficiency audit) — if every request
  does a join, that's load; if every request does *two* queries, that's
  load-and-N+1-adjacent.
- **Type safety** — if `req.user.memberships` is `Membership[] | undefined`
  depending on the route, every downstream consumer must guard.

Recommended check: pick the route handler for `GET /api/documents`, find
how it determines the user's workspace, and trace the query count.

## Failure modes — what differs between providers

| Failure | PIV / mTLS | Password | API Token |
|---|---|---|---|
| Wrong credential | ALB returns 401, no app log | Route returns 401, optionally logs attempt | Middleware returns 401, optionally logs |
| Credential expired | Cert expired → browser handshake fails | Password reset flow (if it exists) | Token expiry → 401 |
| Credential revoked | OCSP/CRL — depends on ALB config | Account disabled → 401 | Token deleted from DB → 401 |
| User-facing UX | Browser modal, often confusing | App login screen | CLI error, often unclear |

The runtime-error category in the audit should test each row in this table.
The PIV row in particular has poor UX by default — browser smart-card
prompts are not under Ship's control, and "your card expired" surfaces as a
generic TLS error to the user.

## What was vendored and why — a flag for the assessment

The vendored `@fpki/auth-client` exists because:

1. Federal PKI integration is niche; upstream is slow.
2. Ship needs to ship security patches without waiting.
3. The `discoverEndpoint` option Ship added doesn't exist upstream.

The cost:

1. Upstream security fixes don't auto-apply.
2. Re-vendoring may silently drop the Ship patch.
3. SBOM and license tooling may not recognize vendored deps.

This is a legitimate architectural finding under "tradeoffs explicitly
accepted." Worth a sentence in the architecture-assessment section.

## Audit prompts

For the type-safety category:
- Grep `req.user` and check the inferred type at three usage sites. Is it
  consistent? Where it's loose, why?
- Grep for `any` in `api/src/routes/auth.ts`, `caia-auth.ts`,
  `api-tokens.ts`. Provider boundaries are the highest-value `any` removals.

For the runtime-error category:
- Reproduce a stale-cert PIV session. Capture the user-facing experience.
- Reproduce a 15-min idle WebSocket. Capture the user-facing experience.
- Reproduce a revoked API token mid-request. Verify rejection.

For the DB efficiency category:
- Count queries per request for an authenticated `GET /api/documents`. Is
  the workspace-membership lookup cached, eager-joined, or N+1?

For the test-coverage category:
- Inventory which provider each E2E test uses to authenticate. If 100% of
  tests use the password provider, the other two are uncovered.

## Cross-references

- The session cookie ties this doc to `request-flow-and-auth.md`
  §Authentication.
- The WebSocket inactivity-timeout failure mode is the worst-shared concern
  between this doc and `real-time-collaboration.md` §Failure
  modes.
- Workspace-level ACL (no per-document permissions) is documented in
  `unified-document-model.md` §What "Everything is a document"
  buys and is enforced via the membership table read in this layer.
