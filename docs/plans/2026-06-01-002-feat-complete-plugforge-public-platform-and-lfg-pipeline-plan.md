---
title: feat: Complete Plugforge Public Platform Layer and Drive Full LFG Pipeline to DONE
type: feat
status: completed
date: 2026-06-01
origin: docs/plugforge/presearch.md
deepened: 2026-06-01
---

# feat: Complete Plugforge Public Platform Layer and Drive Full LFG Pipeline to DONE

## Summary

Complete the remaining public contract surface (full v1 resource routes + OpenAPI per skill, real ports + domain publish, SDK clients/fitness, CLI+TTFE harness as permanent gate, minimal portal dogfood, system app seed, hardening/observability/E2E), then drive the entire 9-step LFG autonomous pipeline (ce-work through residual + browser test + commit-push-pr + CI autofix ≤3 + durable DONE) to green <promise>DONE</promise> state in one shot with no chunking. All work preserves dedicated oauthBearerAuth, domain-only IEventBus publishing, exact webhook contract, Client Credentials for Agent, strict typing, direct SQL, no new content tables, Ship philosophy, and AGENTS.md rules (e2e-test-runner only, preflight, no TODOs/empty tests, /ship-*-reviewer on changes).

---

## Problem Frame

Ship has no stable, versioned, first-class public contract. All access is internal-only via session cookies + legacy api_tokens (api/src/middleware/auth.ts, routes/api-tokens.ts, shared/src/constants.ts). No supported path exists for third-party developers, CLIs, or the internal agent (Epic 7) to perform auditable, scoped, rate-limited, observable CRUD on the unified document model without reverse-engineering or forking auth. Per docs/plugforge/presearch.md (Phase 1) and docs/architecture.md (north star), Plugforge delivers the small stable /api/v1/* surface (OAuth-protected, scope-enforced, rate-limited, webhook-capable with exact backoff/DLQ/replay, audited) treating the internal agent and external developers as equal platform citizens while preserving the core unified document model and boring-tech stack. Current snapshot (post FND + partial CPS/WEB per live api/src/platform/*, migrations 045/046, sdk/, integrations/cli/ skeleton, shared types, test/setup.ts, app.ts mount): foundation + OAuth grants/middleware/scopes (with TODOs), IEventBus + webhooks skeleton (exact contract), stub ports/publish, v1 routes as placeholders (comments reference old U-CPS-03), minimal SDK/CLI, zero portal/TTFE gate/system seed/full hardening/E2E per AGENTS rules, no complete OpenAPI registration per /ship-openapi-endpoints skill. Old ce-implementation-plan.md 11 IUs provide traceability; this plan finishes the remainder + full LFG execution.

---

## Assumptions

*This plan was authored without synchronous user confirmation in strict LFG / pipeline / disable-model-invocation / headless mode. The items below are agent inferences that fill gaps in the input — un-validated bets that should be reviewed before implementation proceeds.*

- v1 public resource surface is documents + issues + sprints (weeks) per presearch.md 1.4/2.3 + architecture.md contracts + YAGNI (no programs/projects or discovery endpoints in MVP).
- All E2E (including TTFE drill and public flows) exclusively use /e2e-test-runner skill (never pnpm test:e2e direct); any required seed data (test OAuth apps, webhook subs, events) is created in e2e/fixtures/isolated-env.ts with N+2 rows + expect assertions (no conditional test.skip per AGENTS.md E2E rules).
- LFG steps 2–9 (ce-work, autofix review, persist, residual, browser test, commit-push-pr, CI loop) execute sequentially in one session following this plan's IUs; any autofix or residual code changes land under U-HRD-02 or a dedicated residual unit with full tests + reviews.
- Browser test phase uses playwright MCP tools (or e2e runner) against public paths + portal UI flows; TTFE timing assertions run in CI-like env via runner.
- Philosophy/security/compliance enforcement uses /ship-philosophy-reviewer + /ship-security-compliance (per AGENTS.md) on all public surface + portal + seed changes; preflight checklist (worktree + postgres docker ship-postgres-1) runs before any test/dev commands.
- System app secret for Agent uses existing secrets-manager.ts + env/SSM guard (never git); seed creates is_system row + narrow scopes only.
- Submission package for review is docs/plugforge/submission/ (checklist + artifacts) + PR body with this plan; no external tracker assumed unless gh/linear detected at commit time.
- No major drift in locked decisions (dedicated middleware, domain publish only, exact webhook backoff/4xx/DLQ/replay/secret-rotation, Client Credentials for agent, TTFE as primary gate, hand-written SDK + fitness, internal privileged paths for portal mgmt).

---

## Requirements

- R1. Complete remaining work from docs/plugforge/ce-implementation-plan.md IUs (trace FND-01–04 + CPS-01/02 + WEB-01 as foundation; finish CPS-03, SDK-01/02, PRT-01, HRD-01/02) while preserving all Pre-Search 1.1–3.5 decisions, locked architecture.md contracts (dedicated oauthBearerAuth never mixed with internal, domain services sole IEventBus publishers, exact webhook reliability, Client Credentials for agent, TTFE <60s CI gate, public ApiError + request_id, OpenAPI 3.1 at /api/v1/openapi.json, ScopeRegistry data-driven, narrow ports DIP), and Ship philosophy (AGENTS.md / .claude/CLAUDE.md / Agents.md: boring tech, direct SQL + pg no ORM, strict typing no any/unknown, pure fns preferred, numbered migrations only, no new content tables, no TODO/FIXME, tests for all new features with happy/edge/error/integration scenarios, e2e-test-runner only, preflight, /ship-*-reviewer on changes).
- R2. Full public resource surface (documents CRUD + issues + sprints with cursor pagination, Zod validation, PublicApiError responses, per-app+per-token rate headers + 429 Retry-After) + complete OpenAPI registration per /ship-openapi-endpoints skill (schema → registerPath → implement route) for all v1 paths; public spec serves cleanly.
- R3. SDK (@ship/sdk) complete with full resource clients, real auth flows (deviceLogin/authorizationCodeFlow/clientCredentials), typed PublicApiError handling, verifyWebhook exact contract, pluggable ITokenStore, hand-written + fitness test against public OpenAPI snapshot; zero imports from api/web.
- R4. integrations/cli/ + TTFE drill harness (ship login/docs/webhooks) as permanent CI regression gate exercising full public contract + cryptographically verified webhook receipt + timing; updates to e2e/fixtures/isolated-env.ts + execution exclusively via /e2e-test-runner.
- R5. Minimal in-app Developer Portal (session + workspaceAdmin protected, using internal privileged paths for app reg/secret rotation/subs mgmt/delivery log/replay; dogfoods SDK for verify demo).
- R6. System OAuth app seed (is_system=true, narrow scopes) + Agent prep (Client Credentials + public paths usage examples/docs); audit trail under client_id.
- R7. Hardening (deliverer graceful shutdown + drain, structured logging with request_id + client_id, DLQ retention + basic observability notes, rate tuning post-baseline), full E2E via /e2e-test-runner (no skips, actionable asserts, fixtures per AGENTS), philosophy + security reviews on all changes, full regression (pnpm test + type-check + shipshape), docs updates, submission package.
- R8. Drive entire 9-step LFG pipeline (this ce-plan as step 1; ce-work per IUs one-shot; autofix review ≤3 loops; persist residual; browser test; commit-push-pr with plan body; CI autofix handling; residual durable; green <promise>DONE</promise> verification) with all tests/E2E green, no philosophy violations, preflight clean.
- R9. Traceability: every IU cites specific Pre-Search sections, old IU IDs from ce-implementation-plan.md, architecture.md contracts, AGENTS.md rules, claude-reference patterns, and live files/lines from research (api/src/platform/*, sdk/src/*, migrations/045/046, v1.ts stubs, etc.).

**Origin actors:** Internal agent (A1: primary consumer, Client Credentials), Third-party developer / CLI (A2: Device + PKCE), In-app Developer Portal (A3: dogfood + privileged mgmt), Platform team / reviewer (A4).

**Origin flows:** F1 (OAuth issuance + token validation for all grants), F2 (domain write → IEventBus publish → matcher → signed delivery with retries/DLQ/replay), F3 (public CRUD with scope/rate/audit + cursor pagination), F4 (TTFE drill: login → create → verified webhook receipt), F5 (portal app lifecycle + replay).

**Origin acceptance examples:** AE1 (agent obtains Client Credentials token + performs scoped public write; appears in audit under client_id), AE2 (CLI device flow + create succeeds with verified webhook), AE3 (webhook secret rotation: deliveries after use new secret, replay uses snapshot), AE4 (TTFE <60s CI / ≤30min clean machine with full sig verify), AE5 (public error always PublicApiError + request_id, distinct codes for expired/scope, no internal shape leakage), AE6 (OpenAPI 3.1 at /api/v1/openapi.json complete for v1 surface + fitness parity with SDK).

---

## Scope Boundaries

- Explicit non-goals: Queue-backed IEventBus (in-memory + DLQ sufficient per Pre-Search 1.4 + arch; LSP later), advanced webhook features (filters, transforms, fan-out), generated SDK (hand-written + fitness only), full portal UI polish or advanced features (minimal dogfood only), Client Credentials refresh tokens (re-exchange on expiry per arch), public discovery / unauthed endpoints, any new document types or content tables (infrastructure tables only via migrations), changes to real-time collaboration / Yjs / 4-panel editor / unified document model, legacy API token deprecation, support for Authorization Code without PKCE, multi-workspace OAuth apps (single-workspace per client initially), broad third-party volume assumptions or market features.
- No mixing of public oauthBearerAuth with internal authMiddleware or session paths (dedicated stack only).
- No edits to api/src/db/schema.sql (migrations 045/046 already landed; future changes numbered only).
- TTFE / E2E use /e2e-test-runner exclusively; no direct pnpm test:e2e.
- All new public routes follow /ship-openapi-endpoints skill exactly (schema first → registerPath → implement); no bypass.
- Worktree preflight checklist + postgres (docker ship-postgres-1 or equivalent) before any test/dev commands per AGENTS.md.

### Deferred to Follow-Up Work

- Post-MVP: queue-backed bus (BullMQ/Inngest/SQS as LSP), advanced webhooks, full Agent Epic 7 rewire (beyond minimal prep/seed), legacy api_tokens deprecation, public discovery endpoints, generated SDK or codegen maintenance, DLQ retention policy + alerting implementation (notes only in this plan), rate limit production tuning + abuse detection (post-baseline).
- Separate PRs/issues: any non-Plugforge refactors surfaced during ports upgrade (e.g., latent txn issues in internal write paths), broader error shape unification across internal surfaces.
- Future: multi-workspace apps, refresh tokens for CC, full MCP tool surface for public v1.

---

## Context & Research

### Relevant Code and Patterns
- api/src/platform/ (current snapshot): index.ts (createPublicPlatform + sub-app mount + deliverer wiring), middleware/ (oauthBearerAuth partial+TODO membership port, publicContext, scopeEnforcer fail-closed PublicApiError), oauth/ (service.ts with device/pkce/cc grants + in-mem codes, routes.ts with issuance), ports/documents.ts (stub + in-mem publish), events/ (IEventBus + inMemoryBus with subscribe), webhooks/ (deliverer.ts exact backoff 1s/4s/16s/1m/5m/30m + DLQ, matcher.ts DB query, signer.ts t/v1 HMAC timingSafeEqual), ratelimit/index.ts (per-app+token skeleton), routes/v1.ts (placeholders with "Real routes in U-CPS-03", /health /me /documents stub using port, registry.registerPath comments), scopes/registry.ts (data-driven docs/issues/sprints/webhooks).
- Migrations: api/src/db/migrations/045_oauth_platform_core.sql (oauth_apps, codes, tokens with hashes, is_system, indexes), 046_webhook_subscriptions_and_deliveries.sql (subs + deliveries with secret, idempotency, status, backoff fields).
- shared/src/types/public.ts (PublicApiError, Cursor, PUBLIC_ERROR_CODES, PUBLIC_EVENT_TYPES), api/src/utils/requestId.ts (pure generate), api/src/test/setup.ts (TRUNCATE for new tables), api/src/app.ts (early createPublicPlatform mount after rate/cors, before session).
- sdk/: package.json (private @ship/sdk), src/client.ts (auth flows stubs + minimal documents getter + fetch), webhooks.ts (verifyWebhook exact t/v1 + tolerance + timingSafeEqual), dist/ built, types.ts/index.ts.
- integrations/cli/: package.json (bin ship, @ship/sdk dep), src/index.ts (commander skeleton + @ts-nocheck + stub calls to non-existent methods).
- pnpm-workspace.yaml (includes sdk + integrations/cli).
- api/src/openapi/registry.ts + existing route patterns (Zod at top, registerPath, safeParse, direct pg).
- docs/architecture.md (composition root sketch, SOLID, public/internal boundary, OAuth flows mermaid, webhook pipeline exact contract, SDK surface, failure modes).
- AGENTS.md / .claude/CLAUDE.md / Agents.md (preflight, e2e-test-runner mandate + fixtures rules + no skips + N+2, migrations numbered only, /ship-openapi-endpoints skill, /ship-philosophy-reviewer + /ship-security-compliance, no git commit --no-verify, tests required, pure fns, strict typing, no TODO, "Untitled" not relevant here, 4-panel untouched).
- docs/claude-reference/ (patterns.md: Zod top-of-file + safeParse + extract*FromRow + direct SQL + txns + no any + error shapes; anti-patterns.md: inconsistent errors, console leaks, empty tests, TODOs; commands.md: pnpm dev/test/type-check/db:migrate, /e2e-test-runner; architecture.md + data-model.md cross-checked).
- Live exploration (grep/list/read on api/src/platform/*, sdk/*, e2e/fixtures, .github no matches for TTFE/public, no portal in web/, no fitness test, no system seed, v1 stubs only, oauthBearerAuth has TODO for port, deliverer in-process skeleton, no complete public OpenAPI registration).

### Institutional Learnings
- docs/solutions/ (category-organized with YAML frontmatter): prior auth duplication risks, webhook idempotency patterns, migration safety, test fixture hygiene, error shape proliferation (presearch/audit findings), TTFE brittleness in CI (timing/network), philosophy enforcement on public surfaces.
- Pre-Search 3.5 + ce-implementation-plan.md risks (OAuth attack surface, publish consistency bugs, error proliferation, at-least-once burden, TTFE maintenance tax, hot-path perf) directly inform mitigations in IUs (isolation, thin ports + no-behavior-change asserts, sub-app error handler, strong Idempotency-Key + SDK helper, minimal + agent-first, data-driven registry + safe caching).
- Existing patterns (api_tokens hashing, oauth-state, audit fire-and-forget, document-crud, rate-limit skip for x-bench, global error handler) reused/adapted with explicit separation.

### External References
- OAuth 2.0 (RFC 6749 + 7636 PKCE + 7009 revocation), RFC 6750 Bearer, Stripe-style webhook signing (t/v1 + tolerance + timingSafeEqual), cursor pagination stability on (id, ts), NIST SP 800-63B-4 session timeouts (already in shared), OpenAPI 3.1 + zod-to-openapi patterns.

---

## Key Technical Decisions

- Sub-app isolation for /api/v1 (with dedicated error handler returning only PublicApiError + request_id, early requestId, no CSRF, Bearer-only): already wired in app.ts + platform/index.ts; chosen over branching global handler for perfect separation + testability (no internal shape leakage, per Pre-Search 2.3/3.4 medium risk + research on current 3+ error shapes).
- In-memory IEventBus + in-process deliverer (BACKOFF exact [1000,4000,16000,60000,300000,1800000], 6 attempts → DLQ, 4xx permanent/5xx retry, replay re-uses original Idempotency-Key + current secret snapshot, graceful shutdown): sufficient for MVP + TTFE per Pre-Search 1.4 + arch (LSP for later queue); at-least-once via DLQ acceptable (agent tolerates per Pre-Search); fire-and-forget publish with DLQ safety (no txn outbox complexity).
- Thin adapter ports + thin domain service wrappers (realize in U2: call existing document-crud / direct SQL in txns, publish to bus only after commit success): satisfies "domain services publish, routes never" for public paths + new writes with minimal blast radius on internal callers (avoids surfacing latent txn bugs in one go per Pre-Search high risk + ce-impl-plan).
- Internal privileged paths (session + workspaceAdmin) for portal app reg/secret rotate/subs mgmt/delivery log/replay; public /api/v1 strictly for issuance + resource ops + signed webhooks: resolves bootstrap + "no leakage of internal auth into public paths" (Pre-Search 2.1/3.4); portal dogfoods public contract via SDK where possible.
- Hand-written SDK + file-based fitness (against generated public OpenAPI snapshot): quality + no generator drift for stable surface (duplication accepted per YAGNI + Pre-Search 2.4); pluggable ITokenStore for CLI persistence.
- TTFE as permanent CI gate (via /e2e-test-runner + ephemeral test subscriber for webhook receipt + sig verify + timing <60s): primary regression signal per architecture + Pre-Search 3.2; uses seeded test OAuth app (not system) + isolated fixtures.
- System app seeding via extended db/seed.ts (or bootstrap) + SSM/secrets-manager for prod secret (never git): follows existing services/secrets-manager.ts + admin-credentials precedent; is_system flag + narrow scopes only.
- Cursor over {id, created_at/updated_at} (base64 opaque) + stable indexes: avoids offset pitfalls; implemented pure in shared + used in public routes.
- Public error shape isolation (sub-app handler only): internal shapes left inconsistent for now (avoids massive unrelated migration per Pre-Search medium risk + research); eventual unification deferred.
- All new public routes: schema (Zod) first per /ship-openapi-endpoints skill → registerPath (with full PublicApiError responses + bearerAuth security) → implement handler (safeParse + public error + request_id); no direct registry bypass.

---

## Open Questions

### Resolved During Planning
- Error shape strategy: closed via sub-app isolation (research on app.ts:277-287 + current 3 shapes + v1.ts comments confirmed separation wins).
- Rate limit algorithm for MVP: per-app+token in-mem key (extend express-rate-limit) with standard headers + 429 Retry-After + x-bench skip; tuning deferred post-baseline (Pre-Search 2.3 risk closed for now).
- Exact narrow port interfaces: DocumentPort/IssuePort/SprintPort (create/get/list + update/delete for docs; publish inside txn success wrapper); adapters vs full refactor decision documented in U2 (thin first).
- TTFE CI placement + webhook receipt: /e2e-test-runner + test subscriber in harness (no external DNS); timing assertions in CI-like env.
- System app seeding: seed.ts extension + env/SSM guard (no git); tested via SDK ClientCreds in drill.
- Public OpenAPI registration: per /ship-openapi-endpoints skill exactly (schema → register → route); public spec endpoint added in composition or dedicated v1 path.

### Deferred to Implementation
- Exact rate limit tuning values + abuse detection thresholds: after baseline measurement in HRD-02 (depends on real traffic patterns post-deploy).
- DLQ retention policy + alerting queries: basic notes + query patterns in docs; full impl (partitioning, cron purge, alerts) deferred (YAGNI for MVP; ops can query table).
- Full Agent rewire beyond seed/prep/examples: minimal for MVP per Epic 7 (deferred to dedicated epic work).
- Performance impact of per-request scope enforcement + event matching on hot paths (documents/issues): data-driven registry + safe caching in place; measure in baselines (deferred tuning).
- Whether public spec is strict subset/filter of registry or parallel registration: decided parallel registration path in U1 (simpler for 3.1 + no internal leakage).

---

## Implementation Units

### U1. U-CPS-03-Complete: Public v1 Resource Routes + Cursor Pagination + Full Contracts + OpenAPI Registration per /ship-openapi-endpoints Skill

**Goal:** Replace all placeholders/stubs in api/src/platform/routes/v1.ts (and split to per-resource routers under platform/routes/ if it improves maintainability) with minimal stable public CRUD surface for documents (create/read/update/delete/list with cursor pagination), issues, and sprints/weeks; pure cursor helpers (encode/decode using shared CursorPayload + base64url + stable {id, ts}); Zod schemas defined at top of each route file with safeParse + PublicApiError on failure; every route registered via registry.registerPath (full requestBody/response schemas including PublicApiError variants + bearerAuth security) per /ship-openapi-endpoints skill before implementation; all responses include request_id and use PublicApiError shape on errors; rate/scope/auth already enforced by stack; /api/v1/openapi.json endpoint serves the public 3.1 (or filtered) spec.

**Requirements:** Pre-Search 2.3/2.5/3.2 (contracts, OpenAPI 3.1, cursor, rate headers, TTFE enabler); docs/architecture.md (v1Router, public spec, failure modes); old ce-implementation-plan.md U-CPS-03; AGENTS.md (/ship-openapi-endpoints skill, strict typing, Zod, no any, direct SQL in ports); claude-reference/patterns.md (Zod top + safeParse, error shapes, extract helpers if used in adapters); live v1.ts stubs + registry patterns.

**Dependencies:** U2 (real ports + publish points), U3 (SDK types for parity).

**Files:**
- Modify: api/src/platform/routes/v1.ts (remove stubs, add real or delegate), api/src/platform/routes/documents.ts (new), api/src/platform/routes/issues.ts (new), api/src/platform/routes/sprints.ts (new), api/src/platform/ports/documents.ts + issues.ts + sprints.ts (upgrade from stub), api/src/platform/contracts/public-schemas.ts (new or extend, Zod for all public bodies/responses + PublicApiError), api/src/platform/index.ts (wire openapi serve + any composition for public spec), api/src/openapi/registry.ts (minor 3.1 path if needed, no breaking).
- Test: api/src/platform/__tests__/v1-public-routes.test.ts (new, supertest + bus capture for publish).
- Docs: updates to docs/architecture.md or docs/plugforge/usage.md if contracts clarified.

**Approach:** Follow /ship-openapi-endpoints exactly: define Zod schema const FIRST (e.g. createDocumentSchema = z.object({ title: z.string().min(1).max(500), ... })), then registry.registerPath({ method: 'post', path: '/api/v1/documents', requestBody: { content: { 'application/json': { schema: createDocumentSchema } } }, responses: { 201: { description: 'Created', content: { 'application/json': { schema: DocumentPublicSchema } } }, 400: { description: 'PublicApiError' }, ... }, security: [{ bearerAuth: [] }] }), THEN implement handler (const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ code: 'INVALID_INPUT', message: ..., details: parsed.error, request_id }); ... const result = await port.create(...); res.status(201).json({ ...result, request_id: req.requestId })). Pure cursor utils in contracts/ (encodeCursor({id, ts}): string, decodeCursor(cursor): CursorPayload, throws typed INVALID_CURSOR). Routes call narrow ports (which handle txn + publish after success). No internal auth leakage. Public spec endpoint (GET /api/v1/openapi.json) serves generated or static 3.1 subset (reuse generator with v1 filter or dedicated path).

**Patterns to follow:**
- claude-reference/patterns.md (Zod validation at top of file + safeParse + early return with public error shape; direct SQL + txns inside port adapters; extract*FromRow style for any row mapping; no any/unknown; strict return types).
- Existing public skeleton (v1.ts health/me registration, oauth routes registerPath style, scopeEnforcer usage).
- shared/src/types/public.ts (PublicApiError, PUBLIC_ERROR_CODES, Cursor).
- api/src/openapi/registry.ts + zod-to-openapi usage in other routes.
- AGENTS.md (all public routes registered; no TODO in production code).

**Test scenarios:**
- Happy path: POST /api/v1/documents { "title": "Test Doc" } with valid Client Credentials token + documents:write scope → 201 PublicApiError-free body with id/title + request_id; subsequent GET /api/v1/documents?limit=10 returns cursor + items; roundtrip cursor decode stable and returns next page; publish captured on inMemoryBus with correct type/payload/idempotencyKey.
- Edge cases: list with cursor from prior page returns exact next stable set (no duplicates/misses on {id, ts}); update with partial fields succeeds; delete returns 204; empty list returns empty items + no cursor; boundary limit=0 or >max clamps per contract.
- Error and failure paths: unauthenticated Bearer missing/invalid → 401 { code: 'PUBLIC_TOKEN_INVALID' or 'PUBLIC_TOKEN_EXPIRED', request_id, no stack }; insufficient scope on write → 403 { code: 'PUBLIC_SCOPE_INSUFFICIENT', details: { missing_scopes: [...] }, request_id }; invalid cursor → 400 { code: 'INVALID_CURSOR', ... }; malformed JSON body → 400 PublicApiError with details; rate limit exceeded (no x-bench) → 429 { code: 'RATE_LIMITED', ... } + Retry-After header + standard X-RateLimit-*; txn failure in port (simulated) → 500 PublicApiError (no partial write, no event published).
- Integration scenarios: public create → port txn commit → bus publish → matcher finds sub (if seeded) → deliverer signs (t/v1 + timingSafeEqual) + POST with Idempotency-Key → success logged in deliveries table; replay via internal (later portal) re-uses exact original key + current secret; OpenAPI generate succeeds and /api/v1/openapi.json includes all v1 paths + full PublicApiError schema + bearerAuth + no internal-only fields; SDK client (U3) roundtrips successfully against live routes; supertest + bus spy proves publish only after persistence success; no behavior change on internal document routes (parallel test run).

**Execution note:** Start with failing route contract test (supertest against mounted publicApp) for request/response + OpenAPI registration order.

**Verification:**
- `pnpm type-check --filter api` (strict, no any).
- `pnpm test` (new v1-public-routes.test.ts + all existing, no regression on internal paths or TRUNCATE).
- OpenAPI generation + manual inspection of /api/v1/openapi.json (or served endpoint) for completeness + 3.1 validity.
- Manual curl with real OAuth token (from sdk or service) for all CRUD + error cases.
- Philosophy review (/ship-philosophy-reviewer) on routes + ports changes (no new content tables, domain publish, reuse).
- (Visual aid note: dependency graph of U1→U2→U3/U4 (parallel U5/U6 after) → U7/U8 embedded in phased delivery prose; non-linear fan-in at U7 captured in System-Wide Impact interaction graph.)

### U2. Ports & Domain Services Realization (Upgrade Stubs to Real Adapters + Publish Points)

**Goal:** Replace stub documentPort (and add IssuePort/SprintPort) with thin adapters calling existing document-crud.ts / direct SQL queries inside explicit transactions; introduce thin domain service wrappers (DocumentService etc.) that perform the write + call bus.publish only after successful commit; wire only for public paths initially (internal routes unchanged observable behavior); narrow interfaces strictly typed (no any); publish after persistence success (never in route or middleware).

**Requirements:** Pre-Search 2.2/2.5/3.2 (domain services sole publishers, narrow ports DIP, no behavior change on internal); docs/architecture.md (DIP, publish after persistence, SOLID); old ce-implementation-plan.md U-CPS-02; AGENTS.md (direct SQL + pg, pure fns preferred, narrow ports, no TODO, tests required); claude-reference/patterns.md (extract*FromRow or equivalent for rows, txns, no any); live ports/documents.ts stub + document-crud.ts + routes patterns.

**Dependencies:** U1 (needs real ports for routes); FND-01/02 (tables + types).

**Files:**
- Modify: api/src/platform/ports/documents.ts (real adapter + txn + publish), api/src/platform/ports/issues.ts (new), api/src/platform/ports/sprints.ts (new), api/src/platform/services/documents.ts (new thin wrapper), api/src/utils/document-crud.ts (minor if port needs hook, non-breaking), relevant internal routes/services (no change or thin opt-in publish hook only if needed for consistency later).
- Test: api/src/platform/__tests__/ports-and-publish.test.ts (new, asserts publish only post-commit, no behavior change on internal paths).

**Approach:** Define narrow interfaces first (export interface DocumentPort { create(...): Promise<...>; ... }). Adapter impl: async function create(input) { return withTransaction(async (client) => { const row = await insert...; const doc = extractDocumentFromRow(row); await bus.publish({ type: 'document.created', payload: {id: doc.id, ...}, idempotencyKey: `doc-create-${doc.id}` }); return doc; }); }. Thin service (optional for SRP): DocumentService = { async create(input, bus) { return adapter.create(input, bus); } }. Internal paths continue calling crud directly (no publish) or via opt-in; public paths go through service/port. Pure helpers for extract + cursor if needed. All strict types.

**Patterns to follow:**
- claude-reference/patterns.md (direct SQL + txns in utils/services, extract*FromRow, pure fns, no side effects on inputs, narrow ports as interfaces).
- Existing document-crud.ts + utils patterns (withTransaction, extract helpers).
- api/src/services/audit.ts extension precedent (non-breaking).
- Pre-Search 2.2 + arch (domain publishes after persistence; routes/middleware never).

**Test scenarios:**
- Happy path: public create via port → txn succeeds → publish with correct event + idempotencyKey (bus spy captures); internal create path (direct crud call) unchanged observable (no publish, same row shape).
- Edge cases: txn rollback mid-write (simulated constraint violation) → no publish (bus spy empty), error bubbles as PublicApiError; concurrent public writes (different docs) both publish independently.
- Error and failure paths: port adapter DB failure → typed error (no silent swallow, no partial publish); invalid input at port boundary → specific error before txn.
- Integration scenarios: public write (route → port → service → txn + publish) → bus → matcher/deliverer (U1 test); full end-to-end from SDK client (U3) → verified webhook (sig + key + body); parallel internal mutation test asserts no new events or behavior change; type-check proves narrow interface (no leakage of internal crud types).

**Execution note:** Characterization tests on existing internal write paths before introducing publish hooks.

**Verification:**
- `pnpm test` (new ports test + full suite, internal paths identical before/after).
- Manual + scripted: public create emits event; internal does not (unless explicitly wired later).
- Type-check + no any in port/service boundaries.
- Philosophy review on publish points (domain only).

### U3. SDK-01-Complete: Hand-Written @ship/sdk Full Surface + Fitness Test

**Goal:** Complete @ship/sdk (already skeleton in sdk/) with full stable resource clients (DocumentsClient with cursor support + typed errors, IssuesClient, SprintsClient), complete real auth flows (deviceLogin full poll + onUserCode, authorizationCodeFlow with PKCE redirect handling, clientCredentials real POST to /oauth/token), PublicApiError typed error class + mapping on non-2xx, verifyWebhook re-export + usage, pluggable ITokenStore interface for CLI persistence; hand-written only + fitness.test.ts (loads public OpenAPI snapshot or served /api/v1/openapi.json, asserts client surface covers paths/verbs + response shapes compatible); zero api/web imports; built + type-check clean.

**Requirements:** Pre-Search 2.4/3.2 (hand-written + fitness, TTFE enabler); docs/architecture.md (exact SDK surface + clientCredentials for agent); old ce-implementation-plan.md U-SDK-01; AGENTS.md (strict typing, pure fns for verify, no TODO, tests required); live sdk/src/* (stubs + partial documents getter + verify good).

**Dependencies:** U1 (public contracts + OpenAPI for fitness), U2 (real routes/ports for runtime), U4 (CLI consumer).

**Files:**
- Modify: sdk/package.json (add test script if needed, node-fetch already), sdk/src/client.ts (complete flows + clients + error handling), sdk/src/webhooks.ts (already good), sdk/src/types.ts (PublicApiError + client options + ITokenStore), sdk/src/index.ts (exports), sdk/tests/fitness.test.ts (new).
- Test: sdk/tests/*.test.ts (new for flows + verify + error mapping).

**Approach:** Fetch-based (native + node-fetch for compat). Static async deviceLogin({ onUserCode, baseUrl }): does /oauth/device/code + poll loop with slow_down handling + returns client with token. Similar for authorizationCodeFlow (redirect handling stub or callback). clientCredentials({ clientId, clientSecret, baseUrl }): POST grant_type=client_credentials, stores token. Resource getters: documents.create/list/get/update/delete (with cursor decode + typed PublicApiError on !ok). Class PublicApiError extends Error { code, details, request_id, status }. verifyWebhook re-exported. Fitness: vitest that fetches or loads snapshot, parses, asserts client methods match paths, response schemas compatible (manual or Zod). Pure verify fn.

**Patterns to follow:**
- Strict typing everywhere (no any in public surface), pure fns for verify + cursor helpers.
- Existing sdk verify + partial client (extend without breaking).
- AGENTS.md (tests for new features, no TODO in prod).

**Test scenarios:**
- Happy path: clientCredentials real flow against running publicApp (test app) → token → documents.create succeeds with typed response; verifyWebhook on captured delivery payload + headers returns true.
- Edge cases: device poll slow_down handling + eventual success; token expiry in flow → typed PublicApiError; cursor list pagination via SDK client.
- Error and failure paths: invalid client creds → PublicApiError with code 'PUBLIC_TOKEN_INVALID' or equivalent; network/5xx → typed with status; malformed webhook sig or ts skew → verify returns false (no throw).
- Integration scenarios: full SDK + live public routes (U1) + webhook (U2) roundtrip in test; fitness.test.ts passes on generated public openapi.json (or served); SDK types match shared/public.ts exactly; CLI (U4) can import + use without type issues; no api/web imports (enforced by tsconfig + test).

**Verification:**
- `cd sdk && pnpm type-check && pnpm test` (fitness + unit).
- Monorepo: pnpm --filter @ship/sdk build.
- Fitness runs in CI context against real public surface.

### U4. SDK-02 + TTFE: integrations/cli/ + Permanent TTFE Drill Harness as CI Gate

**Goal:** Complete ship CLI (commander-based, token persist in ~/.ship/config or env, commands: login (device), docs create <title>, webhooks tail/verify); TTFE drill harness (script or e2e-integrated) that: provisions isolated test OAuth app (via fixture or seed), runs full login + create + ephemeral webhook listener (http server on random port) + sub + assert receipt + verifyWebhook + timing <60s threshold; fails with actionable message per AGENTS; permanent CI gate (invoked via /e2e-test-runner in verification steps, not ad-hoc pnpm); updates to e2e/fixtures/isolated-env.ts for required OAuth app + sub + event data (N+2 rows, expect asserts, no skips).

**Requirements:** Pre-Search 2.4/3.2 (TTFE primary signal, <60s CI / ≤30min clean, reference integration); docs/architecture.md (exact drill + grader); old ce-implementation-plan.md U-SDK-02; AGENTS.md (ALWAYS /e2e-test-runner for E2E, update fixtures/isolated-env.ts for seed data, NEVER conditional skip, expect with actionable, empty-test hook, preflight); live cli skeleton + sdk stubs.

**Dependencies:** U3 (complete SDK), U1/U2 (live surface + webhook).

**Files:**
- Modify: integrations/cli/package.json (deps, bin), integrations/cli/src/index.ts (full commander + persist + real SDK calls + error handling), integrations/cli/tsconfig.json (fix @ship/sdk types).
- New: scripts/ttfe-drill.ts or e2e/public-ttfe.test.ts (harness), e2e/fixtures/isolated-env.ts (add public test app + sub creation).
- Test/CI: updates to e2e runner invocation or .github if needed (but use runner skill).

**Approach:** CLI thin wrapper on SDK (ShipClient with ITokenStore impl for persist). Drill: create isolated env (test app with docs:write + webhooks:manage, no secret in git), login via SDK (CC for speed in CI or device sim), client.documents.create, stand ephemeral listener (express or http, /webhook endpoint that captures + verifies sig), SDK subscribe or manual internal call to create sub pointing to localhost:port, assert delivery within timeout + verify true + idempotency + timing; teardown. Run exclusively via /e2e-test-runner (per AGENTS). Update fixtures with expect(rowCount >= N+2, 'Run seed or fixture setup').

**Patterns to follow:**
- AGENTS.md E2E rules exactly (fixtures update, no skip, actionable expect, /e2e-test-runner).
- Existing e2e patterns + isolated-env.ts.
- CLI: commander (already in skeleton), strict error handling.

**Test scenarios:**
- Happy path: full TTFE drill (login → create doc → webhook received + verified + <60s) passes in e2e runner; CLI commands work end-to-end against test surface.
- Edge cases: webhook delivery retry in drill (sim 5xx), sig tolerance, replay key match.
- Error and failure paths: no webhook receipt → test fails with "Webhook not received in 30s. Check deliverer loop, sub creation, listener port. See e2e/fixtures/isolated-env.ts:XXX for seed."; bad creds or scope → actionable "Missing documents:write. Seed test app with correct scopes."; timing > threshold → fail with "TTFE exceeded 60s (actual: 72s). Regression in public path or deliverer backoff."
- Integration scenarios: drill exercises U1 routes + U2 publish + U3 SDK + webhook verify; e2e runner invocation (not direct pnpm); fixtures create test OAuth app + sub + event row (N+2); parallel internal E2E unaffected; CI gate fails PR on regression.

**Execution note:** Run full drill manually on clean machine equivalent before declaring gate permanent.

**Verification:**
- `/e2e-test-runner` (or equivalent invocation) with new public TTFE test; --last-failed for iteration.
- Manual clean-machine: npm link or pnpm, ship login, ship docs create, timing.
- All AGENTS E2E rules satisfied (fixtures updated, no skips, actionable msgs).

### U5. U-PRT-01: Minimal Developer Portal (In-App, Session + Admin Protected, SDK Dogfood)

**Goal:** Basic Developer Platform section in existing web app (e.g. extend WorkspaceSettings or new route under settings, 4-panel untouched as this is not a document editor): register OAuth app (name, redirect_uris, allowed_grants, default_scopes from registry list), show/rotate client secret (displayed once, internal privileged POST), manage webhook subscriptions (create/list for PUBLIC_EVENT_TYPES, target_url, active), delivery log (list recent deliveries per sub/app with status/latency, replay button triggering internal audited endpoint that re-uses original Idempotency-Key + current secret); "eat your own dogfood" by using @ship/sdk in browser context for a verify demo or test publish button. All privileged ops via existing internal /api/* paths (session + workspaceAdmin check); no leakage into public /api/v1.

**Requirements:** Pre-Search 1.2/2.4/3.4 (portal dogfood, bootstrap, audited replay, no internal auth leakage); docs/architecture.md (portal section); old ce-implementation-plan.md U-PRT-01; AGENTS.md (web patterns, no new content tables, strict typing, tests, philosophy); web/ existing settings + Tanstack patterns.

**Dependencies:** U1 (public surface for dogfood), U2 (deliveries table + replay), U3 (SDK in browser).

**Files:**
- Modify: web/src/pages/WorkspaceSettings.tsx or new web/src/pages/DeveloperPlatform.tsx (minimal forms/lists), web/src/lib/api.ts or dedicated (internal calls for reg/rotate/subs/log/replay), web package.json (if SDK browser needs polyfill, but YAGNI).
- New: web/src/components/developer/* (minimal: AppForm, SecretDisplay, SubList, DeliveryLog with Replay).
- Test: web e2e or component tests for portal flows (via e2e runner).

**Approach:** Session-protected page (existing auth). Admin check via existing hooks. Forms POST to internal endpoints (new or extend admin/developer routes if needed, but prefer minimal internal privileged). Secret shown once (server returns plaintext only on rotate/create, then hashed). Subs use public event types from registry. Replay: internal call creates new delivery row with original key + triggers deliverer. Browser SDK: for demo "Test webhook" button (uses stored test token or CC, calls public create, verifies receipt in log). Minimal UI (tables, modals for one-time secret, no fancy polish).

**Patterns to follow:**
- Web patterns from claude-reference (Tanstack, existing settings, auth hooks).
- AGENTS.md (no 4-panel change, reuse Editor? N/A, strict, tests).
- Pre-Search (internal privileged for mgmt, public contract dogfood only).

**Test scenarios:**
- Happy path: admin registers app → secret displayed once (copy works) → rotate (new secret, old invalid) → create sub for document.created → delivery appears in log after public create (via SDK demo) → replay succeeds (new delivery logged, verified).
- Edge cases: secret shown only on create/rotate (subsequent views masked); replay after secret rotation uses new secret (subscriber test verifies); non-admin 403 on portal page.
- Error and failure paths: invalid target_url on sub create → 400 with actionable; replay on DLQ item → specific status; SDK dogfood verify fails in demo → clear error in UI.
- Integration scenarios: portal sub + public write (U1) → delivery in log; replay audited (internal audit trail); browser SDK verify matches server signer (U2); e2e test (runner) covers full portal flow + dogfood.

**Verification:**
- Manual in dev (session admin).
- New e2e test via /e2e-test-runner (portal + public interaction).
- Philosophy review (separation, no auth mixing, dogfood).

### U6. U-HRD-01: Agent Rewire Prep + System App Seeding

**Goal:** Extend api/src/db/seed.ts (or dedicated bootstrap in scripts/) to insert a system OAuth app row (is_system: true, narrow default_scopes for agent: documents:read/write + issues:read/write + sprints:read/write + webhooks:manage, client_id opaque stable or env-driven, secret_hash via env guard or secrets-manager.ts integration); prod secret never in git (SSM/Secrets Manager precedent); minimal Agent/MCP/fleetgraph/claude docs or code examples updated to show Client Credentials flow + public /api/v1 paths + SDK usage (audit under client_id); no full Epic 7 rewire.

**Requirements:** Pre-Search 1.2/1.3/3.1 (agent as first-class citizen, Client Creds, seeding, audit); old ce-implementation-plan.md U-HRD-01; AGENTS.md (seed patterns, secrets, no git secrets); live oauth service (is_system check in client_credentials).

**Dependencies:** U1 (CC grant + scopes), FND-01 (is_system column).

**Files:**
- Modify: api/src/db/seed.ts (add system app insert, idempotent), api/src/services/secrets-manager.ts (if new secret path), docs/ (agent usage examples or mcp/README), any relevant agent entrypoint (minimal comments or example client init).
- New: scripts/bootstrap-public-platform.ts (optional for deploy).

**Approach:** Seed: if (!exists system app) insert with is_system=true, scopes from registry, secret_hash = hash(process.env.SYSTEM_CLIENT_SECRET || throw in prod). Prod: secret from SSM never code. Docs: "Agent uses: const client = await ShipClient.clientCredentials({ clientId: process.env.SHIP_AGENT_CLIENT_ID, clientSecret: process.env.SHIP_AGENT_CLIENT_SECRET }); client.documents.create...". Audit: client_id in public paths already wired.

**Patterns to follow:**
- Existing seed.ts + secrets-manager.ts patterns.
- AGENTS.md (no secrets in git, migrations/seed for data).

**Test scenarios:**
- Happy path: pnpm db:seed produces usable system app (queryable, is_system true, narrow scopes); SDK clientCredentials with seeded creds succeeds against public /api/v1 and performs scoped write (audit row has client_id).
- Edge cases: seed idempotent (re-run no duplicate client_id); secret rotation for system (update hash, old tokens fail with PUBLIC_TOKEN_EXPIRED).
- Error and failure paths: missing SYSTEM_CLIENT_SECRET in prod-like env → clear error on seed; invalid system app in CC grant → 400 invalid_client.
- Integration scenarios: agent-style CC write → webhook (if sub) + audit under client_id; TTFE drill (U4) can optionally use system for speed; no secret in git or logs.

**Verification:**
- `pnpm db:seed` + query assertions.
- SDK CC flow in test with seeded app.
- Philosophy + security review on seed/secret handling.

### U7. U-HRD-02: Hardening, Observability, Gates, Full Regression, Philosophy Audit, Submission Package

**Goal:** Deliverer graceful shutdown + drain (process signals in platform/index.ts + stopPublicPlatform); structured logging (request_id + oauthClientId + event types on public paths, replace console where possible); DLQ retention notes + sample queries in docs; rate limit baseline + tuning notes; TTFE permanent in CI (via e2e runner invocation in pipeline verification); full test coverage + pnpm test + type-check + shipshape + /e2e-test-runner full suite; /ship-philosophy-reviewer + /ship-security-compliance on all public + portal + seed changes; docs/plugforge/usage.md + error catalog + webhook contract + TTFE maintenance; submission package (docs/plugforge/submission/ with checklist, this plan, artifacts, screenshots plan, residual list).

**Requirements:** Pre-Search 3.2/3.3/3.4/3.5 (testing/CI/TTFE, ops/reliability, security, all risks); old ce-implementation-plan.md U-HRD-02; AGENTS.md (all reviews, preflight, e2e runner, no --no-verify, full regression before commit); live deliverer skeleton + console logs.

**Dependencies:** All prior U1–U6.

**Files:**
- Modify: api/src/platform/index.ts (shutdown hooks, drain), api/src/platform/webhooks/deliverer.ts (graceful stop), relevant middleware/services (structured log fields), docs/plugforge/* (usage, contracts, ops), e2e/ (full public coverage), .github if needed (but runner-based), root README or contributing.
- New: docs/plugforge/submission/ (checklist.md, residual.md, etc.), scripts or CI snippets for gate.

**Approach:** Signals: process.on('SIGTERM', async () => { await stopPublicPlatform(); process.exit(0); }). Logs: replace console.error in public paths with structured (pino or console + metadata object including requestId/clientId). DLQ: sample query + note "retention 30d default; monitor depth". Rate: run baseline, document tuning process. TTFE: make gate (runner invocation in verification). Full regression + reviews before any commit. Submission: tar or dir with plan + review artifacts.

**Patterns to follow:**
- AGENTS.md (reviews mandatory, preflight, e2e runner, compliance).
- Existing audit/logging patterns (structured where possible).
- Pre-Search risk mitigations.

**Test scenarios:**
- Happy path: full pnpm test + type-check + shipshape + /e2e-test-runner (public + TTFE) passes clean; deliverer drains on signal without lost deliveries.
- Edge cases: mid-delivery shutdown (pending move to DLQ or graceful); high DLQ depth (query works).
- Error and failure paths: public path error always includes request_id + client_id in logs; rate abuse note in docs.
- Integration scenarios: philosophy review passes with no violations (domain publish, dedicated middleware, no TODO, tests, etc.); security review on OAuth/webhook surfaces; end-to-end LFG pipeline verification (see U9); submission package complete + plan body ready for PR.

**Verification:**
- Full regression suite (pnpm commands + /e2e-test-runner).
- Manual signal test + log inspection.
- /ship-philosophy-reviewer + /ship-security-compliance on changes (zero critical).
- Pre-flight checklist clean.
- Submission package artifacts present.

### U8. LFG Pipeline Execution (Steps 2–9) + Residual Durable + Browser Test + Commit-Push-PR + CI Loop + <promise>DONE</promise>

**Goal:** Explicit verification + any minimal supporting changes (if autofix requires) to drive: ce-work (implement U1–U7 sequentially one-shot per this plan, no chunking); autofix review (if CI fails post-PR, fixes ≤3 loops land under U7/U8 with tests + reviews); persist residual (update this plan + docs/plugforge/residual.md); browser test (playwright MCP or runner on public paths + portal UI + TTFE flows); commit-push-pr (gh pr create --body-file this-plan.md or equivalent, no --no-verify, preflight + full green before push); CI loop handling (monitor via tools, fix in place); residual durable (plan + docs updated, no open critical); final green <promise>DONE</promise> state (all tests/E2E/TTFE green, type-check, shipshape, philosophy clean, TTFE gate passing, public surface usable by Agent + SDK, submission package ready).

**Requirements:** LFG invocation context + full 9-step autonomous; AGENTS.md (preflight every session, e2e runner, reviews, no --no-verify, commit only green); this plan U1–U7 as the work.

**Dependencies:** U1–U7 complete + green.

**Files:**
- Modify: this plan (if residual), docs/plugforge/residual.md (new or update), any CI/autofix diffs (land in U7).
- Verification only (no new code unless residual requires).

**Approach:** ce-work follows IUs in order (U1 then U2 ... U7), running verification after each (type, test, runner for E2E parts). Post ce-work: persist any residual to docs, run browser test (playwright MCP for /api/v1 flows + portal), preflight, full green, commit (gh), push, PR (plan as body), monitor CI (tools), autofix ≤3 (land changes + re-review), residual durable, DONE promise.

**Patterns to follow:**
- AGENTS.md LFG/preflight/security/compliance rules exactly.
- All prior philosophy.

**Test scenarios:**
- (Verification outcomes + supporting harness if residual): After U1–U7: pnpm type-check --filter api && pnpm test && /e2e-test-runner (full public + TTFE) green; preflight clean (docker ps shows ship-postgres-1, no uncommitted per checklist); browser test (playwright MCP tools) on public health/me/documents + portal flows passes with explicit assertions; philosophy + security reviews zero P0/P1 (findings logged in residual.md if any); TTFE timing <60s in runner with actionable failure msg; Agent-style CC flow succeeds end-to-end (token → create → audit client_id → webhook verify); submission package complete (docs/plugforge/submission/checklist.md with all U outcomes); commit-push-pr succeeds with plan body (gh pr create --body-file ... no --no-verify); CI green after ≤3 autofix loops (fixes land here + re-review); residual durable (plan + docs/plugforge/residual.md updated, no open criticals); final state <promise>DONE</promise> (public platform complete, LFG pipeline green, Ship monorepo ready, all AGENTS rules followed).

**Verification:**
- Explicit step-by-step in ce-work log: preflight → implement U1 + verify → ... → U7 + verify → browser test → commit (green) → PR → CI monitor/fix loop (≤3) → residual → DONE.
- All AGENTS rules followed (no direct e2e, reviews, preflight, etc.).
- Green <promise>DONE</promise> declaration only when all criteria met.

---

## System-Wide Impact

- **Interaction graph:** Public routes → narrow ports (DIP) → existing document-crud + direct SQL (txn) → IEventBus publish (domain only) → matcher (DB) → signer (HMAC) → deliverer (backoff/DLQ/replay, in-process) → subscriber webhooks (idempotency required); middleware stack (publicContext → rate → oauthBearerAuth → scopeEnforcer) before v1Router; OpenAPI registry shared (registerPath for public only); test setup TRUNCATE extended (already); e2e fixtures/isolated-env.ts updated for public seed data; portal (web) calls internal privileged + dogfoods SDK (public); Agent/MCP uses SDK CC + public paths; composition root (createPublicPlatform in app.ts early mount); shutdown hooks on process signals.
- **Error propagation:** Public paths always PublicApiError + request_id (sub-app handler isolates); distinct codes (PUBLIC_TOKEN_EXPIRED/INVALID, SCOPE_INSUFFICIENT, RATE_LIMITED, INVALID_CURSOR); no stack leaks; internal paths unaffected (shape + behavior); port errors bubble as public 4xx/5xx with details.
- **State lifecycle risks:** Deliverer pending map + in-process loop (drain on shutdown, DLQ safety on crash); secret rotation (in-flight deliveries use snapshot at sign time; subscribers must handle 1-2 secret versions briefly); OAuth token family invalidation (theft detection); cursor stability (depends on monotonic ts + unique id in window); test pollution (TRUNCATE critical, already updated); idempotency keys (subscriber responsibility, SDK helper).
- **API surface parity:** Public vs internal shapes intentionally differ (PublicApiError vs mixed internal); no leakage; SDK parity via fitness (not generator); portal uses internal for privileged + public SDK for dogfood.
- **Integration coverage:** End-to-end: SDK/CLI/Agent CC → public CRUD (U1) → port publish (U2) → bus → webhook signed delivery + verify (U3/U4) → portal log/replay (U5); TTFE covers full + timing; E2E (U4/U8) + browser (U8) cover UI + API; internal paths unchanged (parallel tests); seed (U6) enables Agent.
- **Unchanged invariants:** Internal authMiddleware / session / legacy tokens / CSRF on /api/* (public uses dedicated Bearer only, no CSRF); unified document model / 4-panel editor / Yjs collaboration / real-time WS (untouched); core routes/services (public goes through ports only); existing OpenAPI internal paths; migration numbering + schema.sql untouched; "Untitled" defaults (N/A); boring tech + direct SQL + strict typing + pure fns (enforced in all new code).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| OAuth token model + new attack surface (high, Pre-Search) | Dedicated middleware isolation + fail-closed enforcer + adversarial tests (timingSafeEqual, family invalidation, distinct expired codes) + narrow scope for system app + security review (U7) |
| Publish consistency / latent txn bugs on write paths (high, Pre-Search) | Thin adapters first + explicit no-behavior-change asserts on internal paths (U2) + txn after persistence only + characterization before hooks |
| Error shape proliferation + client confusion (medium, Pre-Search) | Sub-app isolation (perfect separation) + clear docs + PublicApiError only on /api/v1 + eventual unification deferred |
| Webhook at-least-once + idempotency burden on subscribers (medium) | Strong Idempotency-Key contract + SDK helper + docs + replay uses original key + subscriber tests in TTFE/E2E |
| TTFE brittleness (timing, network, CI env) (medium) | /e2e-test-runner + ephemeral listener + CC for speed + timing threshold with actionable fail + clean-machine manual run |
| Portal bootstrap / auth mixing (medium) | Internal privileged paths only for mgmt + public SDK dogfood only + admin checks + separation review |
| Deliverer in-process crash / EB scaling (medium) | DLQ safety + graceful shutdown + restart resilience + observability notes |
| Low third-party volume (maintenance tax on SDK/CLI/TTFE) (medium) | Minimal surface + agent-first (primary consumer) + TTFE as internal proof + YAGNI on polish |
| Perf on hot paths (scope + matching) (low) | Data-driven registry + safe in-mem + baseline measurement (deferred tuning) |
| Test fixture / TRUNCATE omission (low, already mitigated) | Explicit update in FND-04 + verification in all E2E |
| CI autofix >3 loops or pipeline stall (LFG) | One-shot IUs + explicit verification after each + pre-commit hooks + philosophy gates + ≤3 loop hard limit in U8 |

**Dependencies / Prerequisites:** Postgres running (docker or local per CLAUDE/AGENTS) before any test; pnpm install + sdk build before CLI/TTFE; full green regression + reviews before any commit/push; preflight checklist at start of every session/worktree.

---

## Documentation / Operational Notes

- **Docs to update/create:** docs/plugforge/usage.md (OAuth flows, scopes, error catalog, webhook contract + verify, SDK install + examples, TTFE drill, portal usage, Agent integration); docs/plugforge/residual.md (post-LFG); docs/plugforge/submission/ (checklist.md with all U verification outcomes, artifacts, screenshots plan, this plan as body); README.md or contributing.md (public platform section); agent/MCP docs (Client Credentials + public paths examples).
- **Operational:** DLQ monitoring (sample query: SELECT COUNT(*) FROM webhook_deliveries WHERE status='dlq' AND created_at > now()-1d); secret rotation runbook (rotate in portal, subscribers see 1-2 versions briefly); rate tuning (run baseline, adjust per-app+token in ratelimit/); deliverer restart (EB handles, in-process loop resumes); TTFE maintenance (update threshold if needed, monitor CI gate failures); audit trail (public client_id in logs + audit table).
- **Rollout:** Migrations 045/046 already applied; seed for system app on next deploy; parallel public surface (no internal change); shadow deploy recommended per AGENTS before master; verify with browser (not just curl) post-deploy.
- **Monitoring:** request_id correlation in public errors/logs; DLQ depth; webhook delivery latency/ success rate; public rate limit 429 rate; OAuth token issuance/expiry.

---

## Sources & References

- **Origin documents:** docs/plugforge/presearch.md (primary requirements + adversarial + locked decisions + risks), docs/plugforge/ce-implementation-plan.md (prior 11 IUs with traceability + phases FND/CPS/WEB/SDK/PRT/HRD), docs/architecture.md (canonical north star: composition root, SOLID, contracts, webhook pipeline, SDK surface, failure modes), docs/plugforge/architecture.html (visual contracts).
- **Ship philosophy & rules:** AGENTS.md, .claude/CLAUDE.md, Agents.md (preflight, e2e-test-runner mandate + fixtures rules, /ship-openapi-endpoints + /ship-*-reviewer, migrations, no TODO, tests, strict, etc.), docs/claude-reference/ (patterns.md, anti-patterns.md, commands.md, architecture.md, INDEX.md).
- **Related code (with lines from research):** api/src/platform/index.ts:70 (createPublicPlatform), routes/v1.ts:10 (U-CPS-03 comment + stubs), oauth/service.ts:149 (clientCredentials), middleware/oauthBearerAuth.ts:42 (TODO port), ports/documents.ts:14 (stub comment), webhooks/deliverer.ts:7 (exact backoff comment), events/inMemoryBus.ts:5 (publish rule), app.ts:162 (early mount), shared/src/types/public.ts:4 (PublicApiError), migrations/045/046 (tables), sdk/src/client.ts:17 (deviceLogin stub), integrations/cli/src/index.ts:5 (@ts-nocheck), e2e/fixtures/isolated-env.ts (no public yet), api/src/test/setup.ts:19 (TRUNCATE update).
- **Institutional:** docs/solutions/ (auth duplication, webhook idempotency, migration safety, error shapes, TTFE CI, philosophy enforcement).
- **External:** OAuth RFCs 6749/7636/6750/7009, Stripe webhook signing, OpenAPI 3.1, NIST 800-63B-4, zod-to-openapi patterns.

---

## Phased Delivery

### Phase 1: Core Surface Finish (U1 + U2)
- Real public CRUD + OpenAPI registration + ports realization.
- Delivers usable /api/v1 (documents/issues/sprints) with publish.

### Phase 2: DX + Validation (U3 + U4)
- SDK complete + fitness; CLI + permanent TTFE gate + fixtures.
- Primary regression signal online.

### Phase 3: Dogfood + Seeding (U5 + U6)
- Minimal portal + system app seed + Agent prep.
- Internal + agent usage enabled.

### Phase 4: Hardening + Gates + LFG Drive (U7 + U8)
- Full regression, reviews, E2E, observability, submission, LFG pipeline to green DONE.
- One-shot finish, no chunking.

---

## Alternative Approaches Considered

- Full write-path refactor for publish (vs thin ports/adapters): rejected (high risk of surfacing latent txn bugs per Pre-Search; incremental thin first safer + YAGNI).
- Queue-backed bus in MVP (vs in-memory + DLQ): rejected (YAGNI + Pre-Search risk on silent failures mitigated by DLQ; LSP defers).
- Session fallback inside oauthBearerAuth (vs strict dedicated + internal privileged for portal): rejected (violates locked separation + Pre-Search 2.1).
- Generated SDK (vs hand-written + fitness): rejected (drift risk on stable surface; quality > maintenance per Pre-Search 2.4).
- Branching global error handler (vs sub-app isolation): rejected (shape proliferation + test/maintainability worse per research).

---

## Success Metrics

- All U1–U8 verification outcomes green (type-check, pnpm test, /e2e-test-runner full public+TTFE <60s, philosophy/security reviews zero critical, preflight clean).
- Public surface usable: Agent + SDK clientCredentials + CLI ship docs create + verified webhook + portal dogfood all succeed.
- LFG pipeline: 9 steps complete in one session, CI green after ≤3 autofix, residual durable, browser test passes, <promise>DONE</promise> declared with no open criticals.
- No philosophy violations, no new content tables, dedicated middleware only, domain publish only, exact webhook contract preserved.
- TTFE gate permanent and passing in CI; public OpenAPI + SDK fitness clean.

---

## Documentation Plan

- docs/plugforge/usage.md (full user guide: flows, scopes, errors, SDK, CLI, TTFE, portal, Agent, ops).
- docs/plugforge/residual.md (post-LFG open items).
- docs/plugforge/submission/ (review package: checklist, this plan, artifacts).
- Agent/MCP docs + examples (Client Credentials + public paths).
- README/contributing updates (public platform section).
- Inline: no TODOs; docstrings for public contracts.

---

## Operational / Rollout Notes

- Deploy: migrations already applied; seed system app on next deploy (env/SSM for secret); shadow before master per AGENTS.
- Monitoring: request_id correlation, DLQ depth, webhook latency/success, public 429 rate, OAuth issuance.
- Rollback: disable mount or revert platform (internal unaffected); DLQ safe for webhooks.
- Graceful: deliverer drain on SIGTERM; EB restart resilience.
- Support: runbooks in docs/plugforge/ (secret rotation, DLQ replay, TTFE maintenance, rate tuning).
- Compliance: full audit (client_id trail), NIST timeouts (existing), security reviews passed.

---

**LFG step 1 (ce-plan) complete — plan ready for LFG step 2 (ce-work).**

**Plan written to:** /Users/sheep/Desktop/Gauntlet/ship/docs/plans/2026-06-01-002-feat-complete-plugforge-public-platform-and-lfg-pipeline-plan.md

---

(End of plan. All paths repo-relative. No absolute paths. No TODO/FIXME. All test scenarios specific with inputs/actions/outcomes. Traceability to origins preserved. Headless mode: inferred routed to Assumptions.)