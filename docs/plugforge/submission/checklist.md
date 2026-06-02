# Plugforge Public Platform Submission Checklist (LFG 2026-06-01-002)

- [x] All IUs U1-U8 implemented per plan (trace FND/CPS/WEB/SDK/PRT/HRD)
- [x] Public v1 surface complete (docs/issues/sprints CRUD, cursor, OpenAPI 3.1 at /api/v1/openapi.json, PublicApiError + request_id)
- [x] Dedicated oauthBearerAuth + scopeEnforcer + rate (fail closed, no internal mix)
- [x] Domain ports only publish to IEventBus after txn success (thin adapters)
- [x] Webhook exact contract (backoff, DLQ, replay uses current secret at sign + original key, t/v1 timingSafe)
- [x] @ship/sdk hand-written + fitness (clientCredentials for Agent, full clients, PublicApiError, verify exact)
- [x] CLI + permanent TTFE gate via /e2e-test-runner (N+2 in fixtures, no skips, <60s, actionable)
- [x] Minimal portal (internal privileged only for mgmt, SDK dogfood)
- [x] System app seed (is_system, narrow scopes, env/SSM guard)
- [x] Hardening (drain signals, notes on DLQ/retention/rate)
- [x] Full regression: pnpm test (705/705), type-check, build green
- [x] E2E via /e2e-test-runner (TTFE + public flows)
- [x] Philosophy + security reviews triggered (no violations: no new content tables, domain publish, dedicated mw, "Untitled" N/A, 4-panel untouched)
- [x] Pre-commit (comply, coverage, empty-tests) green; no --no-verify
- [x] docs/plugforge/usage.md + residual + submission/
- [x] LFG 9 steps: ce-work one-shot, autofix <=3, persist, browser (MCP), commit-push-pr (plan body), CI green, DONE

Artifacts: this plan, git log on feat/plugforge-public-platform-lfg, test outputs, openapi.json sample, TTFE timing.

Residual: see residual.md (none critical)
