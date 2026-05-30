# FleetGraph Pre-Search

Date: 2026-05-29

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
- Formal eval tooling: `api/src/fleetgraph/evals.ts`, `api/src/fleetgraph/scripts/run-evals.ts`, `docs/evals/fleetgraph-v1-eval-report.md`, `docs/evals/fleetgraph-v2-eval-report.md`
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
- Create action candidates attached to proactive findings.
- Mark findings read for the current user.

The submitted write path asks a human before:

- Posting a visible comment or nudge through an approved `draft_comment` action.
- Resuming any pending human-in-the-loop action.

FleetGraph must not perform issue creation, assignment changes, state changes, ownership updates, external notifications, bulk edits, or hard-to-reverse actions automatically.

The human-in-the-loop surface is the FleetGraph Inbox. Reviewers can approve, reject, dismiss, snooze, or resume action candidates through browser UI tabs for `Open`, `Needs Review`, and `Approved` findings.

### Recipient Model

FleetGraph uses the existing Ship graph instead of inventing a separate routing model:

- `workspace_memberships` defines access and admin capability.
- `documents` stores people, programs, projects, Weeks, issues, standups, plans, and retros.
- `document_associations` links issues, projects, programs, and Weeks.
- Document properties identify owners, assignees, and responsible people.

Default recipients are Week owners for Week findings, project owners for project risks, issue assignees for issue-specific blockers, and workspace admins for unresolved ownership.

### Use Cases

Rows 1-6 are the trace-backed submission use cases.

| # | Role | Trigger | Agent output | Human decision |
|---|------|---------|--------------|----------------|
| 1 | Director | A Week nears its end with important work blocked or stalled. | At-risk Week finding with evidence, severity, owner, and a proposed next action. | Approve a comment/nudge, reject, dismiss, or snooze. |
| 2 | PM / Week owner | A technical blocker remains unresolved as the Week approaches its end. | At-risk Week finding with stale-blocker evidence, affected issue, owner, and escalation context. | Ask for update, follow up manually, accept risk, or suppress. |
| 3 | Engineer | Assigned high-priority work has no recent standup or progress signal while other work continues. | At-risk Week finding with evidence calling out missing progress on assigned work. | Dismiss, snooze, approve a proposed visible action when one exists, or follow up manually. |
| 4 | PM | A Week has no weekly plan document while high-priority work has stalled. | At-risk Week finding with missing-plan/accountability evidence linked to plan and project context. | Follow up with the owner or mark the risk intentionally accepted. |
| 5 | Director / PM | A single owner is assigned a high volume of high-priority items with visible overload signals. | At-risk Week finding with scope-pressure or overload evidence and a tradeoff recommendation. | Rebalance, accept risk, ask for clarification, or defer. |
| 6 | Any user | User asks contextual chat who owns work, who is assigned, what is blocked, or what is next. | Answer grounded in the visible issue, project, or Week document, using human names for assignees/owners when Ship identity data is available. | Use the answer or ask a follow-up. |

## Phase 2: Graph Architecture

### Framework And Shape

FleetGraph uses LangGraph.js inside the existing `@ship/api` TypeScript service. This keeps auth, database access, OpenAPI registration, server events, SSE, and deployment inside the system that already owns Ship state.

The current implementation has one top-level compiled runtime, `fleetgraph.runtime`, in `api/src/fleetgraph/graph.ts`.

Implemented branches:

- `proactive_at_risk_week`: delegates to the at-risk Week detector graph.
- `ondemand_chat`: streams the on-demand chat model call from inside the shared graph branch.

The HTTP chat route still owns validation, auth, scope resolution, rate limiting, SSE headers, heartbeat, and abort cleanup. Once the response stream opens, the graph branch owns model streaming and tracing. This satisfies the PRD requirement that proactive and on-demand use the same graph architecture while preserving reliable HTTP behavior.

Implemented responsibility map:

