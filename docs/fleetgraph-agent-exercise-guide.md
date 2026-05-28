# FleetGraph Agent Exercise Guide

Last updated: 2026-05-28

This guide walks through FleetGraph's local exercise paths in the Ship app. It separates product acceptance from agent acceptance so the evidence is honest: seeded rows can prove the inbox, review, resume, chat shell, and telemetry plumbing, but they do not prove that the proactive LangGraph agent noticed a real Ship event.

Run the product acceptance sections first to confirm the user-facing workflow. Then run the agent acceptance sections to prove proactive detection, quiet exits, real model reasoning, guard behavior, and trace evidence.

## Scope

Use this when you want to prove FleetGraph against local Ship data.

Product acceptance exercises:

- Seeded FleetGraph programs, projects, issues, weeks, findings, action candidates, and usage rows.
- Inbox rendering for open findings.
- Finding lifecycle actions: dismiss, snooze, reject, approve, and resume.
- Unread tab badges, per-card `New` badges, and read marking when a finding is viewed.
- Authenticated FleetGraph API reads and mutations.
- Realtime invalidation after a FleetGraph decision.
- Embedded graph-routed FleetGraph chat from project, issue, and Week documents.

Agent acceptance exercises:

- A route-level Ship mutation that enqueues the proactive detector.
- A quiet pre-filter path that exits without a model call.
- A finding path that uses the real OpenAI reasoner and records Langfuse traces.
- Deduplication and suppression behavior.
- HITL authorization and transition guards.
- A deterministic `< 5 min` orchestration latency proof.
- Usage and trace evidence checks that distinguish seeded, deterministic, and live runs.

Current UI caveat: the sidebar inbox exposes `Open`, `Needs Review`, and `Approved` lifecycle tabs. Executed, rejected, dismissed, snoozed, and expired states remain API/database verification states rather than primary modal tabs.

Important evidence boundary:

- Seeded findings prove the outcome layer: UI, API lifecycle, action resume, and DB persistence.
- `src/fleetgraph/scripts/verify-latency.ts` proves trigger orchestration timing with a deterministic proof reasoner. It does not prove live model detection quality.
- Live agent proof requires a Ship route mutation, a proactive run from the running API process, non-seed `fleetgraph_usage` rows, and Langfuse traces from the real reasoner.

## Prerequisites

Use the Docker/OrbStack Postgres container, not Postgres.app.

Confirm the database container is running:

```bash
docker ps
```

Expected: `ship-postgres-1` is running and exposes local Postgres on port `5433`.

Run the API with the Docker database URL:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev pnpm dev
```

Run the web app:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/web
pnpm dev
```

Open the app:

```text
http://localhost:5173
```

For embedded chat and live proactive model runs, the API process also needs:

```bash
OPENAI_API_KEY=...
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_TRACING_ENVIRONMENT=local
LANGFUSE_RELEASE=ship-local
```

If those values are absent, the seeded inbox and deterministic latency proof still work, but embedded chat returns `FleetGraph chat is not configured`.

## Seed The Demo Workspace

From the API package:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/tsx src/db/seed.ts
```

The seed script is idempotent. It creates or updates the `Ship Workspace`, demo users, FleetGraph projects, FleetGraph issues, two FleetGraph findings, one action candidate, and usage rows.

Use this login:

```text
Email: dev@ship.local
Password: admin123
Workspace: Ship Workspace
```

Other seeded users use the same password:

```text
alice.chen@ship.local
bob.martinez@ship.local
carol.williams@ship.local
david.kim@ship.local
emma.johnson@ship.local
frank.garcia@ship.local
grace.lee@ship.local
henry.patel@ship.local
iris.nguyen@ship.local
jack.brown@ship.local
```

Confirm the FleetGraph rows exist:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select lifecycle_state, detector_type, material_change_key from fleetgraph_findings order by created_at desc;"
```

Expected seed findings:

- `seed:fleetgraph:open:inbox-visible:v1`, state `open`, detector `ownership_unclear`.
- `seed:fleetgraph:pending-review:trace-evidence:v1`, state `pending_review`, detector `at_risk_week`, with one `draft_comment` action candidate.

## Reset The Seeded Findings

