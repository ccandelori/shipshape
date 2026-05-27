# FleetGraph Pre-Search

Date: 2026-05-26

This document is the root-level PRESEARCH deliverable for the Week 5 FleetGraph assignment. It records the research and design decisions behind FleetGraph as implemented in Ship, plus the remaining submission risks.

## Source Materials Reviewed

- Official PRD: `/Users/sheep/Desktop/Gauntlet/Week 5 GFA - FleetGraph PRD.pdf`
- Canonical FleetGraph design and evidence: `FLEETGRAPH.md`
- Runtime and development cost ledger: `FLEETGRAPH_TOKEN_SPEND.md`
- Deployment guidance: `DEPLOYMENT.md`, `DEPLOYMENT_CHECKLIST.md`
- Graph implementation: `api/src/fleetgraph/detectors/at-risk-week.ts`
- Trigger controller: `api/src/fleetgraph/triggers.ts`
- Context loading: `api/src/fleetgraph/context.ts`
- Guard and suppression logic: `api/src/fleetgraph/guards.ts`
- Human-in-the-loop policy: `api/src/fleetgraph/policy.ts`
- Inbox and resume APIs: `api/src/routes/fleetgraph.ts`
- Embedded chat APIs: `api/src/fleetgraph/chat.ts`, `api/src/routes/fleetgraph-chat.ts`
- FleetGraph tests under `api/src/fleetgraph/*.test.ts`, `api/src/routes/fleetgraph*.test.ts`, and `e2e/fleetgraph-ui.spec.ts`

## Phase 1: Define The Agent

### Agent Responsibility

FleetGraph is a project-intelligence agent for Ship. It reads real Ship workspace data, detects project risk, creates durable findings, proposes next actions, and supports context-scoped chat inside project, issue, and Week views.

The MVP proactive detector is an at-risk Week detector. Ship still stores Weeks as `document_type = 'sprint'`, so the detector maps product language to the current database model.

FleetGraph monitors:

- Week documents and their computed date windows.
- Issues associated with a Week, including priority, state, assignee, and blocker/progress signals.
- Standups and blocker language.
- Sprint and issue iteration records.
- Weekly plan and retro accountability status.
- Prior FleetGraph findings, suppressions, snoozes, approvals, and pending review state.
- Program, project, and person ownership context.

Conditions worth surfacing:

- Blockers remain unresolved.
- High-priority work stalls while the Week continues moving.
- Work lacks a current owner, standup, or progress signal.
- Planning or accountability context is missing.
- Scope or load looks inconsistent with the Week plan.
- A previously suppressed risk materially changes.

FleetGraph stays quiet when the state has not materially changed, a suppression still applies, a pending review already exists, or another API instance is already processing the same scope.

### Autonomy And Human Approval

FleetGraph can autonomously:

- Read workspace-scoped Ship state.
- Summarize context.
- Rank risks.
- Create findings.
- Stream private context answers.
- Create draft action candidates.

FleetGraph must ask a human before:

- Posting a visible comment or nudge.
- Creating or assigning an issue.
- Changing issue state.
- Updating ownership.
- Sending external notifications.
- Performing bulk edits or any hard-to-reverse action.

The human-in-the-loop surface is the FleetGraph Inbox. Reviewers can approve, reject, dismiss, or snooze findings and action candidates.

### Recipient Model

FleetGraph uses the existing Ship graph instead of inventing a separate routing model:

- `workspace_memberships` defines access and admin capability.
- `documents` stores people, programs, projects, Weeks, issues, standups, plans, and retros.
- `document_associations` links issues, projects, programs, and Weeks.
- Document properties identify owners, assignees, and responsible people.

Default recipients are Week owners for Week findings, project owners for project risks, issue assignees for issue-specific blockers, and workspace admins for unresolved ownership.

### Use Cases

| # | Role | Trigger | Agent output | Human decision |
|---|------|---------|--------------|----------------|
| 1 | Director | A Week nears its end with important work blocked or stalled. | At-risk Week finding with evidence, severity, owner, and a proposed next action. | Approve, edit, reject, dismiss, or snooze. |
| 2 | PM / Week owner | A blocker remains unresolved across elapsed-time thresholds. | Stale blocker summary with affected issues and responsible owner. | Ask for update, create follow-up, accept risk, or suppress. |
| 3 | Engineer | Assigned work has no recent standup or progress signal. | Private reminder or draft standup prompt tied to current work. | Post, edit, dismiss, or snooze. |
| 4 | PM | A Week starts without plan or accountability context. | Accountability finding linked to plan, retro, and project context. | Create plan task, notify owner, or intentionally defer. |
| 5 | Director / PM | Scope, issue count, or assignment load suggests overload. | Scope-creep or overload finding with tradeoff recommendation. | Rebalance, accept risk, ask for clarification, or defer. |
| 6 | Any user | User asks contextual chat what is blocked, risky, or next. | Answer grounded in the visible issue, project, or Week document. | Use the answer or ask a follow-up. |
| 7 | Any user | User asks chat to take action. | Draft action or pending approval candidate. | Approve, edit, reject, or leave as draft. |

