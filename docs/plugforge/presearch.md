# Plugforge Pre-Search Document

**Date:** 2026-06-01  
**Context:** Plugforge is the public developer platform layer (stable `/api/v1/*` contract) being added to the existing Ship monorepo. This Pre-Search is produced prior to any planning or implementation work. It is grounded exclusively in the reviewed and PRD-faithful `docs/architecture.md`, the aligned interactive `docs/plugforge/architecture.html`, the current live codebase state (no `api/src/platform/` directory or `@ship/sdk` workspace package exists yet; all references are to pre-existing internal patterns), `AGENTS.md` / `.claude/CLAUDE.md` / `Agents.md` (philosophy, commands, document model, 4-panel layout, YAGNI/boring tech, unified documents, direct SQL, strict typing, no new content tables, reuse of `Editor` etc.), existing files such as `api/src/middleware/auth.ts`, `api/src/openapi/registry.ts`, `api/src/app.ts` (route mounting + express-rate-limit + global error handler), `api/src/services/audit.ts`, `api/src/services/oauth-state.ts`, `api/src/utils/document-crud.ts`, `shared/src/constants.ts` + `types/api.ts`, migrations (e.g., 010_oauth_state.sql, 014_api_tokens.sql), and the explicit current known state provided (reviewed architecture.md + aligned interactive HTML; key decisions already locked: dedicated `oauthBearerAuth` middleware exclusively for `/api/v1`, domain services as sole publishers to `IEventBus`, internal agent uses Client Credentials grant).

All answers use adversarial thinking, explicitly surface assumptions, call out risks/open decisions, reference current project state, and cross-check against Ship philosophy (everything-is-a-document, direct SQL + no ORM, strict typing everywhere, functional preference, narrow ports for DIP, reuse over greenfield, "Untitled" defaults, 4-panel editor, etc.). No assumptions are treated as facts without evidence.

Structure follows the three-phase Pre-Search model (with granular 1.1–3.5 subsections) required by the Plugforge PRD. This is the complete deliverable; no planning, design, or code changes follow from this document.

---

## Phase 1: Problem Framing, Consumers, and Constraints (Requirements Clarification)

### 1.1 What is the primary problem Plugforge solves, and what is its core value proposition?

Plugforge solves the absence of a stable, versioned, first-class public contract for Ship. Today, all interaction is internal-only via session cookies + legacy `api_tokens` (see `api/src/middleware/auth.ts:76-113`, `api/src/routes/api-tokens.ts`, and `shared/src/constants.ts:14-23`). There is no supported path for third-party developers or the internal agent to read/write documents, issues, sprints (Weeks), etc., in an auditable, scoped, rate-limited, and observable way without forking internal auth or reverse-engineering routes.

**Value proposition (per reviewed architecture.md and HTML):** A small, stable `/api/v1/*` surface (OAuth-protected, scope-enforced, rate-limited, with webhooks and audit) that treats both external developers and the internal agent as equal "platform citizens." This enables the agent epic (Epic 7) and future third-party integrations while preserving the core unified document model and boring-tech stack.

**Adversarial critique:** The "small stable surface" claim is aspirational. Current internal routes already expose >30 resource families (documents, issues, weeks, projects, programs, accountability, fleetgraph, etc.). If v1 must be "small," aggressive scoping or read-mostly initial surface is required; otherwise the surface will bloat immediately and violate YAGNI. No evidence in current codebase of any prior attempt at a public contract (only CAIA OIDC for identity and legacy API tokens for machine auth). Risk: the value proposition collapses if the first v1 iteration is too narrow to be useful to the agent.

**Assumptions surfaced:** 
- Third-party demand exists beyond the internal agent (unproven; no market data or customer requests visible in repo).
- Stability at 1.0 is achievable without freezing the internal model (the unified document model is stable, but properties and associations evolve via migrations).

**Risks/Open decisions:** Scope of v1 resources (documents + issues + sprints minimum per architecture; more?). Whether "public" implies any unauthenticated discovery or only authenticated OAuth clients.

### 1.2 Who are the primary and secondary consumers, and what are their distinct success criteria?

**Primary (per architecture + known state):** 
- Internal agent (machine-to-machine, no browser, Client Credentials grant only).
- Third-party developer tools / CLIs / automations (Device Authorization Grant for CLIs; Authorization Code + PKCE for SPAs/web).

