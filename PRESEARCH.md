# FleetGraph Pre-Search

Date: 2026-05-28

This is the root-level PRESEARCH deliverable for the Week 5 FleetGraph assignment. It records the research, design decisions, and current implementation evidence for FleetGraph as it exists on the submission branch.

## Source Materials Reviewed

- Official PRD: `/Users/sheep/Desktop/Gauntlet/Week 5 GFA - FleetGraph PRD.pdf`
- Canonical FleetGraph design and evidence: `FLEETGRAPH.md`
- Submission readiness audit: `docs/fleetgraph-submission-readiness-audit.md`
- Runtime and development cost ledger: `FLEETGRAPH_TOKEN_SPEND.md`
- Deployment guidance: `DEPLOYMENT.md`, `DEPLOYMENT_CHECKLIST.md`, `scripts/deploy-droplet.sh`
- Shared graph runtime: `api/src/fleetgraph/graph.ts`
- Proactive detector: `api/src/fleetgraph/detectors/at-risk-week.ts`
- Trigger controller: `api/src/fleetgraph/triggers.ts`
- Context loading: `api/src/fleetgraph/context.ts`
- Guard and suppression logic: `api/src/fleetgraph/guards.ts`
- Human-in-the-loop policy: `api/src/fleetgraph/policy.ts`
- Inbox and resume APIs: `api/src/routes/fleetgraph.ts`
- Embedded chat APIs: `api/src/fleetgraph/chat.ts`, `api/src/routes/fleetgraph-chat.ts`
- Demo health/reset tooling: `api/src/fleetgraph/scripts/demo-health.ts`
- FleetGraph tests under `api/src/fleetgraph/*.test.ts`, `api/src/routes/fleetgraph*.test.ts`, `web/src/components/FleetGraph/*.test.tsx`, and `e2e/fleetgraph-ui.spec.ts`

## Phase 1: Define The Agent

### Agent Responsibility

FleetGraph is a project-intelligence agent for Ship. It reads real Ship workspace data, detects project risk, creates durable findings, proposes next actions, and supports context-scoped chat inside project, issue, and Week views.

The MVP proactive detector is an at-risk Week detector. Ship stores Weeks as `document_type = 'sprint'`, so the detector maps product language to the current database model.

FleetGraph monitors:

- Week documents and their computed date windows.
- Issues associated with a Week, including priority, state, assignee, and blocker/progress signals.
- Standups and blocker language.
- Sprint and issue iteration records.
- Weekly plan and retro accountability status.
- Prior FleetGraph findings, suppressions, snoozes, approvals, read receipts, and pending review state.
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
- Mark findings read for the current user.

FleetGraph must ask a human before:

- Posting a visible comment or nudge.
- Creating or assigning an issue.
- Changing issue state.
- Updating ownership.
- Sending external notifications.
- Performing bulk edits or any hard-to-reverse action.

The human-in-the-loop surface is the FleetGraph Inbox. Reviewers can approve, reject, dismiss, snooze, or resume action candidates through browser UI tabs for `Open`, `Needs Review`, and `Approved` findings.

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
| 1 | Director | A Week nears its end with important work blocked or stalled. | At-risk Week finding with evidence, severity, owner, and a proposed next action. | Approve, edit via API, reject, dismiss, or snooze. |
| 2 | PM / Week owner | A blocker remains unresolved across elapsed-time thresholds. | Stale blocker summary with affected issues and responsible owner. | Ask for update, create follow-up, accept risk, or suppress. |
| 3 | Engineer | Assigned work has no recent standup or progress signal. | Private reminder or draft standup prompt tied to current work. | Post, edit, dismiss, or snooze. |
| 4 | PM | A Week starts without plan or accountability context. | Accountability finding linked to plan, retro, and project context. | Create plan task, notify owner, or intentionally defer. |
| 5 | Director / PM | Scope, issue count, or assignment load suggests overload. | Scope-creep or overload finding with tradeoff recommendation. | Rebalance, accept risk, ask for clarification, or defer. |
| 6 | Any user | User asks contextual chat what is blocked, risky, or next. | Answer grounded in the visible issue, project, or Week document. | Use the answer or ask a follow-up. |
| 7 | Any user | User asks chat to take action. | Draft action or pending approval candidate. | Approve, reject, or leave as draft. Browser edit-before-approve is post-MVP polish; API edited approval exists. |

## Phase 2: Graph Architecture

### Framework And Shape

FleetGraph uses LangGraph.js inside the existing `@ship/api` TypeScript service. This keeps auth, database access, OpenAPI registration, server events, SSE, and deployment inside the system that already owns Ship state.

The current implementation has one top-level compiled runtime, `fleetgraph.runtime`, in `api/src/fleetgraph/graph.ts`.

Implemented branches:

- `proactive_at_risk_week`: delegates to the at-risk Week detector graph.
- `ondemand_chat`: streams the on-demand chat model call from inside the shared graph branch.

