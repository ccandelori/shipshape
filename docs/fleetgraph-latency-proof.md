# FleetGraph Latency Proof

Date: 2026-05-26

This proof verifies the Week 5 requirement that FleetGraph surfaces a proactive finding within five minutes of a risk-producing Ship mutation.

## Scope

The proof exercises:

- Real Ship Postgres data in the local Docker database.
- The existing seed script for workspace, users, programs, projects, weeks, issues, plans, retros, and FleetGraph starter data.
- `createProactiveTriggerController` with the production mutation debounce of `45000ms`.
- Postgres advisory lock acquisition and release.
- Real Week context loading from `documents` and `document_associations`.
- Real material-change guard and suppression check.
- Real at-risk Week LangGraph path through context, guard, pre-filter, reason, policy, output, and usage persistence.
- Real `fleetgraph_findings`, `fleetgraph_action_candidates`, and `fleetgraph_usage` writes.

The proof intentionally replaces only the external model and Langfuse network calls with a deterministic local reasoner and passthrough trace runner. That keeps the latency measurement runnable without `OPENAI_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL`. It does not measure live model provider latency.

## Commands

The database was not seeded when the proof first ran, so the existing seed script was run first:

```bash
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/tsx src/db/seed.ts
```

Then the latency proof ran:

```bash
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/tsx src/fleetgraph/scripts/verify-latency.ts
```

## Result

```json
{
  "runId": "b91e6d81-46c1-4b56-a044-03acd2cbe6dc",
  "workspaceId": "7b305c82-23a3-4580-9f01-a884b43e6033",
  "weekId": "09a51cd5-fd2e-41b9-bd2d-5fedb0714a04",
  "issueId": "f1da34c2-8878-40c2-8046-27011b3f3bae",
  "findingId": "d40f33f2-3433-4aa4-ba50-aa12a593a449",
  "lifecycleState": "pending_review",
  "severity": "high",
  "mutationDebounceMs": 45000,
  "observedLatencyMs": 45113,
  "targetLatencyMs": 300000,
  "latencyTargetMet": true,
  "mutationCommittedAt": "2026-05-26T16:43:40.410Z",
  "findingCreatedAt": "2026-05-26T16:44:25.449Z",
  "materialChangeKey": "v1:9bd9ec461a1df760815a5d50989770379557b85de2d629318081428212378790"
}
```

The finding appeared in `45.113s`, comfortably under the `300s` target.

## Implementation Notes

The proof also exposed and fixed a wiring issue: the default proactive trigger runner was still a placeholder. The production trigger now invokes FleetGraph through `createProductionAtRiskWeekScopeRunner`, which enters the shared `fleetgraph.runtime` graph and delegates to the at-risk Week detector branch.

The graph runner now receives the same checked-out Postgres client used for advisory locking. That matters because the output node performs transactional writes, and those writes must not go through `pool.query` while a transaction is expected.
