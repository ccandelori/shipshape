# Plugforge Public Platform Layer – Complete ce-Plan (Implementation Plan)

**Origin:** Completed Plugforge Pre-Search at `docs/plugforge/presearch.md` (2026-06-01), treated as ce-brainstorm equivalent. Cross-referenced with reviewed `docs/architecture.md` (Plugforge platform architecture + SOLID + composition root + contracts), `docs/application-architecture.md`, `docs/unified-document-model.md`, `docs/document-model-conventions.md`, `docs/claude-reference/*` (patterns, anti-patterns, testing, architecture, security), `AGENTS.md` / `.claude/CLAUDE.md` / `Agents.md`, and exhaustive live codebase exploration (fs structure, `api/src/app.ts`, `api/src/middleware/auth.ts`, `api/src/openapi/*`, `api/src/services/audit.ts` + `oauth-state.ts`, `api/src/utils/document-crud.ts`, routes (documents/issues/etc.), `api/src/db/*` (schema + 044 migrations), `shared/src/*`, `api/src/index.ts`, `api/src/test/setup.ts`, vitest.config, pnpm-workspace.yaml, package.jsons, swagger generation, MCP, fleetgraph, web settings, error-handler tests, etc.). No `api/src/platform/`, no `@ship/sdk`, no webhook/IEventBus, no public `/api/v1` surface exist today.

**Problem Frame (from Pre-Search 1.1 + architecture.md):** Ship has no stable, versioned, first-class public contract. All access is internal-only (session cookies + legacy `api_tokens`). No supported path exists for third-party devs, CLIs, or the internal agent (Epic 7) to perform auditable, scoped, rate-limited, observable read/write on the unified document model without reverse-engineering or forking auth. Plugforge delivers a small, stable `/api/v1/*` surface (OAuth-protected, scope-enforced, rate-limited, webhook-capable, audited) treating the internal agent and external developers as equal platform citizens, while preserving the core unified document model and boring-tech stack.

**Scope (MVP boundary, faithful to Pre-Search 1.4 + architecture.md + constraints):** Full public platform layer including dedicated `oauthBearerAuth` (never reuse `authMiddleware`), OAuth issuance for Device Auth Grant (CLI), Auth Code + PKCE (web/SPA), Client Credentials (agent only + seeded system app), `IEventBus` (LSP: in-memory first), domain-services-only publishing (never routes), webhooks (HMAC+timestamp signing, exact backoff 1s/4s/16s/1m/5m/30m, 6 attempts → DLQ, replay with original Idempotency-Key, 4xx permanent), public CRUD surface (minimum: documents + issues + sprints/weeks; cursor pagination; per-app + per-token rate limits with standard headers + 429 Retry-After), new public `ApiError {code, message, details?, request_id}` + `request_id` propagation, OpenAPI 3.1 at `/api/v1/openapi.json` (reuse + minor upgrade of registry/generator), ScopeRegistry (data-driven, OCP), narrow ports (DIP) + initial domain service wrappers for publishing, composition root `createPublicPlatform`, extension of audit (public client_id trail), new DB tables via numbered migrations only (never edit schema.sql), hand-written `@ship/sdk` (zero imports from api/web) + fitness parity test, minimal Developer Portal (in-app, session-protected app registration/secret rotation/webhook mgmt/delivery log/replay), `integrations/cli/` + `ship` binary for TTFE drill (<60s CI / ≤30min clean machine) as primary CI regression gate + contract proof, Agent rewire prep (Client Credentials usage + public paths), all tests (unit/integration/contract/E2E scenarios), type-check, pnpm test, compliance, no new content/document tables (new tables are infrastructure only), strict typing (no loose any/unknown), pure functions preferred, direct SQL + pg, no TODO/FIXME, structured concerns.

**Explicitly Out of Scope (per Pre-Search 1.4 + YAGNI + philosophy):** Queue-backed IEventBus (in-memory first; LSP later), advanced webhooks (filters/transforms), generated SDK (hand-written + fitness only), full portal UI polish or advanced features, Client Credentials refresh tokens (re-exchange), public discovery, new document types/content tables, changes to real-time collaboration/Yjs, legacy API token deprecation, support for Authorization Code without PKCE, multi-workspace OAuth apps (single-workspace per client initially), broad third-party volume assumptions.