Prefer the scoped demo health/reset script when you want to run the lifecycle steps repeatedly:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/tsx src/fleetgraph/scripts/demo-health.ts
```

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/tsx src/fleetgraph/scripts/demo-health.ts --reset
```

The reset restores the two seeded FleetGraph findings, clears their read receipts, removes seeded-demo approvals/executions/suppressions, and deletes the exact seeded FleetGraph comment body from the trace issue. It does not wipe the workspace.

The raw SQL equivalents remain below for debugging.

Reset the open inbox finding:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "delete from fleetgraph_suppressions where finding_id in (select id from fleetgraph_findings where material_change_key = 'seed:fleetgraph:open:inbox-visible:v1'); update fleetgraph_findings set lifecycle_state = 'open', expires_at = null where material_change_key = 'seed:fleetgraph:open:inbox-visible:v1';"
```

Reset the pending review action finding:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "delete from fleetgraph_action_executions where finding_id in (select id from fleetgraph_findings where material_change_key = 'seed:fleetgraph:pending-review:trace-evidence:v1'); delete from fleetgraph_approvals where finding_id in (select id from fleetgraph_findings where material_change_key = 'seed:fleetgraph:pending-review:trace-evidence:v1'); delete from fleetgraph_suppressions where finding_id in (select id from fleetgraph_findings where material_change_key = 'seed:fleetgraph:pending-review:trace-evidence:v1'); update fleetgraph_findings set lifecycle_state = 'pending_review', expires_at = null where material_change_key = 'seed:fleetgraph:pending-review:trace-evidence:v1';"
```

## Open The FleetGraph Inbox

1. Sign in as `dev@ship.local`.
2. Confirm you are in `Ship Workspace`.
3. In the left sidebar, click the connected-nodes FleetGraph icon near the bottom, above the gear icon.
4. The `FleetGraph Inbox` modal opens.
5. Click `Refresh`.

Expected:

- The modal shows `FleetGraph - HITL Findings Inbox`.
- The card has severity `Medium`, state `Open`, and detector `Ownership Unclear`.
- The evidence says ownership for daily triage has not been written into the project plan.
- The card shows `Dismiss` and `Snooze`.

Expected caveat:

- `Approve` and `Reject` are only valid for `pending_review` findings under the `Needs Review` tab. On the seeded `open` finding, use `Dismiss` or `Snooze`.

## Exercise Dismiss

1. Reset the open inbox finding if needed.
2. Open the FleetGraph inbox.
3. Click `Dismiss`.
4. Enter a reason, for example `Exercise: ownership finding reviewed`.
5. Click `Confirm`.

Expected:

- The card leaves the open inbox.
- Reopening or refreshing the modal shows no open finding unless another open finding exists.
- The finding state is now `dismissed`.

Verify in the database:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select lifecycle_state from fleetgraph_findings where material_change_key = 'seed:fleetgraph:open:inbox-visible:v1';"
```

## Exercise Snooze

1. Reset the open inbox finding.
2. Open the FleetGraph inbox.
3. Click `Snooze`.
4. Enter a reason, for example `Exercise: revisit after review`.
5. Choose a future `Snooze until` time.
6. Click `Confirm`.

Expected:

- The card leaves the open inbox.
- The finding state is now `snoozed`.
- `expires_at` is populated.

Verify in the database:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select lifecycle_state, expires_at from fleetgraph_findings where material_change_key = 'seed:fleetgraph:open:inbox-visible:v1';"
```

## Exercise Reject

1. Reset the pending review action finding.
2. Open the FleetGraph inbox.
3. Click the `Needs Review` tab.
4. Confirm the pending card is visible and shows a `draft_comment` recommended action.
5. Click `Reject`.
6. Enter `Exercise: action is not the right next step`.
7. Click `Confirm`.

Expected:

- The card leaves the `Needs Review` tab.
- The finding state is now `rejected`.
- A row is written to `fleetgraph_approvals` with decision `rejected` and the supplied reason.

