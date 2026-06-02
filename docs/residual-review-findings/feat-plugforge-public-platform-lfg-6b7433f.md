# Residual Review Findings — Plugforge Public Platform LFG

**Source:** LFG step 3 `ce-code-review mode:autofix plan:docs/plans/2026-06-01-002-feat-complete-plugforge-public-platform-and-lfg-pipeline-plan.md` (run artifact `/tmp/compound-engineering/ce-code-review/20260601-200659-90c7d63b/`).

**Branch:** feat/plugforge-public-platform-lfg @ 6b7433f (review-fix persist commit).
**Date:** 2026-06-02
**Plan traceability:** All findings cross-checked against the explicit plan (R1–R9, U1–U8, Pre-Search 1.1–3.5, architecture.md contracts, AGENTS.md rules).

## Residual Review Findings

- **[P0][gated_auto -> downstream-resolver][needs-verification]** `api/src/platform/ports/documents.ts:49` (and issues/sprints ports) — IEventBus publish occurs before COMMIT in document (and likely issue/sprint) port adapters (correctness, 100).  
  Why: Violates plan U2 + architecture.md + Pre-Search 2.2 ("domain services sole publishers", "publish only after successful commit"). Publish inside BEGIN... publish... COMMIT can fire phantom `document.created` webhooks for rows that never committed (txn rollback on constraint/conn drop). Listeners see non-existent docs; audit inconsistent.  
  Suggested fix: Move `bus.publish` strictly after successful COMMIT (outside txn or in post-commit path). Add characterization test asserting no publish on rollback. Apply same pattern to issues.ts / sprints.ts.  
  Evidence + details: see artifact `ce-correctness-reviewer.json` + validator.

- **[P0][gated_auto -> downstream-resolver][needs-verification]** `api/src/platform/webhooks/deliverer.ts:56` — WebhookDeliverer never performs actual HTTP delivery to subscriber target_url (always simulates success) (correctness, 100).  
  Why: Core F2 contract (write → publish → matcher → signed delivery) + U4/U7 TTFE permanent CI gate + Agent webhook receipt completely broken in practice. No fetch/POST, no Idempotency-Key/Ship-Signature headers sent, no real `webhook_deliveries` rows with latency/status. TTFE always "passes" on stub.  
  Suggested fix: Implement real `attemptDelivery`: undici/fetch with timeout, exact headers (Idempotency-Key + t/v1 signature), classify 4xx (permanent DLQ) vs 5xx/timeout (retry per BACKOFF), INSERT to deliveries table. Remove success stub. Update e2e/public-ttfe + replay paths.  
  Evidence + details: see artifact `ce-correctness-reviewer.json` + validator + `ce-reliability-reviewer.json`.

- **[P1][gated_auto -> downstream-resolver][needs-verification]** `api/src/platform/webhooks/deliverer.ts:28` — WebhookDeliverer stop() does not drain or cancel in-flight/pending deliveries; setTimeout timers can fire post-stop (reliability, 75).  
  Why: Violates U7 hardening + plan ("deliverer graceful shutdown + drain"). On SIGTERM (EB deploy/scale), pending retries abandoned; at-least-once becomes best-effort, DLQ may be skipped. Per Pre-Search risk.  
  Suggested fix: Track active timers (Map<id, Timeout>), clear on stop(), expose drain() promise, move mid-attempt pending to DLQ with 'drained' status. Test signal + post-stop pending count.

- **[P1][manual -> downstream-resolver]** `api/src/platform/ports/documents.ts:13` (and shared/public types, contracts) — Use of generic any/unknown in public contracts, ports, and shared public types (project-standards, 75).  
  Why: Direct violation of CLAUDE.md / AGENTS.md / code style ("strict typing everywhere", "Avoid generic types like Any/unknown"). Public surface (SDK, Agent) leaks loose Record<string, unknown> / z.any(). Reduces contract clarity for consumers.  
  Suggested fix: Replace with specific unions or z.record(z.string()|...) where possible; define TipTapContent alias in shared if needed (YAGNI minimal). Update ports + casts. Enforce in fitness.

- **[P1][manual -> downstream-resolver][needs-verification]** `e2e/public-ttfe.spec.ts:68` — TTFE E2E does not actually exercise real webhook delivery/verify (stub always succeeds) (testing, 75).  
  Why: Permanent CI gate (plan U4/U8) is green on false premise. When real deliverer is implemented, timing regressions can slip because listener is never hit. Violates AGENTS E2E rules (actionable asserts, full contract, N+2 fixtures with expect, no skips, /e2e-test-runner only).  
  Suggested fix: After real deliverer lands, the existing expect(received) + verify + elapsed + body + Idempotency-Key assert already good. Ensure full run via /e2e-test-runner skill. Fixture already updated N+2 style.

- **[P1][manual -> downstream-resolver]** `api/src/platform/routes/documents.ts:92` (and issues/sprints + index error handler) — Public 500 error responses include stack traces and error details in body (security, 100).  
  Why: Information disclosure to public callers (Agent, CLI, third-party). Reveals paths, structure, DB details. Contradicts PublicApiError isolation intent (no stack leaks) and least-privilege for new public surface.  
  Suggested fix: Public catch returns only `{ code: 'INTERNAL_ERROR', message: 'Internal server error', request_id }` (no details/stack). Full error + request_id + client_id logged server-side (structured). Apply uniformly; match global handler.

(Additional lower-severity manual/advisory on pervasive `(req as any)` casts, OpenAPI z.any() looseness for public spec/fitness parity, console.* instead of structured logs, and pre-existing test stub token bypass in oauth/service.ts now on public auth path — see full artifact for #7+ and suggested fixes.)

**Pre-existing (do not count toward this LFG verdict):** Test-only stub token prefix bypass in oauth service (now reachable via public paths).

**Full details, why_it_matters, evidence arrays, and per-reviewer JSON:** `/tmp/compound-engineering/ce-code-review/20260601-200659-90c7d63b/` (including validators/ for Stage 5b confirmations). Plan requirements verification (Stage 6) flagged several R/U items as partially unaddressed (real deliverer + deliveries writes, post-commit publish, full e2e-runner execution in session, portal UI completeness, strict typing in public surface) — these map directly to the P0/P1 residuals above.

**Durable recording note:** No open PR existed at time of this recording (fresh push of feat/plugforge-public-platform-lfg after review-fix persist). This file + the plan + the review artifact provide the permanent record. When a PR is later opened (or via ce-commit-push-pr), append or replace the equivalent section in the PR body.

All findings respect protected artifacts (no docs/plans/* or docs/solutions/ recommended for deletion). Ship philosophy + Pre-Search + architecture contracts were enforced throughout the review.

---

**Next LFG steps (parent orchestrator):** After this durable recording, proceed to ce-test-browser (step 6), ce-commit-push-pr (step 7; use plan as body + Post-Deploy monitoring section), CI autofix ≤3 (step 8; any fixes land under U7/U8 + re-review), then <promise>DONE</promise> (step 9) once green, residuals durable, TTFE gate passing, submission package ready, no open criticals.

(Generated autonomously in LFG non-interactive mode per references/tracker-defer.md + ce-code-review skill.)