**Requirements Traceability (key examples; full mapping in each IU):** Pre-Search 1.1–1.3 (value prop, consumers: agent primary + third-party + portal dogfood, constraints: dedicated middleware, domain-only publish, Client Creds, webhooks contract, rate headers, cursor, public ApiError+request_id, OpenAPI 3.1, fitness+TTFE, SOLID); 1.4 (MVP boundaries); 2.1 (auth model + dedicated middleware tradeoffs); 2.2 (IEventBus + domain publish + reliability); 2.3 (contracts/pagination/rate/OpenAPI); 2.4 (SDK/TTFE/portal); 2.5 (composition/ports/audit/mounting); 3.1–3.5 (migrations/seed, testing/CI/TTFE, ops/reliability, security/compliance, open risks). Cross-checked against architecture.md (composition root, webhook pipeline, SDK surface, failure modes, SOLID), application-architecture.md (boring tech, direct SQL, pg, no ORM), unified-document-model.md (everything document; no new content tables), document-model-conventions.md (Untitled defaults, associations via junction only, 4-panel), claude-reference patterns/anti-patterns (Zod validation, extract*FromRow, raw SQL + txns, no any, no inconsistent errors, migrations only, structured, no console leaks, no empty tests), existing code (auth.ts patterns for hashing/expiry/membership, registry + zod-to-openapi, audit fire-and-forget, app.ts mounting + global error + rate-limit + conditionalCsrf, test/setup.ts TRUNCATE, etc.).

**Philosophy / Boring-Tech / DIP Adherence (non-negotiable):** Everything checked against AGENTS.md/CLAUDE.md. No new content tables. Reuse (OpenAPI registry, audit service patterns, error constants, document-crud where possible via ports, existing middleware style). Direct SQL + pg only. Strict typing everywhere (explicit returns, no default params, proper types for all data). Pure functions (modify only returns; narrow ports as interfaces for DIP; functional preference over classes except for connectors like deliverer/bus impls or external interfaces). Narrow ports for all cross-boundary. YAGNI (in-memory first, minimal v1 surface, basic portal). No TODO/FIXME/placeholder. Pre-commit (comply, empty-tests, etc.). Tests for all new features (happy + edge + error + integration). Migrations numbered only. "Untitled" for any new docs (not relevant here). 4-panel untouched. Federal (NIST session timeouts already in shared; audit; etc.). All changes minimal + related.

**Key Decisions + Rationale (with tradeoffs considered from Pre-Search analysis + codebase):** 
- Dedicated sub-app mount for `/api/v1` (with its own error handler + stack) before global handler in `app.ts`: isolates public `ApiError` + request_id perfectly; prevents shape proliferation leakage. Alt (branch in global) rejected for maintainability.
- In-memory IEventBus + deliverer (sync for tests, async loop in prod) first: enables unit tests + TTFE without infra; satisfies LSP/OCP. Queue deferred (YAGNI + Pre-Search risk note on silent failures mitigated by DLQ + replay + observability). Transactional outbox out (adds complexity; at-least-once via DLQ acceptable for MVP + agent tolerance per Pre-Search).
- Thin adapter ports + new thin domain service wrappers (for publish) initially: satisfies "domain services publish, routes never" for public paths + new writes with minimal blast radius on existing internal callers. Full refactor of all write paths (documents/issues/weeks/etc.) deferred (avoids surfacing latent txn bugs in one go per Pre-Search high risk; incremental via ports).
- App/webhook mgmt + secret rotation + DLQ replay under internal `/api/*` (session + workspaceAdmin) only; public `/api/v1` strictly for issuance + resource ops + signed webhooks: resolves bootstrap problem + "no leakage of internal auth into public paths" (Pre-Search 2.1/3.4 risk). Portal "dogfoods" the *public contract concept* (SDK usage, webhook verification) and uses internal privileged paths for registration (standard industry pattern; avoids auth mixing). Alt (session fallback inside oauthBearerAuth) rejected as violation of dedicated middleware lock + separation.
- Hand-written SDK + file-based fitness (against generated public OpenAPI snapshot): quality + no generator drift for "stable" surface. Duplication accepted (YAGNI on full codegen; Pre-Search 2.4).
- System app seeding via extended `db/seed.ts` (or dedicated bootstrap script) + SSM/Secrets Manager for prod secret (never git): follows existing `services/secrets-manager.ts` + admin-credentials precedent. Migration data-only for non-secret parts.
- Cursor over `{id, created_at/updated_at}` (base64 opaque) + stable indexes: avoids offset pitfalls. Rate limits: extend express-rate-limit patterns with custom key (per-app + per-token) + in-mem (boring; prod tuning later).
- Public error shape adoption: isolated v1 sub-app handler (new shape only on public paths). Internal shapes left inconsistent for now (avoids massive unrelated migration; Pre-Search medium risk noted + eventual unification).
- TTFE as CI gate (via skill runner equivalent + test subscriber for webhook receipt + sig verify): primary regression signal per architecture. Uses seeded test app + isolated fixtures.

**Open Decisions Carried Forward from Pre-Search 3.5 (with plan proposals/closures):** Exact initial v1 resource set + scopes (plan proposes documents.read/write, issues.read/write, sprints.read/write + minimal others; ScopeRegistry makes extensible); detailed indexes + rate-limit query patterns (plan specifies in migration IU + ratelimit IU); precise narrow port interfaces (plan defines minimal DocumentPort/IssuePort/SprintPort in first ports IU; adapters vs full refactor decision documented); public error shape strategy (closed in plan: isolated sub-app); rate-limit algorithm/tuning (plan: per-app+token in-mem key with headers; measure in baselines); TTFE exact CI placement + webhook receipt mechanism (plan specifies test subscriber + timing assertions); system app seeding exact mechanism (plan: seed.ts + env/SSM guard). All closed with rationale or explicit stakeholder callout.

