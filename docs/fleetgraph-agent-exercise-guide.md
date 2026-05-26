# FleetGraph Agent Exercise Guide

Last updated: 2026-05-26

This guide walks through the manual paths needed to exercise FleetGraph's MVP agent functionality in the local Ship app. It covers the proactive findings inbox, human review actions, action resume, realtime invalidation, embedded context chat, deterministic latency proof, and the evidence worth collecting before submission.

## Scope

Use this when you want to prove that FleetGraph works end to end against real Ship data.

It exercises:

- Seeded FleetGraph programs, projects, issues, weeks, findings, action candidates, and usage rows.
- Proactive findings shown in the FleetGraph inbox.
- Finding lifecycle actions: dismiss, snooze, reject, approve, and resume.
- Authenticated FleetGraph API reads and mutations.
- Realtime invalidation after a FleetGraph decision.
- Embedded FleetGraph chat from project, issue, and week documents.
- Deterministic `< 5 min` proactive detection proof.
- Usage and trace evidence checks.

Current UI caveat: the sidebar inbox renders open findings by default. Pending review, approved, executed, rejected, dismissed, and snoozed states are supported by the API, but the current modal does not expose a lifecycle filter. The steps below use the UI where it exists and the authenticated browser console for lifecycle states that are not currently filterable in the modal.

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
LANGCHAIN_API_KEY=...
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=...
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

Use these reset commands when you want to run the lifecycle steps repeatedly.

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
- The card shows `Approve`, `Reject`, `Dismiss`, and `Snooze`.

Expected caveat:

- `Approve` and `Reject` are only valid for `pending_review` findings. On the seeded `open` finding, use `Dismiss` or `Snooze`. Approving this open finding should fail with `FleetGraph finding is not pending review`.

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

## Use The Authenticated API From The Browser

After signing in, open browser DevTools on `http://localhost:5173` and use this helper in the console. It reuses your authenticated app session and fetches CSRF tokens for state-changing requests.

```js
const fleetGraphGet = async (path) => {
  const response = await fetch(path, { credentials: 'include' });
  const body = await response.json();
  return { status: response.status, body };
};

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

const fleetGraphFindings = async (state) => (
  fleetGraphGet(`/api/fleetgraph/findings?lifecycle_state=${state}&limit=20`)
);
```

## Exercise Reject

1. Reset the pending review action finding.
2. In the browser console, load pending review findings:

```js
const pendingResponse = await fleetGraphFindings('pending_review');
const pendingFinding = pendingResponse.body.items[0];
pendingFinding;
```

Expected:

- `pendingFinding.lifecycle_state` is `pending_review`.
- `pendingFinding.action_candidates[0].recommended_action.kind` is `draft_comment`.

Reject the finding:

```js
await fleetGraphPost(`/api/fleetgraph/findings/${pendingFinding.id}/reject`, {
  reason: 'Exercise: action is not the right next step',
  idempotency_key: crypto.randomUUID(),
});
```

Expected:

- The response status is `200`.
- The response body has `lifecycle_state: "rejected"`.
- A row is written to `fleetgraph_approvals` with decision `rejected` and the supplied reason.