## Phase 2: Graph Architecture

### Framework And Shape

FleetGraph uses LangGraph.js inside the existing `@ship/api` TypeScript service. This keeps auth, database access, OpenAPI registration, server events, and deployment inside the system that already owns Ship state.

The core graph has these conceptual nodes:

- `trigger`: normalize poll, mutation, or on-demand input.
- `scope`: authorize workspace and resolve the scoped document.
- `intent`: separate proactive detection from on-demand questions or action requests.
- `context`: build bounded Ship context.
- `fetch`: load documents, issues, standups, accountability status, findings, and ownership in parallel where safe.
- `guard`: enforce advisory lock, material-change, suppression, dedup, and pending-review checks.
- `preFilter`: cheaply decide whether unsolicited proactive reasoning is worth surfacing.
- `reason`: produce structured findings, evidence, recommendations, and action candidates.
- `policy`: classify whether approval is required.
- `pending`: persist human-review state.
- `resume`: authorize and resume approved action candidates.
- `output`: persist findings, stream chat output, and refresh UI surfaces.

Conditional branches include quiet exit, changed-state proactive reasoning, pending-review persistence, approval/resume, and chat streaming.

### State Management

Runtime graph state carries trigger source, intent, workspace id, actor id, scope, fetched context, detector type, material-change key, candidate finding, action candidate, approval decision, and chat messages.

Durable state is stored in dedicated FleetGraph tables:

- `fleetgraph_findings`
- `fleetgraph_action_candidates`
- `fleetgraph_approvals`
- `fleetgraph_suppressions`
- `fleetgraph_usage`
- `fleetgraph_action_executions`

Current implementation note: `FLEETGRAPH.md` describes LangGraph checkpoints through `PostgresSaver`, but the current at-risk Week graph uses `MemorySaver` in `api/src/fleetgraph/detectors/at-risk-week.ts`. Durable outcomes are persisted in Postgres, but graph checkpoint durability should either be implemented or the design doc should be corrected before final submission.

### Human-In-The-Loop Design

The approval policy is based on stakes and reversibility:

- Private answers and summaries can auto-answer.
- Findings can be created without writing to user content.
- Draft visible writes require review.
- Unsolicited visible writes require explicit approval.
- External notifications, destructive edits, and bulk actions are out of MVP scope.

Dismiss and snooze are durable suppression choices, not local UI state.

### Error And Failure Handling

FleetGraph fails closed for writes:

- If model configuration is missing, chat returns a clear unavailable response.
- If Ship context cannot be loaded, no partial write executes.
- If approval resume fails, the action remains non-executed.
- If Langfuse is unavailable, the graph can run but shared trace deliverables remain blocked.

Security boundaries:

- Every finding and action row includes `workspace_id`.
- Reads and writes bind to the current workspace.
- Cross-workspace ids are rejected.
- Resume is restricted to the finding recipient or workspace admin.
- User-authored Ship content is treated as untrusted LLM input.

## Phase 3: Stack, Deployment, And Performance

### Deployment Model

FleetGraph runs inside the existing Express API process on Elastic Beanstalk.

Runtime components:

- API routes for findings, approvals, suppressions, resume, and chat.
- In-process poll trigger.
- Mutation hooks from issue, standup, iteration, and Week changes.
- Existing `/events` channel for UI invalidation.
- Server-Sent Events for `/api/fleetgraph/chat`.
- PostgreSQL for durable findings and action lifecycle state.

Deployment requirements still to prove:

- FleetGraph-enabled API deployed to the public Ship URL.
- Required production env vars set: `OPENAI_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL`; optional deployment context set with `LANGFUSE_TRACING_ENVIRONMENT` and `LANGFUSE_RELEASE`.
- Migrations applied in the deployed database.
- Inbox and embedded chat smoke-tested from the public URL.
- CloudFront or direct API path verified not to buffer chat SSE.

### Trigger Model

FleetGraph uses a hybrid trigger model:

- Poll interval: `180_000ms` in `api/src/fleetgraph/triggers.ts`.
- Mutation debounce: `45_000ms` in `api/src/fleetgraph/triggers.ts`.
- Advisory locks prevent duplicate multi-instance work.
- Material-change keys and suppressions prevent duplicate findings and unnecessary model calls.