The HTTP chat route still owns validation, auth, scope resolution, rate limiting, SSE headers, heartbeat, and abort cleanup. Once the response stream opens, the graph branch owns model streaming and tracing. This satisfies the PRD requirement that proactive and on-demand use the same graph architecture while preserving reliable HTTP behavior.

Conceptual nodes:

- `trigger`: normalize poll, mutation, or on-demand input.
- `scope`: authorize workspace and resolve the scoped document.
- `intent`: route proactive detection versus on-demand question/action request.
- `context`: build bounded Ship context.
- `fetch`: load documents, issues, standups, accountability status, findings, and ownership in parallel where safe.
- `guard`: enforce advisory lock, material-change, suppression, dedup, and pending-review checks.
- `preFilter`: cheaply decide whether unsolicited proactive reasoning is worth surfacing.
- `reason`: produce structured findings, evidence, recommendations, and action candidates.
- `policy`: classify whether approval is required.
- `pending`: persist human-review state and action candidate metadata.
- `resume`: authorize and resume approved action candidates.
- `output`: persist findings, stream chat output, and refresh UI surfaces.

Conditional branches include quiet exit, changed-state proactive reasoning, pending-review persistence, approval/resume, and on-demand chat streaming.

### State Management

Runtime graph state carries graph name, mode, workspace id, actor id, scope, fetched context, detector type, material-change key, candidate finding, action candidate, approval decision, and on-demand chat messages.

Durable FleetGraph state is stored in dedicated Postgres tables:

- `fleetgraph_findings`
- `fleetgraph_action_candidates`
- `fleetgraph_approvals`
- `fleetgraph_suppressions`
- `fleetgraph_usage`
- `fleetgraph_action_executions`
- `fleetgraph_inbox_reads`
- `fleetgraph_finding_reads`

Current checkpoint boundary: graph checkpointing uses LangGraph `MemorySaver` for the detector runtime. Durable outcomes, approvals, suppressions, usage, executions, and read state are persisted in Postgres. `PostgresSaver` remains a post-MVP production hardening item, not a submission claim.

### Human-In-The-Loop Design

The approval policy is based on stakes and reversibility:

- Private answers and summaries can auto-answer.
- Findings can be created without writing to user content.
- Draft visible writes require review.
- Unsolicited visible writes require explicit approval.
- External notifications, destructive edits, and bulk actions are out of MVP scope.

Dismiss and snooze are durable suppression choices, not local UI state. Resume is restricted to the resolved recipient or a workspace admin and is idempotent.

### Error And Failure Handling

FleetGraph fails closed for writes:

- If model configuration is missing, chat returns a clear unavailable response.
- If Ship context cannot be loaded, no partial write executes.
- If approval resume fails, the action remains non-executed.
- If Langfuse is unavailable, the agent can still run, but observability evidence must come from a later captured trace or local usage rows.

Security boundaries:

- Every finding and action row includes `workspace_id`.
- Reads and writes bind to the current workspace.
- Cross-workspace ids are rejected.
- Resume is restricted to the finding recipient or workspace admin.
- User-authored Ship content is treated as untrusted LLM input.

## Phase 3: Stack, Deployment, And Performance

### Deployment Model

FleetGraph runs inside the existing Express API process on Elastic Beanstalk / droplet-style deployment.

Runtime components:

- API routes for findings, approvals, suppressions, resume, read marking, and chat.
- In-process poll trigger.
- Mutation hooks from issue, standup, iteration, and Week changes.
- Existing `/events` channel for UI invalidation.
- Server-Sent Events for `/api/fleetgraph/chat`.
- PostgreSQL for durable findings and action lifecycle state.

Public deployment evidence is recorded in `FLEETGRAPH.md`: release `20260527-151052` was smoke-tested at `https://143.198.163.184.nip.io/` with login, inbox tabs, a trace-backed finding, and graph-routed Week chat.

### Trigger Model

FleetGraph uses a hybrid trigger model:

- Poll interval: `180_000ms` in `api/src/fleetgraph/triggers.ts`.
- Mutation debounce: `45_000ms` in `api/src/fleetgraph/triggers.ts`.
- Advisory locks prevent duplicate multi-instance work.
- Material-change keys and suppressions prevent duplicate findings and unnecessary model calls.
- Langfuse trace gating avoids exporting routine quiet poll exits while preserving local `fleetgraph_usage` rows for every run.

This is the defensible tradeoff for the PRD:

- Polling catches time-based risks.
- Mutation hooks give low-latency response to user-visible changes.
- Guarding keeps model spend bounded.
- Trace gating keeps observability useful without overwhelming Langfuse limits.

### Performance And Cost

The PRD requires problem detection under 5 minutes from event appearing in Ship to agent surfacing it. The implementation has two evidence layers:

- Deterministic orchestration proof: `docs/fleetgraph-latency-proof.md` measured `45.113s` from mutation enqueue to persisted finding against the `300s` target.
- Live deployed trace evidence: `FLEETGRAPH.md` records a mutation-triggered finding run with `10.456s` graph latency in Langfuse metadata.