**Risks (high/medium carried + new) + Mitigations:** High: New OAuth attack surface + duplication (mit: narrow scope, adversarial tests, isolation proof, dedicated middleware); write refactor surfacing txn/event bugs (mit: thin adapters + no-behavior-change assertions on existing paths + incremental); Medium: Error shape proliferation (mit: isolation); webhook at-least-once idempotency burden (mit: strong Idempotency-Key contract + SDK helper + docs); TTFE maintenance tax if low third-party use (mit: treat as agent proof first + minimal surface); Performance on hot paths (mit: data-driven registry + caching safe spots + baseline measurement); New: TRUNCATE in test/setup.ts omission (mit: explicit update IU + test); deliverer crash in prod EB (mit: DLQ + in-process restart + graceful shutdown hooks); secret rotation mid-flight for webhooks (mit: per-delivery secret snapshot + docs). All philosophy deviations called out in reviews.

**Dependencies & Sequencing:** Migrations + shared constants before any platform code. IEventBus + ports before any publishing or public routes. OAuth core + middleware before public routes + SDK auth flows. Domain wrappers + publish before webhook end-to-end + TTFE. SDK before CLI + drill + portal verification. Portal + CLI before full agent rewire + hardening. Full pnpm test + type-check + shipshape after each IU. TTFE drill as final gate per PR. Parallelizable: some unit tests for pure fns (bus, scopes, verifyWebhook) + docs updates.

**Major Phases (dependency-ordered):** 
- **Foundation & Cross-Cutting (U-FND-01 to U-FND-04):** DB, shared, composition/mounting skeleton, error isolation, request_id, basic rate/audit hooks. (Enables everything.)
- **Core Public Surface (U-CPS-01 to U-CPS-03):** OAuth (grants + tables + service + middleware), narrow ports + domain service wrappers + publish points, public routes + contracts + OpenAPI v1.
- **Webhooks & Reliability (U-WEB-01):** IEventBus full + matcher/signer/deliverer/DLQ/replay + integration.
- **SDK + DX + Validation (U-SDK-01 to U-SDK-02):** Hand-written SDK + fitness; integrations/cli + TTFE drill (CI gate).
- **Portal, Agent, Hardening (U-PRT-01 to U-HRD-02):** Minimal portal UI (dogfood), agent rewire + system seed, full hardening/CI/docs/ops (DLQ retention, structured logs, baselines).

(11 IUs total; sized for incremental delivery with tests at each step. Each IU includes explicit test scenarios covering happy/edge/error/integration as required.)

### Phase 1: Foundation & Cross-Cutting Infrastructure
**U-FND-01: Database Schema + Migrations for OAuth + Webhooks Tables**  
**Goal:** Add required infrastructure tables (oauth_apps, oauth_*_codes, issued_tokens or equivalent, webhook_subscriptions, webhook_deliveries) via numbered migrations only; support hashing, workspace scoping, indexes for lookups/rate/delivery queries, FK integrity, comments. No edits to schema.sql.  
**Requirements:** Pre-Search 1.3/2.1/3.1/3.4 (migrations, new tables not content tables, security for secrets/tokens, audit); architecture.md (tables for OAuth/webhooks); codebase patterns (014_api_tokens.sql, 010_oauth_state.sql, direct SQL, indexes, CASCADE).  
**Files:** `api/src/db/migrations/045_oauth_platform_core.sql`, `api/src/db/migrations/046_webhook_subscriptions_and_deliveries.sql` (split for safety), `api/src/db/migrations/047_add_public_platform_indexes.sql` (if needed post-046).  
**Approach:** Design tables following api_tokens precedent (UUID PK, hashes for secrets/tokens where possible, timestamptz, revoked/expired, prefixes for UX). oauth_apps: client_id (unique opaque), secret_hash (for issuance validation), redirect_uris jsonb, allowed_grant_types, default_scopes, is_system (for agent), workspace_id. Codes: hashed values + challenges + expiry + one-time. Tokens: family_id for refresh rotation/invalidation, type (access/refresh), scopes jsonb, hashed value. Webhook subs: app_id FK, event_type, target_url, secret (plaintext for signing; rely on Aurora at-rest + DB ACLs; shown-once in portal), active flag. Deliveries: sub_id, event_payload_hash or ref, attempt, status (success/failed_dlq), response_*, latency, idempotency_key, signed_timestamp. All workspace-scoped via app. Use transactions in migration. Update any seed/bootstrap later.  
**Decisions/Rationale:** Split migrations for rollback granularity. Hashed where verification-only (secrets for issuance); signing secret plaintext (standard + boring for webhooks; encrypted column if needed later). Indexes on (client_id, expires), (app_id, event_type), (sub_id, status, next_retry). Rationale: matches existing patterns + query needs from ratelimit/webhook deliverer; avoids full-text or over-indexing (YAGNI).  
**Dependencies:** None (first).  
**Test scenarios (explicit):** 
- Happy: `pnpm db:migrate` on fresh DB creates all tables with correct columns/FKs/indexes/comments (inspect via \d + pg_catalog).
- Edge: Duplicate client_id insert fails (unique); expired code lookup returns null; revoked token hash lookup null.
- Error: Migration rollback on partial failure (test txn behavior); FK violation on delete app cascades deliveries/subs correctly.
- Integration: After migrate, `db:seed` (extended later) + query for system app row succeeds; test queries from future oauth service succeed with correct types.
- Cross: Existing tests unaffected (no data loss on prior tables).  
**Verification:** Run `pnpm db:migrate` (clean + existing DB); `SELECT * FROM information_schema...` assertions in a one-off test script; full `pnpm test` (DB still works); shipshape compliance.

