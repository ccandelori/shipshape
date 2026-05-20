# Pre-Search Summary — Ship

**Date:** 2026-05-19
**Repository:** [US-Department-of-the-Treasury/ship](https://github.com/US-Department-of-the-Treasury/ship)
**Mode:** Retrospective. Ship is in production. This document evaluates existing architectural decisions through the `/presearch` lens rather than driving a greenfield design. Useful as an architectural reflection and as a baseline for downstream AI-feature work that's still being designed.

---

## Phase 1: Constraints

### 1. Domain Selection

- **Domain:** Custom — project management, sprint planning, and accountability tracking. *Not* one of the standard regulated domains (healthcare/insurance/finance/legal) but **delivered into a regulated environment** (US Treasury / federal). This drives Section 508 / WCAG 2.1 AA accessibility, NIST SP 800-63B-4 AAL2 session policy (15-min inactivity + 12-hour absolute), PIV/CAC authentication, and audit logging requirements.
- **Use cases** (active in code today):
  1. **Document management** — wikis, issues, projects, sprints, persons, weekly plans, weekly retros, standups, weekly reviews (10 doc types unified under `documents`).
  2. **Real-time collaborative editing** — TipTap + Yjs CRDT over WebSocket; per-room state persisted as both binary CRDT and JSON snapshot.
  3. **Sprint accountability workflow** — weekly plans/retros/standups, performance ratings on OPM 5-level scale, manager approval state machine.
  4. **AI integration** — `/api/claude.ts`, `/api/ai.ts`, MCP server at `api/src/mcp/server.ts`, Bedrock client. Used for Claude `/work` session tracking (`sprint_iterations` / `issue_iterations` tables) and ad-hoc AI features.
- **Verification requirements:** Section 508 + WCAG 2.1 AA accessibility claimed; NIST AAL2 session policy enforced in code; comprehensive audit log via `audit_logs` table + per-document `document_history` table with `automated_by` flag distinguishing system from user edits.
- **Data sources:** PostgreSQL (Aurora Serverless v2 in prod), AWS S3 (file uploads), AWS Bedrock (AI inference), Anthropic API (Claude), FPKI/CAIA (federal SSO).

**Replacement target:** Anthropic-style document workspace for federal teams. The Ship-philosophy doc and Notion-features-research doc indicate the inspiration is Notion's unified document model.

### 2. Scale & Performance

- **Expected query volume:** Federal team scale per `application-architecture.md` — 20–200 users per workspace. Total workspace count and traffic profile **open question**.
- **Acceptable latency:**
  - REST P95: **not formally specified.** Audit category sets 20% P95 improvement on ≥2 endpoints as the target.
  - Real-time editor: implicit <100ms responsiveness for typing (the local Yjs path is instant; the network is just for fan-out).
  - Statement timeout on Postgres pool is **30 seconds** (`api/src/db/client.ts:25`).
- **Concurrent users:** Per-workspace low; total system **open question**.
- **Cost constraints:** Federal-budget context, not LLM-cost-per-query optimized. No central LLM cost tracking visible.

**Reality check:** The unified document model + raw SQL stack is sized for the documented user count. At 10× users the JSONB-without-expression-index path (`properties->>'state'`, `properties->>'assignee_id'`, etc.) is the most likely first failure — see "Identified Risks."

### 3. Reliability Requirements

- **Cost of wrong answer:**
  - User content corruption (stale `content` snapshot, lost edits): **high** — accountability documentation has audit weight.
  - Stale property reference (e.g., dangling `assignee_id` after person archive): **medium** — silent degradation.
  - AI-generated content being wrong: **low to medium** — AI features are advisory, not authoritative.
- **Verification non-negotiable:**
  - `audit_logs` table for all CRUD operations on documents and workspace state.
  - `document_history` for field-level change provenance.
  - 30-day soft delete (`deleted_at`) — undelete supported by data retention.
  - Document snapshots (`document_snapshots`) for pre-conversion lineage.
- **Human-in-the-loop:** Native — every document edit is a human edit by default. AI features (`automated_by` flag on history) are tagged but don't bypass human authorship.
- **Audit/compliance:** Audit log retention not formally bounded in code; CloudWatch logs retain 30 days; VPC flow logs 30 days. Aurora has slow-query logging >1s. **Federal data retention requirements: open question** for the user.

### 4. Team & Skill Constraints

- **Inferred team profile** (from code, commits, and docs):
  - Strong TypeScript, comfortable with raw SQL (no ORM choice signals confidence with SQL).
  - React + Vite + TipTap (rich-text) + TanStack Query — modern frontend.
  - AWS infrastructure (EB, S3, CloudFront, Aurora, SSM, Secrets Manager, Bedrock).
  - Federal compliance literacy (PIV/CAC, FPKI, NIST AAL2, Section 508).
- **Agent-framework familiarity:** Direct SDK use (`@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`) suggests team prefers explicit code over framework magic. **No LangChain/LangGraph/CrewAI** in dependencies — a deliberate choice consistent with the "boring technology" philosophy.
- **Eval/testing comfort:** 866 E2E specs + 28 API unit tests indicates testing discipline. **No documented evaluation methodology for AI outputs** — gap.
- **Maintenance ownership:** Open question. The Treasury repo is public; specific maintainer roster not visible from the codebase.

### Phase 1 recap

- ✅ Custom domain in a regulated environment; accessibility + NIST + audit requirements drive much of the stack.
- ✅ Federal team scale (20–200 per workspace); LLM cost not yet a constraint.
- ✅ Document integrity > AI correctness in the priority order.
- ⚠️ Production metrics (P95, QPS, user count) not measured or documented.
- ⚠️ AI-output evaluation methodology absent.

---

## Phase 2: Architecture

### 5. Agent Framework Selection

- **Choice:** None — direct SDK usage. `@anthropic-ai/sdk` for Claude, `@modelcontextprotocol/sdk` for MCP server, `@aws-sdk/client-bedrock-runtime` for Bedrock-hosted inference. No LangChain, LangGraph, CrewAI, or any agent-orchestration framework.
- **Architecture:** Single-process Express app handles REST, WebSocket, and the MCP server (`api/src/mcp/server.ts`). AI calls are point-of-use in specific route handlers (`api/src/routes/claude.ts`, `ai.ts`) rather than centralized through an "agent" abstraction.
- **State management:** Stateless per request for the AI features. Session memory is the same session cookie that gates REST and WebSocket. Long-running tasks tracked in `sprint_iterations` / `issue_iterations` tables.
- **Tool integration:** MCP tools auto-generated from the OpenAPI spec at `/api/openapi.json` (per CLAUDE.md: "Result: Swagger + MCP tools auto-generated"). This is the lone agent-platform integration.

**Rationale (inferred):** Consistent with the "boring technology" philosophy in `ship-philosophy.md`. Direct SDK use is auditable, debuggable, and doesn't introduce a moving framework version. For Ship's scope this is correct.

### 6. LLM Selection

- **Models:** Claude (Anthropic SDK), AWS Bedrock (`@aws-sdk/client-bedrock-runtime` — likely Claude-on-Bedrock for VPC-private inference).
- **Function calling / tool use:** Supported via MCP, which is conceptually the same as the Anthropic Tools API.
- **Context window needs:** Not specified. Average input size **open question**.
- **Cost per query:** Not centrally tracked. **Open question** whether per-feature cost monitoring exists.
- **Open question for the team:** Is there a model-tier policy (e.g., Haiku for cheap classification, Sonnet for reasoning, Opus only when needed)? If not, this is the highest-leverage Cost-Optimization lever once LLM usage matters.

### 7. Tool Design

- **Tools (via MCP, auto-generated from OpenAPI):** Every API endpoint becomes a tool. From `api/src/routes/`: documents CRUD, associations, comments, search, dashboard, weeks, sprints, issues, projects, programs, files, accountability, etc. **The tool count is high** — possibly >50 tools. This violates the `/presearch` "more than 7 tools → struggle" heuristic.
- **External API dependencies:**
  - PostgreSQL (Aurora) — own database, no external SLA.
  - S3 — for file uploads.
  - Anthropic API + Bedrock — external SLA.
  - FPKI/CAIA — federal SSO; external SLA.
- **Mock vs real:** E2E tests use `testcontainers` for per-worker isolated Postgres. **No mock layer for LLM calls visible** — tests that touch AI features hit the real API or aren't exercised in E2E.
- **Error handling per tool:**
  - REST tool failures → caught by Express, returned as JSON errors. Two response shapes coexist (old `{ error: string }`, new `{ success, error: { code, message } }`).
  - AI/LLM errors handling: **open question** at the level of the tool boundary.

**Risk surfaced:** Auto-generating MCP tools from OpenAPI is a one-line decision that produces an unbounded tool surface. The agent has more choices than is healthy. If an AI feature drives usage, expect tool-selection confusion. Routing or grouping (e.g., by document type, by workflow) is a likely necessary follow-up.

### 8. Observability Strategy

- **AI-call observability:** **No dedicated agent-observability tool** (no LangSmith, Braintrust, Helicone in deps). LLM calls log to standard Node `console.log` and end up in CloudWatch alongside everything else.
- **Application observability:**
  - CloudWatch Logs (Aurora slow queries >1s, VPC flow logs, 30-day retention).
  - JSONL progress reporter writes `test-results/summary.json` for E2E test runs.
  - No APM tool (Datadog, New Relic, Honeycomb) visible.
- **Real-time monitoring / alerting:** EB environment health is the primary signal. No application-level alerts.
- **Cost tracking:** AWS Cost Explorer level only. No per-feature / per-user / per-tenant AI cost attribution.

**Gap:** If AI usage grows, retrofit pain on observability is steep. Capturing LLM call inputs/outputs (size, latency, model, cost) at the SDK seam now is cheap; doing it later means re-instrumenting every call site.

### 9. Eval Approach

- **AI correctness measurement:** **Not formally established.** No eval dataset, no LLM-as-judge configuration, no human-review pipeline visible in the codebase for AI outputs specifically.
- **Application-correctness measurement:** 866 E2E tests + 28 API unit tests cover user workflows and CRUD invariants. These verify the *system*, not the *AI*.
- **Ground truth sources:** Tests rely on the seed data in `e2e/fixtures/isolated-env.ts` (1 workspace, 2 users, 5 programs, 28+ issues, projects, weekly docs). Seed is realistic but small.
- **Automated vs human eval:** All automated; no human-in-the-loop review queue.
- **CI integration:** None — no GitHub Actions workflows exist. E2E and unit tests run manually or via the `/e2e-test-runner` skill. **No deploy gate.**

**Risk:** A change that subtly degrades AI quality (e.g., a prompt edit, a model swap) has no automated signal. The `/presearch` framework explicitly calls this out: "Without evals, you cannot tell if a change made things better or worse."

### 10. Verification Design

- **What is verified today:**
  - User-authored document edits → audited via `document_history` (every field change logged with actor and timestamp).
  - Permission boundaries → `visibility` column + workspace membership checks at the route layer + `VISIBILITY_FILTER_SQL` macro spliced into list queries.
  - Database integrity → soft-delete + archive flags propagate through indexes; circular-parent trigger (migration 025) enforces tree acyclicity.
- **What is *not* verified for AI outputs:**
  - No citation verification.
  - No grounding check (LLM claims about documents are not cross-checked against the documents).
  - No confidence threshold / "I'm not sure" affordance documented.
  - No escalation path from AI to human review.
- **Open question for the team:** What's the verification expectation for AI features? Currently they appear to be "best effort" with user judgment as the final arbiter — which is a defensible position for advisory features but limits how authoritative AI output can become.

### Phase 2 recap

- ✅ Direct SDK use (no framework) — debuggable, auditable, consistent with the boring-technology philosophy.
- ⚠️ MCP auto-generates tools from OpenAPI → tool surface is unbounded; selection confusion likely as AI usage grows.
- ⚠️ No LLM observability layer; no per-feature AI cost tracking.
- ⚠️ No eval dataset, no eval pipeline, no CI gate.
- ⚠️ No verification mechanism for AI claims.

---

## Phase 3: Operations

### 11. Failure Mode Analysis

- **Tool failures:** Two response shapes coexist (legacy `{ error: string }` and new `{ success, error: { code, message } }`). Frontend has to handle both. **No global Express error handler** — default HTML 500 is returned for uncaught errors, which the frontend can't parse cleanly.
- **WebSocket failures:** Session timeout is checked at upgrade only, *not* mid-connection (`api/src/collaboration/index.ts:347–393`). A user whose session expires mid-edit keeps editing until the socket closes. **Audit-priority finding.**
- **Rate-limiting:** Three layers in the collab path — 30 connections/IP/60s, 50 messages/connection/s, 10MB max message. REST has a global 100/min (prod) and 5-attempt/15-min login limiter.
- **Graceful degradation:**
  - Yjs offline cache (`y-indexeddb`) keeps the editor responsive when the WS disconnects.
  - No fallback model for LLM outages — if Anthropic or Bedrock is down, the AI feature errors.
- **Max-step / loop limits:** N/A — Ship is not running open-ended agent loops. Each AI call is a discrete request.

### 12. Security Considerations

- **Authentication:** Three providers converging on the same session cookie:
  1. **PIV/CAC** via mTLS at the ALB (federal users).
  2. **Password** fallback (testing, external users).
  3. **API tokens** (`ship_<64 hex>`, SHA-256 hashed at rest, shown once).
  See [`deep-dives/auth-providers.md`](./deep-dives/auth-providers.md).
- **CSRF:** `csrf-sync` mounted per route (skips Bearer-token requests). Token lazily fetched at `/api/csrf-token`.
- **Security headers:** `helmet` (HSTS, CSP, CORB) + CloudFront-Forwarded-Proto override for HTTPS detection behind CloudFront.
- **Prompt injection risk:** Documents are user-authored content. If an AI feature ingests document content and acts on it (e.g., "summarize this issue"), the document body is an untrusted-input channel. **No documented isolation between document content and AI prompts.**
- **Data leakage:**
  - Bedrock training opt-out: **open question.**
  - Anthropic API training opt-out: **open question** — confirm Zero Data Retention / no training is set on the API key.
  - PII in logs: standard `console.log` may capture properties / content; audit-log retention policy is informal.
- **Secrets management:** AWS Secrets Manager (OAuth credentials) + AWS SSM Parameter Store (DATABASE_URL, SESSION_SECRET, etc.). EB instances pull at startup via IAM policy. No `.env` files in prod.
- **WAF:** WAFv2 on CloudFront only; **no WAF on the EB origin directly**. An attacker who finds the EB CNAME bypasses WAF.

### 13. Testing Strategy

- **Unit tests:** 28 API `.test.ts` files (Vitest); `fileParallelism: false` so files run sequentially, tests within a file in parallel; setup `TRUNCATE`s tables between tests.
- **E2E tests:** 866 `test()` invocations across 71 spec files (Playwright, Chromium-only). Per-worker isolation: testcontainers Postgres + built API + `vite preview` per worker. Memory-aware worker calculation prevents the 90GB explosion documented in `vite-dev-memory-explosion-parallel-tests.md`.
- **Adversarial testing:** `security.spec.ts`, `data-integrity.spec.ts`, `error-handling.spec.ts` exist; **no documented prompt-injection / jailbreak test suite for AI features.**
- **Regression:** Pre-commit hook runs `check-empty-tests.sh` to catch silent test stubs. No CI workflow runs tests automatically on push/PR.
- **Open-ended gap:** No mocked LLM in unit tests — AI-feature tests are either real-API (slow, flaky) or absent.

### 14. Open Source Planning

- **Already open source.** Repo: `US-Department-of-the-Treasury/ship`. `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `ATTESTATION.md`, `code.json` all present at root. Compliance enforced via `comply opensource` in pre-commit hooks (per CLAUDE.md).
- **License:** Read `LICENSE` directly to confirm (commonly `Apache-2.0` or `MIT` for federal repos; can be verified before any redistribution decisions).
- **Documentation:** Comprehensive `docs/` tree (32 markdown files), root README, plus the `orientation/` directory we've been producing.
- **Community engagement:** Open question — issue triage, release cadence, contribution review SLA.

### 15. Deployment & Operations

- **Hosting:** Elastic Beanstalk (API, single-stage Docker container, `t3.small` × min/max 4), S3 + CloudFront (web), Aurora Postgres Serverless v2.
- **CI/CD:** **None.** Manual `./scripts/deploy.sh <dev|shadow|prod>`. The deploy script does Terraform-config sync from SSM, full rebuild, **local Docker build test before push**, ZIP upload, EB version creation.
- **Monitoring:** EB health checks at `/health`; CloudWatch logs; VPC flow logs. **No PagerDuty / Opsgenie / paging.** Single-threshold alerting only.
- **Rollback:** Re-deploy a previous EB version label. No automated rollback.
- **Migration timing:** Migrations run at container startup (`Dockerfile` CMD: `node dist/db/migrate.js && node dist/index.js`). A migration failure crashes the container and EB marks the environment unhealthy. **No graceful "still migrating" state.**
- **Prompt versioning (for AI features):** Open question. If prompts live in code, they're versioned with deploys; if they live in DB rows or external config, **silent regressions are possible.**

### 16. Iteration Planning

- **User feedback collection:** `feedback` table exists (per migrations 008, 014b context); public `/api/feedback` endpoint exists. **Whether it feeds into eval data is open question.**
- **Eval-driven improvement cycle:** Not visible — no eval dataset, no pipeline from production failures to eval set.
- **Feature prioritization:** Open question. The `plans/` and `research/` directories suggest deliberate planning but the workflow isn't codified.
- **Long-term maintenance:** Open question.

### Phase 3 recap

- ✅ Strong security posture for the federal context: mTLS, NIST AAL2 sessions, audit logs, Secrets Manager.
- ✅ Test infrastructure is serious — 866 E2E specs with proper per-worker isolation.
- ⚠️ No CI gate on tests or evals before prod.
- ⚠️ WebSocket session contract not enforced mid-connection.
- ⚠️ AI observability, evaluation, and verification are all unmeasured.
- ⚠️ No LLM call mocking in tests; AI-feature tests are real-API or absent.

---

## Open Questions

These are decisions that can't be answered from the codebase alone — they need an answer from the team.

- [ ] What is the actual production P95 latency for the top 5 endpoints? (Audit baseline.)
- [ ] What is the workspace count and total user count across the production deployment?
- [ ] Is there a documented model-tier policy for AI features (Haiku vs Sonnet vs Opus by use case)?
- [ ] Is Anthropic API Zero Data Retention / training-opt-out confirmed on the production API key?
- [ ] Is Bedrock training opt-out configured?
- [ ] How are AI features evaluated for correctness today (if at all)?
- [ ] Are prompts versioned with deploys, or stored in DB / external config?
- [ ] Who owns Ship maintenance? Team size and on-call rotation?
- [ ] What is the audit-log retention requirement under Treasury / federal data policy?
- [ ] Does the `feedback` table feed into any structured review process, or is it a write-only signal today?

---

## Identified Risks

Ranked by likelihood × impact, given Ship's current production state.

| # | Risk | Likelihood | Impact | Phase |
|---|------|---|---|---|
| 1 | **No CI gate.** Manual deploys with no automated test/eval gate; any commit can reach prod after one developer's `./scripts/deploy.sh prod`. | High | High | 15 |
| 2 | **WebSocket session timeout not enforced mid-connection** (`api/src/collaboration/index.ts:347–393`). Revoked sessions stay alive in long-running tabs. | High | High | 11 |
| 3 | **JSONB property filters without expression indexes.** `properties->>'state'`, `properties->>'assignee_id'`, etc. — GIN handles these poorly. Sequential-scan risk at scale. | Medium | High | 2 |
| 4 | **No global Express error handler.** Default 500 HTML breaks the frontend's JSON parser. | High | Medium | 11 |
| 5 | **No LLM observability or cost tracking.** Once an AI feature drives usage, cost or quality regressions go unnoticed. | Medium | High | 8 |
| 6 | **No eval pipeline for AI outputs.** Prompt / model changes have no automated quality signal. | Medium | High | 9 |
| 7 | **`Record<string, unknown>` cascade.** 1,474 `as` assertions trace back to two columns in `shared/src/types/document.ts`. | Certain | Medium | 5 |
| 8 | **MCP tool surface unbounded** (>50 tools auto-generated from OpenAPI). Tool-selection ambiguity for any agent that uses the surface. | Medium | Medium | 7 |
| 9 | **No WAF on EB origin.** An attacker who finds the EB CNAME bypasses CloudFront WAF. | Low | High | 12 |
| 10 | **Single NAT Gateway** in the VPC. AZ failure breaks Docker image pulls for deploys. | Low | Medium | 15 |
| 11 | **`yjsToJson()` has no try/catch around `JSON.stringify`.** `content` column can be silently corrupted to the literal string `"undefined"`. Yjs binary survives, so reload "fixes" it via re-conversion. | Low | Medium | 11 |
| 12 | **Prompt injection** via document content if AI features ingest body text without isolation. Not exercised by an adversarial test today. | Low | Medium | 12 |

---

## Next Steps

In priority order. Each item maps to a specific finding above.

1. **Capture the type-check baseline** before any audit work — `pnpm type-check 2>&1 | tee orientation/baseline-tsc.txt`. (Risk #7.)
2. **Add a minimal GitHub Actions workflow** that runs `pnpm test` and `pnpm type-check` on every PR. (Risk #1.)
3. **Implement WebSocket mid-connection auth re-check** — either periodic re-validation on each frame, or a server-initiated heartbeat with session check. (Risk #2.)
4. **Add a global Express error handler** that returns the new `{ success: false, error }` JSON shape for all uncaught errors. (Risk #4.)
5. **Add expression indexes** on the four hot JSONB property paths used in dashboard / list queries (`properties->>'state'`, `(properties->>'assignee_id')::uuid`, `(properties->>'sprint_number')::int`, `(properties->>'owner_id')::uuid`). (Risk #3.)
6. **Establish AI observability** — wrap the Anthropic and Bedrock SDK calls in a thin layer that logs `{ model, input_tokens, output_tokens, latency_ms, cost_estimate }` to a single log line per call. (Risk #5.)
7. **Define the AI eval dataset** — 20–50 hand-curated input/expected-output pairs for the top AI use case; check in as `evals/` directory; add `pnpm eval` script. (Risk #6.)
8. **Verify Anthropic Zero Data Retention / training opt-out** on the production API key. (Open question; Risk #12 indirect.)
9. **Introduce a domain-mapper layer** between pg rows and typed `*Document` variants to collapse the 1,474 `as` assertions at their source. (Risk #7.)
10. **Add adversarial test fixtures** for prompt injection in document body content. (Risk #12.)

---

## Notes on this document

- This is a **retrospective** application of `/presearch`. The original skill is designed for greenfield AI agent projects; Ship is not greenfield and not primarily an agent. Some sections (Open Source Planning, Iteration Planning) compress accordingly.
- For the deeper architectural mental model behind these decisions, see the companion files in this directory: `README.md`, `deep-dives/unified-document-model-explained.md`, `deep-dives/real-time-collaboration.md`, `deep-dives/auth-providers.md`, `deep-dives/request-flow-and-auth.md`, `deep-dives/typescript-patterns.md`, `deep-dives/unified-document-model.md`.
- This document does not replace the audit report. It complements it by surfacing decisions and risks that the 7-category audit categories don't explicitly target (e.g., AI observability, prompt injection, model-tier policy).
