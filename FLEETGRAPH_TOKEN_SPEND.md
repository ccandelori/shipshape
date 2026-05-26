# FleetGraph Token Spend

Use this file for two ledgers:

- Runtime graph spend from `fleetgraph_usage`, API response metadata, or provider exports.
- Development-session spend when the agent environment exposes token usage.

Do not invent token counts when the runtime does not expose them.

## Runtime Graph Spend

| Date (UTC) | Run id | Trigger | Detector | Branch path | Model | Input tokens | Output tokens | Estimated cost (USD) | Source | Notes |
|------------|--------|---------|----------|-------------|-------|--------------|---------------|----------------------|--------|-------|
| 2026-05-26 | `55555555-5555-4555-8555-555555555555` | proactive (`poll`) | `at_risk_week` | `prefilter-exit` | `gpt-4o-mini` | 0 | 0 | $0.000000 | `api/src/fleetgraph/demo-scenarios.test.ts` / `fleetgraph_usage` assertion | Deterministic quiet path; no model call. |
| 2026-05-26 | `66666666-6666-4666-8666-666666666666` | proactive (`poll`) | `at_risk_week` | `output` | `gpt-4o-mini` | 850 | 172 | $0.000231 | `api/src/fleetgraph/demo-scenarios.test.ts` / `fleetgraph_usage` assertion | Deterministic finding path; creates pending action candidate. |

## Development Session Spend

| Date (UTC) | Session | Provider | Input tokens | Output tokens | Cached input tokens | Total tokens | Estimated cost (USD) | Source | Notes |
|------------|---------|----------|--------------|---------------|---------------------|--------------|----------------------|--------|-------|
| 2026-05-26T00:10:48Z | Documentation: FleetGraph architecture and canonical FLEETGRAPH.md | OpenAI | Unknown | Unknown | Unknown | Unknown | Unknown | Codex session usage not exposed in workspace | Replace with OpenAI dashboard/export numbers when available. |
| 2026-05-26T00:58:24Z | PRD writing and Taskmaster parsing for FleetGraph MVP | OpenAI Codex session plus Taskmaster fallback | Unknown | Unknown | Unknown | Unknown | $0.000000 known for Taskmaster parse; OpenAI session cost unknown | Codex session usage not exposed; Taskmaster parse-prd telemetry reported 405,757 input and 6,408 output tokens on claude-code/sonnet | OpenAI Taskmaster paths could not complete locally: direct OpenAI lacked `OPENAI_API_KEY`; Codex CLI hit a strict JSON schema error. |
| 2026-05-26T15:26:00Z | FleetGraph LangSmith tracing implementation | OpenAI Codex session | Unknown | Unknown | Unknown | Unknown | Unknown | Codex session usage not exposed in workspace | Runtime graph spend is captured above; shared LangSmith links are pending missing credentials. |