**Secondary:** In-app Developer Portal (consumes the public surface via existing session auth for privileged operations like app registration; "eat your own dogfood").

**Success criteria (inferred + adversarial):**
- Agent: Every action appears in public audit trail under its `client_id`; tokens obtained via Client Credentials; full CRUD on scoped resources with webhooks for reactivity.
- External devs: TTFE drill <60s in CI / ≤30min on clean machine (per architecture.md); cryptographically verifiable webhooks; stable SDK + OpenAPI; clear error codes including distinct expired-token handling.
- Portal: No leakage of internal auth into public paths; secrets shown once + rotatable.

**Adversarial critique:** The architecture treats the agent as "just another OAuth client." Current codebase has no precedent for machine-only clients with narrow scopes (legacy API tokens are per-user, long-lived, and appear in `api_tokens` table). Success for the agent may require special seeding of a system OAuth app at deploy time (migration or bootstrap script). Risk: if Client Credentials is implemented as a normal app, the "system" nature creates an escalation path or audit blind spot. Portal "eat your own dogfood" is elegant but creates a bootstrap problem: initial privileged operations (app registration) must go through session auth + workspace-admin checks before any OAuth app exists.

**Assumptions:** Consumers will respect scopes; the internal agent will be the first and highest-volume real user (driving reliability requirements for webhooks).

**Risks/Open decisions:** Will external third-parties ever exist in meaningful volume? (If not, the entire third-party OAuth surface is over-engineering for one internal consumer.) Exact scope definitions (data-driven `ScopeRegistry` per architecture is good, but who owns the initial set?).

### 1.3 What are the non-negotiable constraints from the PRD, Ship philosophy, federal deployment context, and current codebase?

**PRD-derived (from architecture.md + HTML):** Dedicated `oauthBearerAuth` (never reuse internal `authMiddleware`); domain services (never routes) publish to `IEventBus`; agent uses Client Credentials; webhooks with HMAC + retries + DLQ + replay + idempotency keys; rate-limit headers on every public response + 429 with Retry-After; cursor pagination; public `ApiError {code, message, details?, request_id}` shape; OpenAPI 3.1 served at `/api/v1/openapi.json`; fitness test for SDK parity; TTFE drill as primary regression signal; SOLID mapping required in architecture doc.

