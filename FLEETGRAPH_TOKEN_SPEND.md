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
| 2026-05-28 | `1ad1925a-5d18-45e9-abd3-baa46a5a2ccd` | proactive (`mutation`) | `at_risk_week` | `prefilter-exit` | none | 0 | 0 | $0.000000 | Public Langfuse trace in `FLEETGRAPH.md` | Deployed quiet path; pre-filter exited before model reasoning. |
| 2026-05-28 | `5e814f55-35f6-4fdf-80d3-1533dc0c386e` | proactive (`mutation`) | `at_risk_week` | `output` | `gpt-4o-mini` | 1135 | 157 | $0.000264 | Public Langfuse trace in `FLEETGRAPH.md` | Deployed finding path; persisted finding `8cf63756-2cc0-428c-9488-7c3306130760`. |
| 2026-05-28 | `b2624ad3010625d9f91ce4945404e758` | on-demand chat | n/a | `ondemand_chat` | captured in trace metadata | 2043 | 120 | see Langfuse trace | Public Langfuse trace in `FLEETGRAPH.md` | Deployed Week chat path through shared `fleetgraph.runtime`. |

## Development Session Spend Availability

The repository contains measured FleetGraph runtime spend, but the Codex desktop sessions used to build FleetGraph did not expose per-session billing or token exports into the workspace. I am not inventing those numbers. The only development-session token telemetry available in local artifacts is the Taskmaster PRD parse fallback below.

| Date (UTC) | Session | Provider / tool path | Input tokens | Output tokens | Estimated cost (USD) | Source | Notes |
|------------|---------|----------------------|--------------|---------------|----------------------|--------|-------|
| 2026-05-26T00:58:24Z | Taskmaster PRD parsing fallback | `task-master parse-prd` via claude-code/sonnet telemetry | 405,757 | 6,408 | $0.000000 known for local Taskmaster parse wrapper | Taskmaster parse telemetry emitted during setup | This is tool telemetry, not Codex billing. Codex session spend was not exposed in repo-accessible logs or API response metadata. |