Verify:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select decision, reason from fleetgraph_approvals where finding_id in (select id from fleetgraph_findings where material_change_key = 'seed:fleetgraph:pending-review:trace-evidence:v1') order by created_at desc limit 3;"
```

## Exercise Approve

1. Reset the pending review action finding.
2. Load the pending review finding:

```js
const approvePendingResponse = await fleetGraphFindings('pending_review');
const approveFinding = approvePendingResponse.body.items[0];
const actionCandidate = approveFinding.action_candidates[0];
```

Approve the action candidate:

```js
await fleetGraphPost(`/api/fleetgraph/findings/${approveFinding.id}/approve`, {
  action_candidate_id: actionCandidate.id,
  idempotency_key: crypto.randomUUID(),
});
```

Expected:

- The response status is `200`.
- The response body has `lifecycle_state: "approved"`.
- The finding is no longer pending review.
- A row is written to `fleetgraph_approvals` with decision `approved`.

Verify:

```js
await fleetGraphFindings('approved');
```

## Exercise Resume

Resume takes an approved action candidate and executes the supported Ship write. The seeded candidate is a `draft_comment`, so resume writes a comment to the target issue and transitions the finding to `executed`.

1. Approve the pending review finding first.
2. Load the approved finding:

```js
const approvedResponse = await fleetGraphFindings('approved');
const approvedFinding = approvedResponse.body.items[0];
const approvedActionCandidate = approvedFinding.action_candidates[0];
```

Resume the approved action:

```js
await fleetGraphPost(`/api/fleetgraph/actions/${approvedActionCandidate.id}/resume`, {
  idempotency_key: crypto.randomUUID(),
});
```

Expected:

- The response status is `200`.
- The response body has `lifecycle_state: "executed"`.
- A comment is inserted on the action candidate target document.
- A row is written to `fleetgraph_action_executions`.

Verify the execution row:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select result from fleetgraph_action_executions where finding_id in (select id from fleetgraph_findings where material_change_key = 'seed:fleetgraph:pending-review:trace-evidence:v1') order by created_at desc limit 3;"
```

Verify the comment:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select d.title, c.content from comments c join documents d on d.id = c.document_id where c.content like 'Please add the shared LangSmith trace URLs%' order by c.created_at desc limit 3;"
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

1. Make sure the API process has `OPENAI_API_KEY`, `LANGCHAIN_API_KEY`, `LANGCHAIN_TRACING_V2=true`, and `LANGCHAIN_PROJECT`.
2. Open a FleetGraph project, issue, or week document. Good seeded targets include:
   - `FleetGraph - Embedded Agent Chat`
   - `Expose scoped FleetGraph chat in editor`
   - The current FleetGraph week under the `FleetGraph MVP` program
3. In the editor header, click the FleetGraph chat bubble button.
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

## Exercise The Proactive Latency Proof

The deterministic latency proof creates a real blocked issue mutation, runs the same proactive trigger path, waits for a finding, and fails if the finding does not appear within five minutes.

From the API package:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/tsx src/fleetgraph/scripts/verify-latency.ts
```

Expected output is JSON like:

```json
{
  "runId": "...",
  "findingId": "...",
  "lifecycleState": "pending_review",
  "severity": "high",
  "observedLatencyMs": 45113,
  "targetLatencyMs": 300000,
  "latencyTargetMet": true
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

## Exercise Usage And Trace Evidence

Confirm seeded or live usage rows:

```bash
docker exec ship-postgres-1 psql -U ship -d ship_dev -c "select run_id, trigger, detector, model_name, input_tokens, output_tokens, estimated_cost_usd, trace_metadata from fleetgraph_usage order by created_at desc limit 10;"
```

Expected:

- Seed rows include `seed-fleetgraph-quiet-prefilter` and `seed-fleetgraph-pending-action`.
- Live proactive graph runs add additional rows with trigger `proactive`.
- `trace_metadata` records branch path, scoped document, and related run metadata.

If LangSmith credentials are configured:

1. Run one quiet or no-finding scenario.
2. Run one pending action scenario.
3. Open the LangSmith project named by `LANGCHAIN_PROJECT`.
4. Capture shared trace URLs for both runs.
5. Add those URLs to the FleetGraph submission evidence.

Without LangSmith credentials, this step remains blocked by environment, not by the local product path.

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

## Evidence Checklist

Collect these artifacts for a full FleetGraph exercise pass:

- Screenshot of the open finding in the FleetGraph inbox.
- Screenshot after dismiss or snooze showing the open inbox cleared.
- Browser console response for reject with `lifecycle_state: "rejected"`.
- Browser console response for approve with `lifecycle_state: "approved"`.
- Browser console response for resume with `lifecycle_state: "executed"`.
- Database output showing the inserted `fleetgraph_action_executions` row.
- Screenshot of embedded chat streaming an answer from a project, issue, or week.
- Latency proof JSON showing `latencyTargetMet: true`.
- `fleetgraph_usage` output showing recorded usage rows.
- LangSmith shared trace URLs when credentials are available.