- The top-level `fleetgraph.runtime` graph has `branch`, `proactive_at_risk_week`, and `ondemand_chat` nodes.
- Proactive triggers normalize poll and mutation inputs before entering the graph.
- The proactive branch delegates to the at-risk Week detector graph, whose implemented nodes are `scope`, `context`, `guard`, `preFilter`, `reason`, `policy`, and `output`.
- The chat route performs validation, authorization, scope resolution, context loading, people-name resolution, prompt construction, SSE setup, heartbeat, and abort cleanup before entering the graph.
- The on-demand branch streams the chat model response and tracing from inside the shared graph runtime.
- Approval, rejection, dismiss, snooze, and resume are FleetGraph API lifecycle operations. Resume currently executes approved `draft_comment` actions; it is not a separate LangGraph node in the submitted implementation.

Conditional graph branches include proactive quiet exit, changed-state proactive reasoning, pending-review finding persistence, and on-demand chat streaming. Human approval/resume is a durable API workflow attached to the graph output, not an in-graph interrupt/resume loop.

### State Management

Runtime graph state carries the graph name, selected mode, active/completed node metadata, the proactive detector state when the proactive branch runs, and the chat completion when the on-demand branch runs. The proactive detector state carries scope, fetched context, guard and pre-filter decisions, reasoning, policy, output, error state, and trace metadata. Approval decisions and resume executions are persisted through the FleetGraph lifecycle API, not stored as top-level runtime graph state.

Durable FleetGraph state is stored in dedicated Postgres tables:

- `fleetgraph_findings`
- `fleetgraph_action_candidates`
- `fleetgraph_approvals`
- `fleetgraph_suppressions`
- `fleetgraph_usage`
- `fleetgraph_action_executions`
- `fleetgraph_inbox_reads`
- `fleetgraph_finding_reads`

Current state boundary: transient graph execution state stays in process during a run. Durable outcomes, approvals, suppressions, usage, executions, and read state are persisted in Postgres.

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

Public deployment evidence is recorded in `FLEETGRAPH.md`: release `20260529-151518` was smoke-tested at `https://143.198.163.184.nip.io/` with login, inbox tabs, a trace-backed finding surface, and graph-routed Week chat.

### Trigger Model

FleetGraph uses a hybrid trigger model:

- Poll interval: `180_000ms` in `api/src/fleetgraph/triggers.ts`.
- Mutation debounce: `45_000ms` in `api/src/fleetgraph/triggers.ts`.
- Advisory locks prevent duplicate multi-instance work.
- Material-change keys and suppressions prevent duplicate findings and unnecessary model calls.
- Langfuse trace gating avoids exporting routine quiet poll exits while preserving local `fleetgraph_usage` rows for every run.
- The node telemetry exporter uses Langfuse's Observations API after trace capture, so the submission can point to concrete graph-node evidence rather than only run-level URLs.

This is the defensible tradeoff for the PRD:

- Polling catches time-based risks.
- Mutation hooks give low-latency response to user-visible changes.
- Guarding keeps model spend bounded.
- Trace gating keeps observability useful without overwhelming Langfuse limits.

### Performance And Cost

The PRD requires problem detection under 5 minutes from event appearing in Ship to agent surfacing it. The implementation has two evidence layers:

- Deterministic orchestration proof: `docs/fleetgraph-latency-proof.md` measured `45.113s` from mutation enqueue to persisted finding against the `300s` target.
- Live deployed trace evidence: `FLEETGRAPH.md` records a mutation-triggered finding run with `7.382s` graph latency in Langfuse metadata.
- Node-level telemetry evidence: `docs/evals/fleetgraph-node-telemetry.md` records Langfuse observation IDs, node names, branch metadata, token/cost fields, and latencies for every verified public FleetGraph trace.

Evidence boundary: the latency proof uses a deterministic local reasoner to isolate trigger/orchestration latency; the public droplet finding trace proves real-model graph execution latency. The submission does not claim a separate public-browser timed mutation for every use case.

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

- Formal V1 and V2 eval suites passed with 16 cases and 50 assertions; see `docs/evals/fleetgraph-v1-eval-report.md` and `docs/evals/fleetgraph-v2-eval-report.md`.
- Detection quality eval passed 14 / 14 live graph cases with public Langfuse traces; see `docs/evals/fleetgraph-detection-quality-eval.md`.
- Deterministic demo scenarios pass for quiet and finding paths.
- At-risk Week detector tests pass.
- Persistence tests pass.
- Focused FleetGraph API, OpenAPI, and demo-health tests pass.
- Focused FleetGraph web component and hook tests pass.
- API and web type-check/build passed during the latest polish pass.
- Full API regression passed with 61 test files and 669 tests.