Verify:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select decision, reason from fleetgraph_approvals where finding_id in (select id from fleetgraph_findings where material_change_key = 'seed:fleetgraph:pending-review:trace-evidence:v1') order by created_at desc limit 3;"
```

## Exercise Approve

1. Reset the pending review action finding.
2. Open the FleetGraph inbox.
3. Click the `Needs Review` tab.
4. Confirm the pending card is visible and shows the `draft_comment` recommended action.
5. Click `Approve`.

Expected:

- The card leaves the `Needs Review` tab.
- The finding appears under the `Approved` tab after refresh/invalidation.
- A row is written to `fleetgraph_approvals` with decision `approved`.

Verify:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select lifecycle_state from fleetgraph_findings where material_change_key = 'seed:fleetgraph:pending-review:trace-evidence:v1';"
```

## Exercise Resume

Resume takes an approved action candidate and executes the supported Ship write. The seeded candidate is a `draft_comment`, so resume writes a comment to the target issue and transitions the finding to `executed`.

1. Approve the pending review finding first.
2. Open the FleetGraph inbox.
3. Click the `Approved` tab.
4. Confirm the approved card is visible.
5. Click `Resume`.

Expected:

- The card leaves the `Approved` tab after the action executes.
- The finding state is now `executed`.
- A comment is inserted on the action candidate target document.
- A row is written to `fleetgraph_action_executions`.

Verify the execution row:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select result from fleetgraph_action_executions where finding_id in (select id from fleetgraph_findings where material_change_key = 'seed:fleetgraph:pending-review:trace-evidence:v1') order by created_at desc limit 3;"
```

Verify the comment:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select d.title, c.content from comments c join documents d on d.id = c.document_id where c.content like 'Please add the shared Langfuse trace URLs%' order by c.created_at desc limit 3;"
```

Expected idempotency behavior:

- Repeating resume with the same `idempotency_key` replays the prior result.
- Repeating resume with a new key after execution returns `409` with `FleetGraph action has already been executed`.

## Exercise Realtime Invalidation

1. Reset the open inbox finding.
2. Open the app in two browser windows as `dev@ship.local`.
3. Open the FleetGraph inbox in both windows.
4. In window A, dismiss the open finding.
5. Watch window B.

Expected:

- Window B receives the `fleetgraph:finding_updated` realtime event.
- Its FleetGraph query invalidates and refreshes.
- The dismissed card leaves the open inbox without a full page reload.

If the second window does not visibly update, click `Refresh` to distinguish a WebSocket issue from the underlying mutation path.

## Exercise Embedded Chat

This exercises FleetGraph's on-demand chat surface. Current architecture note: chat now enters the shared compiled `fleetgraph.runtime` LangGraph path. The route still validates scope before opening SSE, but the traced model stream runs inside the on-demand graph branch.

1. Make sure the API process has `OPENAI_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL`.
2. Open a FleetGraph project, issue, or week document. Good seeded targets include:
   - `FleetGraph - Embedded Agent Chat`
   - `Expose scoped FleetGraph chat in editor`
   - The current FleetGraph week under the `FleetGraph MVP` program
3. Near the upper-right of the document canvas, click the **Ask FleetGraph** pill.
4. Ask one of these questions:

```text
What are the biggest delivery risks in this document?
Which issue should I look at next and why?
What evidence do you have for that?
What changed this week?
```

Expected:

- The chat panel opens as `FleetGraph Chat`.
- The request streams a response token by token.
- The answer stays scoped to the current project, issue, or week context.
- The final message completes without replacing the page or closing the editor.

Expected failure paths:

- Missing FleetGraph runtime keys: `FleetGraph chat is not configured`.
- More than 10 chat requests in an hour for the same user: `FleetGraph chat rate limit exceeded`.
- Invalid or inaccessible document scope: `FleetGraph chat document not found`.

Verify a Langfuse chat trace:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
set -a; source .env.local; set +a; export LANGFUSE_HOST="$LANGFUSE_BASE_URL"; npx langfuse-cli api traces list --name fleetgraph.chat.response --limit 5 --order-by timestamp.desc --fields core,metrics
```

Expected:

- At least one recent `fleetgraph.chat.response` trace.
- Non-zero latency and, when OpenAI responded, non-zero cost or token usage.
- `public` may be `false`; create the shared review link from the Langfuse UI if the CLI only lists private traces.

## Use The Authenticated API From The Browser

The normal HITL path above is browser-only through the inbox tabs. Use this DevTools helper only for advanced agent-acceptance steps that need to create standup or iteration mutations through authenticated Ship routes.

After signing in, open browser DevTools on `http://localhost:5173` and paste:

```js
const fleetGraphPost = async (path, body) => {
  const tokenResponse = await fetch('/api/csrf-token', { credentials: 'include' });
  const tokenBody = await tokenResponse.json();
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': tokenBody.token,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? JSON.parse(text) : null,
  };
};
```

## Exercise A Route-Level Mutation Trigger

This is the first agent-layer proof. It uses an authenticated Ship route that calls `enqueueMutationCheck`, waits for the 45 second debounce, and lets the running API process invoke the production proactive runner.

Get the current seeded FleetGraph week ID:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -t -A -c "select scoped_document_id from fleetgraph_findings where material_change_key = 'seed:fleetgraph:pending-review:trace-evidence:v1';"
```

In the browser console, set that value:

```js
const liveSprintId = 'paste-week-id-here';
```

Create a real standup blocker through the Ship API:

```js
await fleetGraphPost(`/api/weeks/${liveSprintId}/standups`, {
  title: 'FleetGraph exercise blocker',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Blocked on shared Langfuse trace URLs for the FleetGraph submission exercise at ${new Date().toISOString()}.`,
          },
        ],
      },
    ],
  },
});
```

Add a route-level iteration blocker as a stronger signal:

```js
await fleetGraphPost(`/api/weeks/${liveSprintId}/iterations`, {
  story_title: 'Capture Langfuse trace URLs for shared review',
  status: 'fail',
  what_attempted: 'Ran the FleetGraph agent exercise against the seeded workspace.',
  blockers_encountered: `Capturing fresh FleetGraph trace evidence at ${new Date().toISOString()}.`,
});
```

Wait 60 to 90 seconds. Expected API log:

```text
fleetgraph.proactive_trigger.scope_processed
triggerSource: mutation
scopedDocId: <liveSprintId>
```

Verify a non-seed proactive usage row:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select run_id, trigger, detector, model_name, input_tokens, output_tokens, estimated_cost_usd, trace_metadata from fleetgraph_usage where run_id not like 'seed-%' order by created_at desc limit 10;"
```

Expected:

- At least one recent row with `trigger = proactive`.
- `trace_metadata` references the scoped week.
- A real finding path has non-zero `input_tokens` and `output_tokens`.

Verify whether the run produced a finding:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select id, lifecycle_state, severity, detector_type, material_change_key, created_at from fleetgraph_findings where detector_type = 'at_risk_week' and material_change_key not like 'seed:%' order by created_at desc limit 10;"
```

Expected for the finding path:

- A non-seed `at_risk_week` finding appears.
- Lifecycle state is usually `pending_review` when the policy proposes a human-approved action.
- Severity reflects the model's judgment over the scoped Week context.

If no finding appears, the route trigger still ran. Use the usage row and Langfuse trace to inspect whether the graph exited at pre-filter or model reasoning returned `not_at_risk`.

## Exercise The Quiet Path

The quiet path proves FleetGraph can stay silent. Use a Week with no blocker standups, no iteration blockers, and no high-priority blocked issues, or run the deterministic branch test below when you need stable evidence.

Automated quiet branch evidence:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/vitest run src/fleetgraph/demo-scenarios.test.ts
```

Expected:

- The `quiet_prefilter` scenario exits before the reason node.
- Usage has zero input tokens, zero output tokens, and zero estimated cost.
- No finding is created for the quiet scenario.

Live quiet evidence, when you have a clean Week:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select run_id, trace_metadata->>'branchPath' as branch_path, trace_metadata->>'earlyExitNode' as early_exit_node, trace_metadata->>'preFilterShouldReason' as should_reason, input_tokens, output_tokens from fleetgraph_usage where run_id not like 'seed-%' order by created_at desc limit 20;"
```

Expected quiet row:

- `early_exit_node` is `preFilter`, or the branch path shows a pre-filter exit.
- `should_reason` is `false`.
- `input_tokens` and `output_tokens` are `0`.

## Exercise The Finding Path With The Real Reasoner

The route-level mutation section above is the preferred manual path for live finding evidence. The strongest signal is an iteration with non-empty `blockers_encountered`, because `evaluateAtRiskWeekPreFilter` treats that as candidate risk before calling the model.

After the run, verify the model path:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select run_id, model_name, input_tokens, output_tokens, estimated_cost_usd, trace_metadata from fleetgraph_usage where run_id not like 'seed-%' and input_tokens > 0 order by created_at desc limit 10;"
```

Expected:

- `model_name` is an OpenAI model, not `deterministic-demo` or `proof-reasoner`.
- `input_tokens` and `output_tokens` are greater than zero.
- `trace_metadata` identifies the branch and scoped document.

Verify Langfuse recorded the reason path:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
set -a; source .env.local; set +a; export LANGFUSE_HOST="$LANGFUSE_BASE_URL"; npx langfuse-cli api traces list --tags trace_node:reason --limit 5 --order-by timestamp.desc --fields core,metrics
```

Expected:

- A recent `fleetgraph.at_risk_week.reason` trace or a trace tagged `trace_node:reason`.
- Non-zero model latency.
- Token and cost metadata when Langfuse receives the model usage fields.

Create the shared trace URL from the Langfuse UI for submission evidence. If the reviewer is not a Langfuse project member, either make the selected trace public after reviewing its prompt/context payload or recapture the run with `FLEETGRAPH_PUBLIC_TRACE_EXPORT=true` and `LANGFUSE_PROJECT_ID` configured so FleetGraph publishes it through the Langfuse SDK.

## Exercise Deduplication And Suppression

Deduplication proves the agent does not spam unchanged findings.

Record the current non-seed finding count:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select material_change_key, count(*) from fleetgraph_findings where detector_type = 'at_risk_week' and material_change_key not like 'seed:%' group by material_change_key order by count(*) desc, material_change_key;"
```

Trigger the same Week again without changing the blocker text. You can save the same standup or wait for the poll interval. Then rerun the query.

Expected:

- No material change key has a count greater than `1`.
- The second run either reuses the existing finding state or exits through guard/suppression logic.

Suppression proof:

1. Dismiss or snooze the live finding from the inbox or API.
2. Trigger the same Week again without changing blocker evidence.
3. Confirm no new open or pending review finding appears for the same material key.

Verify:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select f.id, f.lifecycle_state, f.material_change_key, s.suppression_type, s.expires_at from fleetgraph_findings f left join fleetgraph_suppressions s on s.finding_id = f.id where f.detector_type = 'at_risk_week' and f.material_change_key not like 'seed:%' order by f.created_at desc limit 10;"
```

Expected:

- Dismissed findings have a dismissal suppression.
- Snoozed findings have an expiry-backed suppression.
- Re-running unchanged context does not create a duplicate active finding.

## Exercise HITL Authorization Guards

The manual console path proves valid reviewer actions. Authorization edge cases are better exercised with the API test suite because it switches users and verifies transition failures directly.

Run:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/vitest run src/routes/fleetgraph.test.ts
```

Expected coverage:

- Non-recipient users cannot approve, reject, dismiss, snooze, or resume another user's finding.
- Workspace admins can review and resume when policy allows it.
- Invalid lifecycle transitions return errors instead of mutating state.
- Idempotency keys replay prior decisions instead of double-executing actions.

## Exercise The Proactive Latency Proof

This is an orchestration proof, not a live model-quality proof. The script creates proof data, enqueues the same proactive trigger controller, waits for a finding, and fails if the finding does not appear within five minutes. It intentionally uses `createProofReasoner`, so token usage is zero and OpenAI/Langfuse keys are not required.

From the API package:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/tsx src/fleetgraph/scripts/verify-latency.ts
```

Expected output is JSON like:

```json
{
  "runId": "...",
  "workspaceId": "...",
  "weekId": "...",
  "issueId": "...",
  "findingId": "...",
  "lifecycleState": "pending_review",
  "severity": "high",
  "mutationDebounceMs": 45000,
  "observedLatencyMs": 45113,
  "targetLatencyMs": 300000,
  "latencyTargetMet": true,
  "materialChangeKey": "..."
}
```

Record these fields as evidence:

- `runId`
- `issueId`
- `findingId`
- `observedLatencyMs`
- `targetLatencyMs`
- `latencyTargetMet`
- `materialChangeKey`

Verify the finding row:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select lifecycle_state, severity, material_change_key, created_at from fleetgraph_findings order by created_at desc limit 5;"
```

Interpretation:

- Passing this script proves the trigger controller, advisory lock, context build, guard path, output persistence, and five-minute timer can work within the target.
- It does not prove OpenAI reasoning latency or detection quality because `modelName` is `fleetgraph-latency-proof-deterministic`.
- Pair it with the live route-level mutation and real reasoner sections above for submission-grade agent evidence.

## Exercise Usage And Trace Evidence

Confirm usage rows:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select run_id, trigger, detector, model_name, input_tokens, output_tokens, estimated_cost_usd, trace_metadata from fleetgraph_usage order by created_at desc limit 10;"
```

Expected:

- Seed rows include `seed-fleetgraph-quiet-prefilter` and `seed-fleetgraph-pending-action`.
- Deterministic demo rows use `deterministic-demo` or proof model names and may have zero token usage.
- Live proactive graph runs add non-seed rows with trigger `proactive`.
- Live reasoner runs have an OpenAI model name and non-zero token usage.
- `trace_metadata` records branch path, scoped document, early exits, and related run metadata.

If Langfuse credentials are configured:

1. Run one quiet or no-finding scenario.
2. Run one finding-producing scenario with the real reasoner.
3. Open the Langfuse project associated with `LANGFUSE_PUBLIC_KEY`.
4. Capture shared trace URLs for both runs.
5. Add those URLs to the FleetGraph submission evidence.

Useful Langfuse CLI checks:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
set -a; source .env.local; set +a; export LANGFUSE_HOST="$LANGFUSE_BASE_URL"; npx langfuse-cli api traces list --limit 10 --order-by timestamp.desc --fields core,metrics
```

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
set -a; source .env.local; set +a; export LANGFUSE_HOST="$LANGFUSE_BASE_URL"; npx langfuse-cli api traces list --tags fleetgraph --limit 10 --order-by timestamp.desc --fields core,metrics
```

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
set -a; source .env.local; set +a; export LANGFUSE_HOST="$LANGFUSE_BASE_URL"; npx langfuse-cli api traces list --tags trace_node:reason --limit 10 --order-by timestamp.desc --fields core,metrics
```

Without Langfuse credentials, fresh local capture remains blocked by environment, not by the local product path. The public droplet trace URLs already recorded in `FLEETGRAPH.md` can be used for the final packet once they are recaptured with public export enabled, made public manually, or opened by reviewers with Langfuse project access.

## Developer Verification Commands

Use these after code changes or before submission smoke testing:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
./node_modules/.bin/tsc --noEmit
```

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/vitest run src/fleetgraph/proactive-runner.test.ts src/fleetgraph/triggers.test.ts src/routes/fleetgraph.test.ts src/routes/fleetgraph-chat.test.ts
```

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/vitest run src/fleetgraph/demo-scenarios.test.ts
```

## Evidence Checklist

Collect product acceptance artifacts:

- Screenshot of the open finding in the FleetGraph inbox.
- Screenshot after dismiss or snooze showing the open inbox cleared.
- Screenshot of the `Needs Review` tab showing the pending review card.
- Screenshot or database output after reject with `lifecycle_state: "rejected"`.
- Screenshot or database output after approve with `lifecycle_state: "approved"`.
- Screenshot or database output after resume with `lifecycle_state: "executed"`.
- Database output showing the inserted `fleetgraph_action_executions` row.
- Screenshot of embedded chat streaming an answer from a project, issue, or week.

Collect agent acceptance artifacts:

- Browser console response for a standup or iteration mutation on `/api/weeks/:id/...`.
- API log showing `fleetgraph.proactive_trigger.scope_processed` with `triggerSource: mutation`.
- Non-seed `fleetgraph_usage` row for the live proactive run.
- Live reasoner usage row with OpenAI model name and non-zero token counts.
- Non-seed `at_risk_week` finding row, if the live reasoner classifies the Week as at risk.
- Quiet path evidence showing pre-filter exit and zero model tokens.
- Deduplication query showing no duplicate material change keys.
- Suppression query showing dismissed or snoozed findings prevent unchanged re-alerting.
- `src/routes/fleetgraph.test.ts` output proving authorization and invalid-transition guards.
- Latency proof JSON showing `latencyTargetMet: true`, labeled as orchestration-only evidence.
- Langfuse shared trace URL for a quiet or no-finding branch.
- Langfuse shared trace URL for a real reasoner finding branch.