Cost controls:

- Deterministic material-change guard.
- Durable dedup and suppression.
- Cheap pre-filter before deeper reasoning.
- Bounded context windows.
- Per-user chat rate limits.
- Advisory locks.
- Trace gating for routine quiet polls.
- Runtime usage persisted in `fleetgraph_usage`.

Production estimates and live/deterministic token evidence are documented in `FLEETGRAPH.md` and `FLEETGRAPH_TOKEN_SPEND.md`.

## Evidence

Implementation evidence:

- Shared graph runtime: `api/src/fleetgraph/graph.ts`
- LangGraph detector: `api/src/fleetgraph/detectors/at-risk-week.ts`
- Trigger controller and mutation queue: `api/src/fleetgraph/triggers.ts`
- Context builders: `api/src/fleetgraph/context.ts`
- Guard, suppression, and advisory lock logic: `api/src/fleetgraph/guards.ts`
- HITL policy and action persistence: `api/src/fleetgraph/policy.ts`
- Inbox/resume/read API: `api/src/routes/fleetgraph.ts`
- Chat SSE API: `api/src/routes/fleetgraph-chat.ts`
- FleetGraph UI: `web/src/components/FleetGraph/*`
- Chat memory and stream parsing: `web/src/lib/fleetgraphChatMemory.ts`, `web/src/lib/fleetgraphChatStream.ts`
- Demo health/reset script: `api/src/fleetgraph/scripts/demo-health.ts`

Verification already recorded:

- Deterministic demo scenarios pass for quiet and finding paths.
- At-risk Week detector tests pass.
- Persistence tests pass.
- Focused FleetGraph API, OpenAPI, and demo-health tests pass.
- Focused FleetGraph web component and hook tests pass.
- API and web type-check/build passed during the latest polish pass.
- Full API regression previously passed with 623 tests.

Live trace evidence in `FLEETGRAPH.md`:

- Finding path trace.
- Quiet path trace.
- On-demand Week chat trace.

Local seed verification:

- Docker Postgres at `127.0.0.1:5433/ship_dev` has `Ship Workspace`.
- Seeded FleetGraph data includes the `FleetGraph MVP` program, FleetGraph projects and issues, open and pending-review findings, an action candidate, read state, and `fleetgraph_usage` rows.

## Current Submission Status

| Requirement | Status |
|-------------|--------|
| Graph running with proactive detection E2E | Implemented |
| Observability with at least two trace links | Captured in Langfuse; final shareability depends on making selected traces public or giving graders project access |
| `FLEETGRAPH.md` with responsibility and use cases | Present and current |
| Graph outline with nodes, edges, and branches | Present and current |
| Human-in-the-loop gate | Implemented in API and browser inbox |
| Running against real Ship data | Implemented |
| Agent chat and notifications accessible in UI | Implemented |
| Deployed and publicly accessible | Public app URL documented and smoke-tested |
| Trigger model documented and defended | Present |
| Detection latency under 5 minutes | Passed deterministic proof; live trace latency metadata recorded |
| Cost per run and production estimates | Present |
| Same graph architecture for proactive and on-demand | Implemented through `fleetgraph.runtime` |

## Known Gaps And Follow-Up Tasks

These do not block the Week 5 MVP if documented honestly, but they are the next product hardening items.

1. Public trace sharing must be finalized before sending the submission packet.
   - Current links were captured as authenticated Langfuse Cloud URLs.
   - FleetGraph now has an opt-in SDK path for public trace publication: set `FLEETGRAPH_PUBLIC_TRACE_EXPORT=true` and `LANGFUSE_PROJECT_ID`, then recapture the selected finding, quiet, and chat traces.
   - Public trace export calls Langfuse `setTraceAsPublic()` and records `tracePublic`, `traceId`, and `traceUrl` metadata when a project id is configured. Keep it off outside submission windows.

2. `PostgresSaver` checkpoint durability is deferred.
   - Durable FleetGraph outcomes are in Postgres today.
   - Graph-native checkpoint persistence remains future hardening.

3. Chat-initiated write actions are architected but not fully browser-complete.
   - The current on-demand branch streams grounded answers through the shared graph.
   - A later branch should turn "create a follow-up issue" chat requests into action candidates in the same HITL model.

4. Additional detector families remain extension work.
   - The MVP ships one flagship at-risk Week detector.
   - Missing standup, planless Week, overload, and scope-creep detectors are defined as use cases but not all implemented as separate production detectors.

## Final Readiness Judgment

FleetGraph is substantially submission-ready from a code, documentation, deployment, and demo standpoint: proactive detection, guarded execution, durable findings, human review, embedded graph-routed chat, UI access, seed data, latency proof, trace evidence, and cost tracking are all present.

The only remaining submission packaging risk is trace access. Langfuse trace URLs must either be recaptured with `FLEETGRAPH_PUBLIC_TRACE_EXPORT=true`, manually made public after review, or shared with reviewers who have Langfuse project access before final submission.