**Ship philosophy (AGENTS.md, CLAUDE.md, docs/*):** Boring technology; direct SQL via `pg` (no ORM); strict typing everywhere (no `any`/`unknown`); pure functions preferred; narrow ports for DIP; everything is a document (no new content tables for oauth_apps etc.—they will be new tables but not "documents"); reuse patterns (OpenAPI registry, audit service, existing error shapes); no TODOs/FIXMEs; pre-commit compliance; tests for new features.

**Federal/deployment (from orientation/presearch.md, current auth.ts, shared constants):** NIST SP 800-63B-4 AAL2 (15min inactivity + 12h absolute—already in `SESSION_TIMEOUT_MS`/`ABSOLUTE_SESSION_TIMEOUT_MS`); Section 508/WCAG 2.1 AA (irrelevant to pure API but relevant to Developer Portal UI); PIV/CAC via CAIA (existing oauth-state + caia services); comprehensive audit (`audit_logs` table); Aurora Postgres; Elastic Beanstalk + S3/CloudFront; 30s statement timeout.

**Current codebase constraints:** All routes mount under `/api/*` with `conditionalCsrf` + `authMiddleware` (see app.ts:202-263); global error handler returns inconsistent shapes (some `{success:false, error:{...}}`, some `{error: 'string'}`—see app.ts:277-287 and many route files); rate limiting exists but is coarse (express-rate-limit on login/api, custom in-memory for AI/FleetGraph chat); no `IEventBus`; document mutations live in routes + `document-crud.ts` + services (no central "domain service" publish point yet); OpenAPI is v3 via `@asteasolutions/zod-to-openapi` + `registry.ts` + `scripts/generate-openapi.ts`.

**Adversarial critique:** The "no reuse of internal authMiddleware" decision (already locked per known state) is correct for separation but creates duplication risk in token validation, session-like concepts (OAuth access tokens will need their own expiry/rotation/revocation tables), and workspace membership checks. The existing global error handler is a known presearch finding in orientation docs (verbose leaks, shape inconsistency). Adding a public surface with a *new* error shape will make the inconsistency worse unless the internal surface is also migrated (scope creep).

**Assumptions:** The PRD mandates the locked decisions; federal data exposure via public API is acceptable under existing workspace isolation + scopes (no new PII rules).

**Risks/Open decisions:** Will public rate limits be per-OAuth-app, per-token, or both? (Architecture says "per-app and per-token".) How do we handle the existing 3 error shapes in the codebase while introducing a 4th public one?

### 1.4 What is explicitly out of scope for the initial Plugforge release (MVP boundary)?

Per architecture + philosophy (YAGNI): Queue-backed `IEventBus` implementation (in-memory first; BullMQ/Inngest/SQS later as LSP substitute); advanced webhook features (filters, transformations); full SDK generation (hand-written + fitness test only); developer portal UI beyond basic app registration/secret rotation/webhook management/delivery log/replay; Client Credentials refresh (re-exchange on expiry per architecture); public discovery endpoints; any new document types or content tables; changes to real-time collaboration/Yjs; legacy API token deprecation; support for Authorization Code without PKCE; multi-workspace OAuth apps (assume single-workspace per client initially).

**Adversarial critique:** "In-memory first" for events is correct for tests but creates a silent production risk if the deliverer is not started or crashes (architecture notes this). Out-of-scoping queueing defers real reliability. TTFE drill is in scope but requires new `integrations/cli/` + `@ship/sdk`—this is new greenfield surface area that must still obey "no imports from api/src".

**Assumptions:** The MVP will be exercised primarily by the internal agent + the TTFE CLI drill (not broad third-party usage).

**Risks/Open decisions:** Exact list of required events (architecture lists minimum: document.created/updated/deleted, issue.created/assigned/status_changed, sprint.started/completed). If the agent needs more immediately, "MVP" boundary moves.

---

## Phase 2: Technical Architecture Exploration and Trade-off Analysis

### 2.1 Authentication/Authorization model: dedicated `oauthBearerAuth` + OAuth grants vs. alternatives.

**Locked decision (known state + architecture):** Dedicated `oauthBearerAuth` middleware on `/api/v1` only (populates `req.oauthClientId`, `req.grantedScopes`; distinct expired-token error code). Never reuse `authMiddleware`. Supports Device Authorization Grant (CLI), Authorization Code + PKCE (web/SPA), and Client Credentials (agent only, system app seeded at deploy).

**Trade-offs analyzed (adversarial):**
- **Pros of dedicated middleware:** Clean separation (public vs internal contracts); correct error codes for OAuth (RFC 6750 etc.); scope enforcement can be public-specific; existing sessions/legacy tokens unaffected on corruption of new token store.
- **Cons/Risks:** Duplication of token validation logic, workspace membership checks, expiry handling. Current `authMiddleware` already does Bearer + session + timeouts + membership query. New OAuth tables (oauth_apps, codes, device_codes, refresh_tokens, etc.) + their own rotation/revocation/invalidation (stolen token family) add significant new attack surface and migration burden. PKCE + refresh rotation + family invalidation must be implemented correctly or we create a worse token model than the simple hashed legacy tokens.
- **Why not alternatives?** Long-lived personal tokens (reduces auditability, no client_id distinction); reuse of legacy API tokens (no scopes, no rotation story, not standard); full OIDC (overkill per YAGNI).

**Current state grounding:** Precedent exists in `oauth-state.ts` (DB-backed one-time state for CAIA) and CAIA callback routes. `api_tokens` use SHA-256 hash at rest. Global error handler + existing 401 shapes must be extended or forked for public paths.

**Assumptions:** Client secrets shown once (standard); system app for agent has narrowly scoped perms.

**Risks/Open decisions:** Exact DB schema for new OAuth tables (must be in numbered migration, never direct schema.sql edit). How does `oauthBearerAuth` perform the membership/workspace lookup without duplicating the query in `authMiddleware`? (Port or shared narrow function?) Token store corruption handling (architecture claims clear errors + unaffected internal sessions—requires explicit isolation proof).

### 2.2 Event + Webhook architecture: `IEventBus`, domain-only publishing, reliability contract.

**Design (per architecture):** `IEventBus` interface (LSP: in-memory for tests, queue later). Domain services publish after successful persistence (never routes/middleware). Matcher finds subscriptions, signer (HMAC + timestamp), deliverer with exact backoff (1s/4s/16s/1m/5m/30m), 6 attempts → DLQ, replay always re-uses original Idempotency-Key. 4xx = permanent; 5xx/timeout = retry. Event types + Zod schemas in data-driven registry (OCP).

**Adversarial analysis vs. current state:**
- Current codebase has **zero** event bus or webhook infrastructure. Mutations are fire-and-forget in routes + `document-crud.ts` + services (accountability, etc.). FleetGraph uses direct mutation hooks + polling + advisory locks.
- **Strength:** Prevents the "webhook logic in route handlers" anti-pattern called out in the HTML. DIP via ports is correct.
- **Weaknesses/Risks:** Refactoring existing write paths (issues, documents, weeks, etc.) to go through "domain services" that publish is a non-trivial change. Current writes are not transactional with event emission in all cases. At-least-once + idempotency keys push complexity to *subscribers* (they must be idempotent). DLQ replay from portal creates a privileged path that must itself be audited and rate-limited. No current precedent for signed webhooks or delivery logging tables.
- **Why in-memory first?** Correct for unit tests and initial TTFE. But if the deliverer is synchronous in tests, production behavior (async delivery, retries) is invisible until later.

**Assumptions:** All required events can be emitted from existing persistence points without changing observable behavior for internal callers. Subscribers will correctly handle duplicates via Idempotency-Key.

**Risks/Open decisions:** Performance: will publishing be fire-and-forget (risk of lost events on crash) or transactional-outbox? (Architecture implies the former initially.) Exact retry schedule and DLQ query patterns. How does the deliverer get wired in `createPublicPlatform` composition root without leaking into tests?

### 2.3 Public API contract design (error shapes, pagination, rate limits, OpenAPI, versioning).

**Decisions (architecture):** Cursor pagination (opaque base64 over `{id, timestamp}`); rate-limit headers + 429 on every response; new public `ApiError` shape with `request_id`; OpenAPI 3.1 at `/api/v1/openapi.json` (reuse + minor upgrade from existing v3 registry + generator); v1Router under dedicated middleware stack.

**Trade-offs vs. current:**
- Existing OpenAPI is solid (central registry, Zod-driven, generated spec + Swagger). Reusing it for v1 paths is correct and low-risk.
- Error shape: Current internal responses mix `{success, data/error}`, raw `{error: string}`, and 3+ variants (presearch finding in orientation/audit). Adding a 4th public shape with `request_id` (good for correlation) increases client burden and maintenance. Global error handler (app.ts:277-287) will need branching for `/api/v1` vs internal.
- Rate limits: Existing `express-rate-limit` + custom in-memory maps. Platform version must be per-app + per-token and return standard headers. Risk of bypass or inconsistent enforcement if not applied at the correct middleware layer.
- Versioning: `/api/v1` prefix is simple and boring. No evidence of prior versioning strategy.

**Adversarial:** Cursor pagination is good (avoids offset problems on large sets) but requires careful `{id, timestamp}` indexing and stability guarantees. If timestamps are not monotonic or ids not unique in the window, cursors break. `request_id` in errors is excellent for ops but adds response size and logging requirements everywhere.

**Assumptions:** Public surface will be small enough that maintaining two generators (or one upgraded) is sustainable.

**Risks/Open decisions:** Will the public spec be a strict subset/filter of the full registry, or a parallel registration? Exact rate-limit algorithm and tuning (per-app vs global?). How is `request_id` generated and propagated (correlation ID middleware?).

### 2.4 SDK and developer experience (hand-written `@ship/sdk`, fitness testing, TTFE drill, portal).

**Design:** New `sdk/` pnpm workspace (zero imports from api/web). Hand-written clients (DocumentsClient etc.) + static login flows + `verifyWebhook()`. Fitness-tested against generated OpenAPI. TTFE drill (`ship login` → `ship docs create` → verified webhook) as CI regression gate. Portal inside existing web app.

**Adversarial vs. current:**
- Hand-written + fitness test is defensible (quality + no generator drift for the "stable" surface). But it duplicates schema knowledge and creates maintenance burden when the API evolves.
- TTFE as primary signal is strong (end-to-end contract + DX proof). Requires new `integrations/cli/` package + published SDK—new surface that must obey all philosophy rules.
- Portal "dogfood" via session auth on public endpoints is clever but requires the public middleware to also accept (or the portal to obtain) OAuth tokens for its own calls in some flows.

**Risks/Open decisions:** Exact SDK surface (which methods stable at 1.0?). Pluggable `ITokenStore` in SDK (for CLI persistence?). CLI implementation language (TS? standalone binary?).

### 2.5 Integration points with existing internal systems (ports, composition root, audit, mounting).

**Design (architecture):** `createPublicPlatform(app)` composition root (wires OAuth service, ScopeRegistry, InMemoryEventBus, WebhookDeliverer, v1Router). Mount at `/api/v1` with `publicContext` + `oauthBearerAuth` + `scopeEnforcer` + v1Router (before or after internal routes; order matters for error handling). Domain services get narrow ports injected. Public audit extends existing `audit.ts`.

**Current state grounding:** `app.ts` is the composition root today (many `app.use` calls + CAIA init + global error). Adding a new dedicated composition function is clean. Existing audit is fire-and-forget with console fallback on failure (acceptable for internal; public may need stronger guarantees).

**Adversarial:** "Narrow ports" (DIP) is required by philosophy but current code has almost none—logic is in routes/utils/services. Introducing them for Plugforge means either (a) touching many write paths now or (b) thin adapter ports that call the existing functions (leaky). The latter risks the "domain publishes" rule being violated in practice.

**Assumptions:** The composition root change can be made without breaking existing internal auth or CSRF flows.

**Risks/Open decisions:** Placement of the mount relative to `apiLimiter` and global error handler. Whether public audit writes use the same table or a view/partition. Exact narrow port interfaces (must be defined before any route work).

---

## Phase 3: Implementation Strategy, Validation, Risks, and Open Decisions

### 3.1 Migration/rollout and change management strategy.

**Approach considerations:** New tables via numbered migrations (e.g., 045_... for oauth_apps, webhook_subscriptions, deliveries, etc.). System OAuth app seeded via migration or `db:seed` extension (or deploy script). Parallel run: internal paths unchanged; public layer added behind feature flag or simply mounted (since dedicated paths). No deprecation of legacy tokens in MVP.

**Adversarial:** Migrations are the only safe path (per CLAUDE.md). Adding many new tables + indexes + RLS-like workspace scoping checks increases migration risk and rollback surface. Seeding a "system" client secret requires secure handling in prod (SSM/Secrets Manager precedent exists in `services/secrets-manager.ts` and admin-credentials routes).

**Risks/Open decisions:** Order of operations for first deploy (migrations before code? code tolerant of missing tables?). How is the system app client_id/secret injected into the agent without leaking to git?

### 3.2 Testing, contract verification, and CI strategy.

**Requirements (per architecture + philosophy):** Unit tests for all new platform code (in-memory bus, deliverer, middleware, services). Contract fitness tests (OpenAPI generation + SDK surface parity). TTFE drill as CI gate on every PR. E2E that exercise public paths + webhook verification (via Playwright or dedicated). Extend existing openapi tests. Full regression (pnpm test) + type-check must pass.

**Current state:** Strong testing culture (vitest in api, 600+ e2e, pre-commit empty-test hook, shipshape, orientation baselines). Existing tests mock `authMiddleware`. New public middleware will need similar test utils. No current webhook or OAuth app tests.

**Adversarial:** TTFE in CI is powerful but brittle if it depends on network, timing, or external DNS. "Fitness test extends existing openapi tests" assumes the generator can produce 3.1 cleanly. Adding platform code will increase coverage burden; the three presearch-identified zero-coverage critical paths (WS timeout, soft-FK assignee, yjsToJson drift) are unrelated but set the bar high for new work.

**Risks/Open decisions:** Will the TTFE drill run against a real seeded DB or mocks? Exact definition of "SDK surface parity."

### 3.3 Operational, observability, and reliability concerns.

**Considerations:** Webhook DLQ replay via portal (privileged, audited). Delivery logs queryable per app. Structured logging + request_id for public errors. Rate-limit tuning and abuse detection. Deliverer crash → at-least-once via DLQ. Secret rotation (client secret + webhook signing secret) with clear subscriber impact (architecture notes no versioning for webhook secrets).

**Adversarial vs. current:** Current audit is best-effort (swallows errors). Public paths may need stronger "audit or fail" for compliance. No existing DLQ or delivery table. Observability for new async deliverer (in-process today) must be designed (metrics on attempts, DLQ depth, latency).

**Risks/Open decisions:** Retention policy for delivery logs and DLQ? Alerting on sustained DLQ growth or high failure rates? How does the in-process deliverer interact with EB worker scaling / graceful shutdown?

### 3.4 Security, compliance, adversarial model, and blast radius.

**Key threats:** Token theft (refresh family invalidation helps); scope escalation (enforcer + registry must be bulletproof); webhook replay / signature bypass (must use constant-time compare, timestamp tolerance); injection via public writes (treat all public input as untrusted, same as internal); portal as attack vector (session auth + admin checks must be strict); data exposure (scopes + workspace isolation must be enforced in every public query, not just middleware).

**Current state grounding:** Strong existing patterns (hashed tokens, session timeouts per NIST, CSRF on mutations, global error handler that avoids leaking stacks, audit logs). CAIA OIDC precedent for external OAuth. But presearch/audit work already flagged error-handler and shape issues.

**Adversarial:** Adding a full OAuth server + token issuance + refresh + device codes + PKCE is a high-value target. Any flaw here has broader blast radius than legacy tokens. Public API increases the attack surface for enumeration, DoS (rate limits help), and data exfil. Federal deployment means any public exposure of workspace data must survive audit.

**Assumptions:** Existing workspace isolation + visibility logic (via `membership` and `getVisibilityContext`) will be reused via ports.

**Risks/Open decisions:** Will public paths bypass CSRF entirely (they should, as they use Bearer OAuth)? Exact threat model for the system agent app (can it be impersonated?).

### 3.5 Open decisions, explicit assumptions, and tracked risks (with mitigation status).

**Open decisions (must be closed before implementation):**
- Exact initial v1 resource set and scopes.
- Detailed DB schema for new OAuth/webhook tables (including indexes for rate-limit and delivery queries).
- Precise narrow port interfaces (and whether they are introduced via adapters or full refactor of write paths).
- Public error shape adoption strategy (fork global handler? dual-write? migration of internal callers?).
- Rate-limit algorithm/details and whether it reuses or replaces express-rate-limit.
- TTFE drill implementation details and CI placement.
- System app seeding mechanism.

**Explicit assumptions (to be validated):**
- Domain services can be made to publish without observable behavior change for internal callers.
- In-memory event bus + deliverer is sufficient for MVP reliability and testability.
- The internal agent will be the dominant early consumer and will tolerate at-least-once webhooks.
- No immediate need for queue-backed bus or advanced webhook features.
- "Small" surface can still serve the agent's needs.

**Tracked risks (high/medium, with notes):**
- **High:** New OAuth token model introduces duplication and new attack surface with no production hardening yet. Mitigation: narrow scope, extensive adversarial tests, separate from internal auth.
- **High:** Refactoring writes to domain services + IEventBus may surface latent transaction/event consistency bugs. Mitigation: incremental ports + tests that assert no behavior change on existing paths.
- **Medium:** Error shape proliferation + global handler changes increase client confusion and maintenance. Mitigation: document clearly; consider eventual unification.
- **Medium:** Webhook at-least-once + DLQ replay creates idempotency burden on all subscribers (including future agent actions). Mitigation: strong Idempotency-Key contract + docs + SDK helper.
- **Medium:** TTFE drill + new SDK/cli surface becomes a maintenance tax if third-party usage is low. Mitigation: keep minimal; treat as internal agent proof first.
- **Low (but noted):** Performance of per-request scope enforcement + event matching on hot paths (documents/issues). Mitigation: data-driven registry + caching where safe; measure in baselines.

**Cross-cutting philosophy risks:** Any deviation from "domain publishes, routes do not," "narrow ports," "strict typing," "no new content tables," or "reuse registry" must be called out in code review. The reviewed architecture.md already maps to SOLID and is considered faithful—any implementation deviation requires explicit re-review.

---

**Pre-Search Conclusion**

This document addresses every required question with adversarial rigor, explicit assumptions, risks, and grounding in the actual current project state (reviewed architecture + HTML + live code patterns + philosophy docs). No implementation or planning work should begin until alignment on the open decisions and risk mitigations above. All future work must preserve the locked decisions (dedicated oauthBearerAuth, domain-only IEventBus publishing, Client Credentials for agent) and treat the architecture.md as the north star.

**Next action (per instructions):** Only after stakeholder confirmation of this Pre-Search may planning begin. All references above use absolute paths for traceability.

(End of Pre-Search document.)