This is the defensible tradeoff for the PRD:

- Polling catches time-based risks.
- Mutation hooks give low-latency response to user-visible changes.
- Guarding keeps model spend bounded.

### Performance And Cost

The PRD requires problem detection under 5 minutes from event appearing in Ship to agent surfacing it. The implementation is designed for that target because mutation-triggered runs wait 45 seconds before execution, and poll fallback runs every 3 minutes. A formal timed proof is still pending and tracked as Taskmaster task 15.

Cost controls:

- Deterministic material-change guard.
- Durable dedup and suppression.
- Cheap pre-filter before deeper reasoning.
- Bounded context windows.
- Per-user chat rate limits.
- Advisory locks.
- Runtime usage persisted in `fleetgraph_usage`.

Current deterministic runtime evidence:

| Scenario | Branch path | Tokens | Cost |
|----------|-------------|--------|------|
| Quiet pre-filter exit | `prefilter-exit` | 0 input / 0 output | `$0.000000` |
| Finding with pending action | `output` | 850 input / 172 output | `$0.000231` |

Production estimates are documented in `FLEETGRAPH.md` and `FLEETGRAPH_TOKEN_SPEND.md`.

## Evidence

Implementation evidence:

- LangGraph detector: `api/src/fleetgraph/detectors/at-risk-week.ts`
- Trigger controller and mutation queue: `api/src/fleetgraph/triggers.ts`
- Context builders: `api/src/fleetgraph/context.ts`
- Guard, suppression, and advisory lock logic: `api/src/fleetgraph/guards.ts`
- HITL policy and action persistence: `api/src/fleetgraph/policy.ts`
- Inbox/resume API: `api/src/routes/fleetgraph.ts`
- Chat SSE API: `api/src/routes/fleetgraph-chat.ts`
- FleetGraph UI: `web/src/components/FleetGraph/*`

Local verification already recorded in `FLEETGRAPH.md`:

- Deterministic demo scenarios pass for quiet and finding paths.
- At-risk Week detector tests pass.
- Persistence tests pass.
- Full API regression previously passed with 623 tests.

Local seed verification:

- Docker Postgres at `127.0.0.1:5433/ship_dev` has `Ship Workspace`.
- Seeded FleetGraph data includes the `FleetGraph MVP` program, FleetGraph projects and issues, open and pending-review findings, an action candidate, and `fleetgraph_usage` rows.

## Current Submission Status

| Requirement | Status |
|-------------|--------|
| Graph running with proactive detection E2E | Implemented locally |
| Langfuse tracing enabled with two shared trace links | Blocked on credentials |
| `FLEETGRAPH.md` with responsibility and use cases | Present |
| Graph outline with nodes, edges, and branches | Present |
| Human-in-the-loop gate | Implemented |
| Running against real Ship data | Implemented locally |
| Agent chat and notifications accessible in UI | Implemented locally |
| Deployed and publicly accessible | Pending |
| Trigger model documented and defended | Present |
| Detection latency under 5 minutes | Designed for target; timed proof pending |
| Cost per run and production estimates | Present |

## Known Gaps And Follow-Up Tasks

1. Langfuse trace links are blocked until credentials are available.
   - Taskmaster: task 12 remains blocked on shared trace capture.

2. Public deployment is not yet verified with FleetGraph configuration.
   - Taskmaster: task 13 tracks deployment and smoke testing.

3. Root PRESEARCH has been created from the official PRD and current repo evidence.
   - Taskmaster: task 14.

4. Timed detection proof is still required.
   - Taskmaster: task 15.

5. On-demand chat is functional and now enters the shared compiled FleetGraph LangGraph runtime for traced model streaming.
   - Remaining follow-up: chat-initiated write actions should use the same approval model as proactive findings.

6. Checkpoint durability should be reconciled.
   - `FLEETGRAPH.md` mentions `PostgresSaver`; current code uses `MemorySaver`.
   - Durable findings/actions are persisted, but graph checkpoint persistence is not the same as the documented design.

## Final Readiness Judgment

FleetGraph is substantially implemented for the local MVP path: proactive detection, guarded execution, durable findings, human review, embedded chat, UI access, seed data, and cost tracking are all present.

The project is not submission-ready until these are resolved:

- Shared Langfuse trace URLs for at least two different graph paths.
- Public FleetGraph deployment with runtime env vars.
- Timed latency proof showing event-to-finding under 5 minutes.
- Documentation cleanup for the chat architecture and checkpointing deviations.
