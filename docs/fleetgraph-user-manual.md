# FleetGraph User Manual

Last updated: 2026-05-28

FleetGraph is the Ship-native project intelligence agent. It has two user-facing surfaces:

- **FleetGraph Inbox**: proactive findings, review, approval, dismiss, snooze, and resume.
- **Ask FleetGraph**: context-scoped chat inside project, issue, and Week documents.

## Sign In

Use the seeded demo account:

- Email: `dev@ship.local`
- Password: `admin123`
- Workspace: `Ship Workspace`

The live finding recipient account is also available:

- Email: `henry.patel@ship.local`
- Password: `admin123`

Do not use `e@mail.com` for the FleetGraph demo unless that user has been switched into `Ship Workspace`.

## Open The FleetGraph Inbox

The FleetGraph inbox is in the left sidebar.

1. Look near the bottom of the left rail.
2. Click the connected-nodes **FleetGraph** icon above the gear icon.
3. The centered **FleetGraph Inbox** modal opens.

The inbox has three primary tabs:

- **Open**: findings that need triage.
- **Needs Review**: pending agent actions that require approval or rejection.
- **Approved**: actions approved by a human and waiting to be resumed/executed.

Tabs can show circular unread count badges. A card that has not been viewed by the current user shows a compact **New** badge. Opening a tab marks those findings read for that user, while the badge remains visible for the current inbox session so the UI does not flicker during a demo.

## Understand A Finding

A finding is an agent-generated signal about project risk, missing ownership, blockers, stale updates, or unclear next steps.

Each card can show:

- Severity: `Low`, `Medium`, `High`, or `Critical`.
- State: `Open`, `Pending Review`, `Approved`, or another lifecycle state.
- Scope: the project, issue, or Week the finding is about.
- Evidence: why the agent created the finding.
- Recommended action: what the agent thinks should happen next.
- Trace proof: the **Why this?** panel with run id, branch path, latency, token usage, and Langfuse trace URL when available.

## What The Buttons Mean

- **Dismiss**: Clear the finding because it is not useful or has already been handled.
- **Snooze**: Hide it until a later date.
- **Reject**: Decline a pending recommended action with a reason.
- **Approve**: Approve a pending recommended action.
- **Resume**: Execute an approved action, such as posting the agent's draft comment to an issue.

`Approve` and `Reject` apply to `Needs Review` findings. `Resume` appears on the `Approved` tab. Open findings are usually handled with `Dismiss` or `Snooze`.

## Run The HITL Comment Flow

Use this flow to prove the human-in-the-loop write path from the browser.

1. Open the FleetGraph inbox.
2. Click **Needs Review**.
3. Find the pending review card with a `draft_comment` action.
4. Click **Approve**.
5. Click **Approved**.
6. Click **Resume**.
7. Open the target issue document.
8. Scroll to the bottom of the main editor area.

Expected result: a normal Ship comment appears on the issue. It is authored by the approving user, not auto-posted without review.

## Open Ask FleetGraph

Ask FleetGraph is separate from the inbox. It only appears on document pages, not on `/my-week`.

To open chat:

1. Close the FleetGraph Inbox modal if it is open.
2. Open a project, issue, or Week document. The URL should look like `/documents/<document-id>`.
3. Look near the upper-right of the document canvas, just left of the properties panel.
4. Click the **Ask FleetGraph** pill.
5. The **FleetGraph Chat** panel opens on the right.

Good demo target:

```text
https://143.198.163.184.nip.io/documents/ae794fb3-2b32-449b-819f-34348d317295
```

Good demo question:

```text
What is blocking this week, who owns recovery, and what should we do next?
```

Chat is scoped to the document you are viewing. A Week chat sees that Week, linked issues, standups, findings, and related project context.

## Chat Sources And Memory

FleetGraph chat streams responses over SSE from the shared `fleetgraph.runtime` LangGraph branch. The HTTP route still handles auth, scope validation, rate limiting, and stream framing.

The chat panel shows source chips when the API returns scoped sources. These point to the current document and related Ship context used to answer.

Chat memory is client-side and scoped by workspace, user, document type, and document id. Closing and reopening the same document chat should retain recent local messages in the browser. Server-side durable chat memory is future hardening.

## If You See "No Projects Yet"

You are probably in the wrong workspace.

Use `dev@ship.local` with password `admin123`, or switch to `Ship Workspace`.

## Reset The Demo Locally

For local rehearsals, use the health/reset script from the API package:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev \
  ./node_modules/.bin/tsx src/fleetgraph/scripts/demo-health.ts
```

Reset only FleetGraph demo artifacts:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev \
  ./node_modules/.bin/tsx src/fleetgraph/scripts/demo-health.ts --reset
```

The reset restores the two seeded findings, clears demo read receipts, clears demo approvals/executions/suppressions, and removes the exact seeded FleetGraph comment body from the trace issue. It does not wipe the workspace.

## Quick Mental Model

- The inbox tells you what FleetGraph noticed.
- Needs Review proves the agent asks before visible writes.
- Resume proves an approved action lands in normal Ship surfaces.
- Ask FleetGraph answers from the current document's work graph.
- Langfuse traces prove which graph branch ran, what it saw, and what it spent.