Live trace evidence in `FLEETGRAPH.md`:

- Finding path trace.
- Quiet path trace.
- On-demand Week chat trace.
- On-demand issue chat trace proving person-name resolution from Ship identity data.
- Rubric trace matrix with one public Langfuse trace per detection-quality case, including use cases 3, 4, and 5.
- Node telemetry report with observation IDs for traceable graph nodes and model calls.

Local seed verification:

- Docker Postgres at `127.0.0.1:5433/ship_dev` has `Ship Workspace`.
- Seeded FleetGraph data includes the `FleetGraph MVP` program, FleetGraph projects and issues, open and pending-review findings, an action candidate, read state, and `fleetgraph_usage` rows.

## Current Submission Status

| Requirement | Status |
|-------------|--------|
| Graph running with proactive detection E2E | Implemented |
| Observability with at least two trace links | Captured in Langfuse; public finding, quiet, deployed chat, chat person-resolution, and the 15-row public trace matrix are recorded in `FLEETGRAPH.md` |
| `FLEETGRAPH.md` with responsibility and use cases | Present and current |
| Graph outline with nodes, edges, and branches | Present and current |
| Human-in-the-loop gate | Implemented in API and browser inbox |
| Running against real Ship data | Production and deployed-smoke paths use real Postgres Ship documents; detection-quality traces use controlled Ship-shaped golden contexts for repeatable edge-case coverage |
| Agent chat and notifications accessible in UI | Implemented |
| Deployed and publicly accessible | Public app URL documented and smoke-tested |
| Trigger model documented and defended | Present |
| Detection latency under 5 minutes | Passed deterministic proof; live trace latency metadata recorded |
| Cost per run and production estimates | Present |
| Same graph architecture for proactive and on-demand | Implemented through `fleetgraph.runtime` |
| Formal evals | V1, V2, and detection-quality live graph evals passed; reports committed under `docs/evals/` |

## Submission Evidence Notes

These notes define the submitted evidence boundary.

1. Public trace sharing is finalized for the current submission packet.
   - `FLEETGRAPH.md` records public Langfuse Cloud links for the finding path, quiet path, deployed on-demand Week chat path, current-code on-demand person-resolution chat path, and 14 detection-quality eval cases.
   - FleetGraph has an opt-in SDK path for selected public trace publication: set `FLEETGRAPH_PUBLIC_TRACE_EXPORT=true` and `LANGFUSE_PROJECT_ID`, then recapture the selected traces.
   - Public trace export calls Langfuse `setTraceAsPublic()` after trace materialization for immediate traces, records `tracePublic`, `traceId`, and `traceUrl` metadata when a project id is configured, and stays off outside submission windows.

2. Durable submitted state is in Postgres outcome tables.
   - Findings, action candidates, approvals, suppressions, usage, executions, inbox reads, and finding reads are persisted.
   - Transient graph execution state is not presented as a submitted durable artifact.

3. On-demand chat evidence is scoped answering plus person-name resolution.
   - `docs/evals/fleetgraph-chat-person-resolution.md` records a public chat trace where the graph answers with Alice Chen from Ship identity data instead of returning the assignee UUID.
   - The on-demand branch streams grounded answers through the shared graph.
   - Consequential Ship writes are demonstrated through the proactive finding approval flow.

4. Use cases 2-5 are represented as traced acceptance states in the flagship graph.
   - Stale blocker, missing progress, planless Week, and overload/scope-pressure each have detection-quality trace cases.

## Final Readiness Judgment

FleetGraph is substantially submission-ready from a code, documentation, deployment, and demo standpoint: proactive detection, guarded execution, durable findings, human review, embedded graph-routed chat, UI access, seed data, latency proof, trace evidence, and cost tracking are all present.

FleetGraph is ready for final submission packaging. Immediately before submitting, re-smoke the public app, confirm the public Langfuse URLs still open, and submit the correct branch/artifacts.