**U-FND-02: Shared Constants, Types, Error Codes, and Request ID Utilities**  
**Goal:** Extend shared for public contracts (new ERROR_CODES like PUBLIC_TOKEN_EXPIRED, RATE_LIMITED; ApiError with request_id; cursor types; public event types); add pure requestId generator + middleware helper. Strict types only.  
**Requirements:** Pre-Search 2.3/1.3 (public ApiError + request_id, error codes distinct for expired); shared existing (constants.ts, types/api.ts); architecture.md (contracts).  
**Files:** `shared/src/constants.ts`, `shared/src/types/api.ts` (and index), `shared/src/types/public.ts` (new for SDK-stable), `api/src/utils/requestId.ts` (pure).  
**Approach:** Add to ERROR_CODES (no breaking). Define `export interface PublicApiError { code: string; message: string; details?: Record<string, unknown>; request_id: string; }`. Cursor: `export type Cursor = string; interface CursorPayload { id: string; ts: string; }` + encode/decode pure fns (base64url + JSON). Event types as const enum + Zod (moved to platform later). Pure `generateRequestId(): string` (crypto.randomUUID). No defaults.  
**Decisions:** New public types in shared (reusable by SDK without circular). Rationale: DRY + strict; avoids any.  
**Dependencies:** None.  
**Test scenarios:** Happy: encode/decode roundtrip stable + opaque. Edge: invalid cursor decode throws specific typed error. Error: no loose any in types. Integration: api + sdk (later) import same types.  
**Verification:** `pnpm type-check` (all packages); unit tests in shared (new `*.test.ts`); pnpm test.

**U-FND-03: Public Platform Composition Root Skeleton + Mounting + Isolated Error Handling + Request ID**  
**Goal:** Add `createPublicPlatform(app)` in new platform dir; mount `/api/v1` as isolated sub-app (publicContext, rate, oauthBearerAuth stub, scope stub, v1Router stub + dedicated error handler for PublicApiError shape); wire from app.ts/index.ts; request_id on all public responses/errors/logs.  
**Requirements:** Pre-Search 2.5/2.3 (composition, mounting order, error shape, request_id); architecture.md:42 (exact createPublicPlatform sketch); app.ts patterns (mounting, global error, apiLimiter); no reuse of internal auth.  
**Files:** `api/src/platform/index.ts` (createPublicPlatform + publicContext), `api/src/platform/middleware/publicContext.ts`, `api/src/platform/middleware/errorHandler.ts` (v1-specific), `api/src/app.ts` (import + call + mount before global), `api/src/index.ts` (minor if needed for shutdown).  
**Approach:** v1SubApp = express(); attach json, then middlewares + router + v1 error handler (if path v1, return {code, message, details?, request_id}; else fallback). app.use('/api/v1', v1SubApp); deliverer.start() etc. later. Pure context setter. requestId middleware early (sets req.requestId + res.setHeader). Global error untouched for internal.  
**Decisions:** Sub-app isolation for error shape + stack (rationale: perfect separation, easy testing with createApp variant). Mount before internal routes? Order: after health/swagger but before or parallel; error isolation wins. No conditionalCsrf on public (Bearer).  
**Dependencies:** U-FND-01 (tables later), U-FND-02.  
**Test scenarios:** Happy: /api/v1/health-like returns public shape with request_id. Edge: malformed JSON on v1 path → public 400 with request_id (no stack leak). Error: internal paths unchanged shape; mixed mount order doesn't leak. Integration: supertest against createApp() hits both surfaces correctly; logs include request_id (structured).  
**Verification:** `pnpm test` (existing error-handler.test.ts + new platform tests pass, no regression); manual curl on both /api/* and /api/v1/*; type-check.

**U-FND-04: Update Test DB Cleanup + Basic Rate Limit + Audit Hooks for Public**  
**Goal:** Extend test/setup.ts TRUNCATE for new tables; basic public rate limit module skeleton (per-app+token keys, headers); audit extension point (public actor as client_id).  
**Requirements:** Pre-Search 3.2 (tests), codebase (test/setup.ts TRUNCATE critical); 2.3 (rate headers).  
**Files:** `api/src/test/setup.ts`, `api/src/platform/ratelimit/index.ts` (skeleton + headers fn), `api/src/services/audit.ts` (add optional oauthClientId param, non-breaking).  
**Approach:** Add all new table names to TRUNCATE CASCADE (critical to prevent pollution). Rate: wrapper around express-rate-limit or custom Map with key `app:${clientId}|token:${hashPrefix}`, standard headers + 429 Retry-After. Pure header applicator. Audit: extend input type + insert (client_id in details or new col if migration adds; MVP details).  
**Decisions:** Update TRUNCATE immediately (rationale: prevents silent test flakiness on new tables). In-mem rate for MVP (boring).  
**Dependencies:** U-FND-01, U-FND-03.  
**Test scenarios:** Happy/edge: new tables truncated in beforeAll; rate headers present on 200/429; audit with client_id writes without breaking old callers. Error: rate bypass in test (x-bench) still works. Integration: full test run with platform code doesn't corrupt state.  
**Verification:** pnpm test (all files, including new); coverage.

### Phase 2: Core Public Surface (OAuth + Ports + Routes)
**U-CPS-01: OAuth Service, Grants, Dedicated oauthBearerAuth Middleware, ScopeRegistry**  
**Goal:** Full OAuth issuance (Device, AuthCode+PKCE, ClientCreds), token validation/rotation/family invalidation, PKCE, dedicated middleware (populates req.oauthClientId + grantedScopes + distinct expired error; workspace membership via narrow port), data-driven ScopeRegistry + enforcer.  
**Requirements:** Pre-Search 2.1/1.3/3.4 (dedicated middleware only, grants, Client Creds for agent, security, clear errors); architecture.md (flows, PKCE/rotation, system app); auth.ts patterns (hash, expiry, membership query via port).  
**Files:** `api/src/platform/oauth/service.ts` (pure fns + class for external interface), `api/src/platform/scopes/registry.ts` (data-driven), `api/src/platform/middleware/oauthBearerAuth.ts` (dedicated, uses port for membership), `api/src/platform/ports/auth.ts` (narrow `getMembership(workspaceId, userId?)`), tables from FND-01.  
**Approach:** Service methods for each grant (validate client, issue codes/tokens with hashes, rotate refresh + invalidate family on theft suspicion). Middleware: extract Bearer, lookup (hashed), check expiry (distinct PUBLIC_TOKEN_EXPIRED code), scopes, populate req (extend Express for public only), call port for membership (reuse logic, no duplication of full authMiddleware). Registry: const SCOPES = { 'documents:read': {...}, ... }; requireScope factory. ClientCreds: no user, system flag.  
**Decisions:** Membership via injected narrow port (DIP + avoids duplication; rationale: Pre-Search risk on query duplication). Hashed everywhere at rest.  
**Dependencies:** U-FND-01/02/03/04, ports base (parallel ok).  
**Test scenarios (many):** Happy: full Device flow (code → poll → token → use); ClientCreds for system app; PKCE roundtrip. Edge: expired token → distinct code + 401 (internal sessions unaffected); stolen refresh family invalidation; scope mismatch → 403 specific. Error: invalid client secret, replayed code, PKCE mismatch, membership revoked mid-token. Integration: middleware + service + DB; supertest full flows; no internal auth leakage. Adversarial: timing attacks on compare (use timingSafeEqual).  
**Verification:** Dedicated unit tests (oauth.test.ts etc.); pnpm test; manual flows; security review.

**U-CPS-02: Narrow Ports (DIP) + Domain Service Wrappers + Event Publishing Points**  
**Goal:** Define minimal narrow ports (DocumentPort etc.); thin adapters calling existing crud + queries; new thin domain services (e.g., DocumentService) that perform writes + publish to IEventBus (after persistence); wire only for public paths initially.  
**Requirements:** Pre-Search 2.2/2.5/3.2 (domain services only publishers, narrow ports, no behavior change on internal); architecture (DIP, publish after persistence); document-crud.ts + routes patterns.  
**Files:** `api/src/platform/ports/documents.ts` (interface + types), `api/src/platform/ports/issues.ts`, `api/src/platform/ports/sprints.ts` (minimal), `api/src/services/documents.ts` (new thin wrapper or adapter), similar for issues/weeks; updates to existing routes only for publish call sites (minimal). `api/src/platform/events/IEventBus.ts` (interface: publish(event, payload, idempotencyKey)).  
**Approach:** Ports: narrow (create, getById, list, update, delete, with visibility ctx). Adapters: impl that delegates to document-crud + direct SQL (or existing route logic extracted). Services: wrap, do txn, then bus.publish after commit (events from registry). Internal routes continue direct for now (or minimal change to call service).  
**Decisions:** Thin adapters first (rationale: YAGNI + risk mitigation on txn bugs; satisfies publish rule for public surface without full rewrite). Pure publish fns where possible.  
**Dependencies:** U-FND-03 (bus skeleton), U-CPS-01 (for context).  
**Test scenarios:** Happy: public create via port/service emits event (in-mem capture). Edge: publish after txn rollback = no event. Error: port violation (type error). Integration: existing internal path behavior unchanged (assert no extra side effects); public path publishes correct payload shape (Zod).  
**Verification:** New + existing tests (no regression assertions); pnpm test.

**U-CPS-03: Public v1 Routes + OpenAPI Registration + Contracts (Documents/Issues/Sprints minimum)**  
**Goal:** v1Router with Zod-validated CRUD (cursor lists, etc.); reuse/extend registry for public subset or parallel v1 registration; 3.1 public spec at /api/v1/openapi.json; rate/scope/auth already in stack.  
**Requirements:** Pre-Search 2.3/2.5 (contracts, OpenAPI, cursor, rate headers); architecture (v1Router); existing openapi/schemas + registry + generate patterns + route Zod.  
**Files:** `api/src/platform/routes/v1.ts` (or documents.ts etc. under platform), `api/src/platform/openapi/publicSchemas.ts` + registration, updates to `api/src/openapi/registry.ts` or generator for 3.1 path + /api/v1/openapi.json endpoint (in composition), `api/src/platform/contracts/schemas/common.ts` (PublicApiError etc.).  
**Approach:** Routes use req.oauth* + ports for ops; return public shapes. Pagination pure helpers. Register only public ops (or filter). Separate generator path or minor upgrade for 3.1 (servers /api/v1). Fitness later uses snapshot.  
**Decisions:** Minimal surface first (documents core + issue/sprint aliases via unified model). 3.1 only for public spec (reuse v3 registry).  
**Dependencies:** U-CPS-01/02 (auth + ports).  
**Test scenarios:** Happy: authenticated public create/list/update/delete with cursor roundtrip + rate headers. Edge: invalid cursor 400 public shape; rate limit 429 with Retry-After + headers; scope missing 403. Error: unauthed on v1 → public 401 distinct. Integration: full flow emits webhook-eligible event; OpenAPI generation succeeds + includes only public; supertest + SDK (later) parity.  
**Verification:** New route tests; openapi generate + diff; pnpm test + type-check.

### Phase 3: Webhooks & Reliability
**U-WEB-01: IEventBus Full Impl + Webhook Subscriptions, Matcher, Signer, Deliverer, DLQ, Replay, Idempotency**  
**Goal:** Complete IEventBus (in-mem), subscription mgmt (via internal portal paths), event definitions + Zod (data-driven), HMAC signer (timestamped, constant-time), deliverer (exact backoff, 6 attempts, DLQ table), replay (original key), integration with publish points.  
**Requirements:** Pre-Search 2.2/3.3/3.4 (full reliability contract, DLQ replay audited, at-least-once + idempotency, signer, deliverer); architecture.md (exact pipeline mermaid + backoff + 4xx/5xx rules); IEventBus from prior.  
**Files:** `api/src/platform/events/inMemoryBus.ts` (impl), `api/src/platform/webhooks/*` (subscriptions service, matcher.ts pure, signer.ts pure, deliverer.ts (class for loop + shutdown)), `api/src/platform/events/definitions.ts` (min events + Zod), updates to domain services for publish calls, internal routes for sub mgmt if needed.  
**Approach:** Bus: publish fans to matcher (find active subs for event). Signer: `Ship-Signature: t=unix,v1=hex(HMAC(secret, ts + body))`. Deliverer: on publish or poll, attempt POST (idempotency header), classify 2xx/4xx/5xx/timeout, schedule retry via in-mem or DB next_retry, move to DLQ after 6. Replay: create new delivery row with same key + trigger. Graceful shutdown. Pure fns for sign/verify.  
**Decisions:** In-process deliverer (setInterval or queue loop); at-least-once via DLQ (rationale: Pre-Search + no queue infra). Secret per-sub (no versioning per arch).  
**Dependencies:** U-CPS-02 (publish points), U-FND-01 (tables).  
**Test scenarios:** Happy: publish → matcher → signed delivery (mock http) → success log. Edge: 4xx permanent (no retry); 5xx exactly 6 attempts + DLQ; replay re-uses exact Idempotency-Key + current secret; tolerance on ts skew. Error: deliverer crash mid-retry (DLQ catches); bad secret on replay (subscriber handles per docs). Integration: end-to-end from public write (via port) → verified webhook (sig + body + key); in-mem bus for unit tests vs prod behavior; portal replay audited.  
**Verification:** Dedicated webhook tests (unit for pure + integration with bus); TTFE later; pnpm test.

### Phase 4: SDK + CLI + TTFE (Major Validation)
**U-SDK-01: Hand-Written @ship/sdk + verifyWebhook + Fitness Test**  
**Goal:** New pnpm workspace `@ship/sdk` (ShipClient with static deviceLogin/authorizationCodeFlow/clientCredentials + resource clients + constructor; verifyWebhook pure); fitness test (parses public OpenAPI snapshot vs SDK surface + types). Zero api/web imports.  
**Requirements:** Pre-Search 2.4/3.2 (hand-written + fitness, TTFE enabler); architecture.md (exact SDK surface + clientCredentials for agent); strict typing, pure fns.  
**Files:** `sdk/package.json` (new), `sdk/tsconfig.json`, `sdk/src/index.ts` + `clients/documents.ts` etc., `src/auth/flows.ts`, `src/webhooks.ts` (verifyWebhook using crypto.timingSafeEqual), `sdk/tests/fitness.test.ts` (or in api via snapshot). Add sdk to pnpm-workspace.yaml + root scripts.  
**Approach:** Fetch-based (native). Stable methods only. verifyWebhook: parse headers, recompute, safe compare, ts tolerance. Fitness: load openapi.json (public subset), assert clients cover paths/verbs, response shapes compatible (Zod or manual).  
**Decisions:** Hand-written (rationale: quality for stable contract). Fitness in CI (snapshot or served).  
**Dependencies:** U-CPS-03 (public contracts/OpenAPI), U-WEB-01 (verify).  
**Test scenarios:** Happy: clientCredentials flow + create doc + verifyWebhook on payload. Edge: expired tolerance, malformed sig, replay key. Error: network, invalid token → typed errors. Integration: fitness passes on generated spec; SDK types match shared public types.  
**Verification:** sdk type-check + its tests; full monorepo build; fitness in CI.

**U-SDK-02: integrations/cli/ + TTFE Drill as CI Gate**  
**Goal:** Minimal CLI (`ship login` (device), `ship docs create`, `ship webhooks tail` (verified stream)); TTFE script/drill exercising full public + webhook receipt (test subscriber); <60s CI target; run via e2e-test-runner style or dedicated in CI.  
**Requirements:** Pre-Search 2.4/3.2 (TTFE primary signal, <60s CI / 30min clean machine, reference integration); architecture (exact drill steps + grader app).  
**Files:** `integrations/cli/package.json` (or bin), `src/index.ts` (commander or args), using @ship/sdk; drill script (e.g. `scripts/ttfe-drill.ts` or in test-results); e2e/fixtures updates if needed for test app.  
**Approach:** CLI thin wrapper on SDK. Drill: clean env sim, install (local link), login (simulated or real test app creds), create, stand up ephemeral webhook listener (http server), subscribe via SDK, assert receipt + verify + timing. Seeded test OAuth app (not system).  
**Decisions:** CLI in integrations/ (not full workspace if simple; rationale: YAGNI). Test subscriber for webhook proof (no external).  
**Dependencies:** U-SDK-01.  
**Test scenarios:** Happy: full drill end-to-end (login → create → verified event in < threshold). Edge: network blip, retry in drill, sig fail. Error: bad creds, no webhook receipt (fail with actionable msg per e2e rules). Integration: CI gate fails PR on regression; uses isolated fixtures.  
**Verification:** Manual clean-machine run; CI execution (via skill equivalent); pnpm test (unit for CLI if any).

### Phase 5: Portal, Agent, Hardening
**U-PRT-01: Minimal Developer Portal (in web, using internal privileged paths + SDK dogfood)**  
**Goal:** Basic UI in existing web (extend WorkspaceSettings or new section): register app (name, scopes via internal admin path), show/rotate secret once, manage subs (create/list for events/urls), delivery log + replay button (audited internal call). "Eat your own dogfood" via SDK usage where possible.  
**Requirements:** Pre-Search 1.2/2.4/3.4 (portal, bootstrap, dogfood, audited replay); web patterns (Tanstack, settings).  
**Files:** `web/src/pages/WorkspaceSettings.tsx` (or DeveloperPortal.tsx), new components, API calls via existing lib/api.ts or new (to internal endpoints), use @ship/sdk in browser context for verification demo.  
**Approach:** Session + workspaceAdmin protected. Calls internal for privileged. UI minimal (lists, forms, one-time secret display, replay).  
**Decisions:** Internal paths for mgmt (rationale: bootstrap + separation).  
**Dependencies:** U-CPS-01 (OAuth), U-WEB-01 (deliveries).  
**Test scenarios:** Happy: register → rotate → sub → see delivery in log → replay. Edge: secret shown only once, replay after rotation uses new secret. Error: non-admin forbidden. Integration: e2e (or unit) + SDK verify in UI.  
**Verification:** New e2e or component tests; manual in dev.

**U-HRD-01: Agent Rewire + System App Seeding + Public Path Adoption Prep**  
**Goal:** Seed system OAuth app (narrow scopes) at deploy/seed; update any current machine-to-machine code (MCP, fleetgraph actions, claude tools if applicable) or docs to prefer/use SDK Client Credentials + public /api/v1 paths; audit trail under client_id.  
**Requirements:** Pre-Search 1.2/1.3/3.1 (agent as citizen, Client Creds, seeding, audit).  
**Files:** `api/src/db/seed.ts` (extend), `scripts/` bootstrap if needed, `api/src/mcp/server.ts` or fleetgraph relevant (minimal rewire or comments), agent docs/examples.  
**Approach:** Seed creates app row + injects secret via env/SSM (never plain in code). Rewire: where internal calls exist, example usage of SDK.  
**Decisions:** Minimal rewire for MVP (prep + one example); full in Epic 7.  
**Dependencies:** U-CPS-01, U-FND-01.  
**Test scenarios:** Happy: seed produces usable system client_id/secret for ClientCreds flow (tested via SDK in drill). Edge: secret rotation for system. Integration: agent actions appear in public audit with client_id.  
**Verification:** Seed run + manual ClientCreds; pnpm test.

**U-HRD-02: Hardening, CI Gates, Observability, Docs, Full Regression**  
**Goal:** Graceful deliverer shutdown, structured logging + request_id everywhere public, rate tuning + abuse notes, DLQ retention/alerts (basic), TTFE permanent in CI (via runner), full test coverage, shipshape, type-check, OpenAPI updates, minimal user docs (in README or /docs), philosophy audit.  
**Requirements:** Pre-Search 3.2/3.3/3.4/3.5 (testing/CI/TTFE, ops, security, all risks closed).  
**Files:** Updates across platform/ (shutdown hooks in index.ts), `scripts/`, CI config (implicit), `docs/plugforge/*` (usage), e2e updates.  
**Approach:** Add process signals; structured fields (pino or console + metadata); docs for TTFE, scopes, errors, webhook contract. Run full regression + baselines.  
**Dependencies:** All prior.  
**Test scenarios:** Full matrix (including adversarial security for OAuth/webhooks, performance on publish paths, graceful shutdown mid-delivery, TTFE timing in CI env). Integration: end-to-end TTFE passes as gate; no philosophy violations.  
**Verification:** `pnpm test`, type-check, lint, shipshape, e2e (via skill), manual prod-like deploy shadow, TTFE drill timing.

**Sequencing Summary:** FND-01 → FND-02/03/04 (parallel possible) → CPS-01 (ports parallel) → CPS-02/03 → WEB-01 → SDK-01/02 (parallel) → PRT-01 + HRD-01 (parallel) → HRD-02 (gate). Each IU delivers tested, type-checked, philosophy-compliant increment. TTFE + full regression after SDK+WEB.

**Risks/Open Decisions in Plan:** All from Pre-Search tracked + mitigated per IU (e.g., auth duplication via ports + isolation; txn bugs via thin adapters + assertions; low third-party via minimal + agent focus). New: test TRUNCATE completeness (mitigated in FND-04). Stakeholder alignment required on exact v1 scopes/resources before CPS-03 and on portal mgmt paths decision (documented).

**Major Phases Summary (for immediate action):**  
- **Foundation (FND 1-4):** DB + shared + mounting skeleton + test hygiene + basic cross-cutting. Unblocks all auth/routes/events.  
- **Core Public Surface (CPS 1-3):** OAuth boundary + ports/domain publish + public routes/contracts. Delivers usable /api/v1 surface.  
- **Webhooks + SDK/TTFE (WEB + SDK):** Reliability + DX validation (the "major validation" per task).  
- **Portal/Agent/Hardening:** Dogfood + rewire + gates.  

**First 2-3 Implementation Units to Tackle (after Pre-Search + this plan alignment + stakeholder confirmation on open scopes/portal paths):**  
1. **U-FND-01 (DB migrations):** Lowest risk, unblocks everything, follows strict migration rules. Run db:migrate + verify on fresh + existing.  
2. **U-FND-02 + U-FND-03 (shared types + composition/mounting skeleton + isolated error + request_id):** Enables wiring and public shape without business logic. Quick feedback loop with type-check + basic supertest.  
3. **U-FND-04 + start of U-CPS-01 (test cleanup + OAuth skeleton + ScopeRegistry + oauthBearerAuth stub):** Brings dedicated middleware online with test coverage; parallelizable with ports definition.

This plan is dependency-ordered, risk-aware, fully traceable, test-explicit, philosophy-strict, and ready for alignment before any code. All file paths repo-relative. No assumptions treated as facts without evidence from Pre-Search + exploration.

### Critical Files for Implementation
- `docs/plugforge/presearch.md` - [Origin requirements + adversarial analysis + locked decisions + risks (primary source for all traceability)]
- `docs/architecture.md` - [Plugforge platform architecture, composition root sketch, SOLID rationale, contracts, webhook pipeline, SDK surface (north star for design)]
- `api/src/app.ts` - [Core composition root + mounting + global error handler + rate limit patterns (must modify for public sub-app isolation and createPublicPlatform call)]
- `api/src/middleware/auth.ts` - [Existing auth patterns, hashing, membership queries, error shapes, session/expiry logic (reference for dedicated oauthBearerAuth + narrow port extraction)]
- `api/src/openapi/registry.ts` + `api/src/db/migrations/044_*.sql` (latest) + `api/src/test/setup.ts` - [OpenAPI registration/generator patterns + migration numbering + critical TRUNCATE list that must be extended for new tables]