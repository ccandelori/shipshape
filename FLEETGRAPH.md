# FleetGraph

A project-intelligence agent for Ship.

FleetGraph reads the state of a Ship project, reasons about what changed or what a user is asking, and turns that context into findings, next actions, approvals, and context-scoped answers. It is not a standalone chatbot and not just a detector service. It is a Ship-native agent loop with access to the same work graph and action surfaces that users operate through the UI.

## Agent Responsibility

FleetGraph has two modes that share Ship context, authorization, model configuration, and outcome policy concepts. The current MVP implementation is not fully unified into one compiled graph: proactive detection runs through LangGraph, while on-demand chat uses direct OpenAI token streaming with the same context builders.

### Proactive Mode

Proactive mode runs without a user present. It monitors Ship state and surfaces findings when a condition deserves attention.

The MVP proactive detector is an at-risk Week detector. In user-facing language this is a Week; in the database it is a Week document with `document_type: 'sprint'`.

FleetGraph monitors:

- Week documents and their computed date windows.
- Issues assigned to a Week, including state, assignee, priority, and stalled progress.
- Recent standups and blocker language.
- Sprint iteration records and blocker fields.
- Weekly plan and retro accountability status.
- Prior FleetGraph findings, suppressions, snoozes, and pending approvals.
- Project and program ownership context.

Conditions worth surfacing:

- A blocker has stayed unresolved long enough to affect the Week.
- A Week is nearing its end while important work is not moving.
- Assigned work has no recent standup or ownership signal.
- A Week has started without required planning or accountability context.
- Scope, issue count, or active work suggests overload relative to the Week.
- The same risk has materially changed since the last finding.

FleetGraph stays quiet when:

- The fetched state has not materially changed.
- Only low-value churn occurred.
- A human dismissed or snoozed the finding.
- A previous rejection still applies.
- Another instance is already processing the same project.
- A pending review is already open for that project.

### On-Demand Mode

On-demand mode runs when a user opens embedded FleetGraph chat in Ship. The chat is scoped to the document or entity the user is viewing.

On-demand mode reasons about:

- The current document type and id.
- The current project, program, and Week document context.
- Issues, standups, findings, and pending actions linked to that context.
- The user's question or requested action.
- The user's workspace permissions and action eligibility.

On-demand is not answer-only. The MVP can stream answers first, but the architecture supports action requests by producing draft actions or pending approvals rather than pretending chat cannot do work.

Implementation status as of 2026-05-26: MVP on-demand chat is implemented in `api/src/fleetgraph/chat.ts` and `api/src/routes/fleetgraph-chat.ts` as a direct OpenAI streaming path. It reuses FleetGraph context builders, workspace authorization, rate limits, SSE framing, and model configuration, but it is not yet a LangGraph node path. This is an intentional MVP deviation to preserve stable token streaming and avoid reworking chat abort, heartbeat, and SSE behavior during submission hardening.

### Autonomy Rules

FleetGraph can do these without approval:

- Read Ship state within the user's workspace.
- Summarize context.
- Rank risks.
- Produce findings.
- Produce private chat answers.
- Create draft action candidates.
- Mark a finding as seen by the current user.

FleetGraph requires confirmation before:

- Posting a comment or nudge visible to others.
- Creating or assigning an issue.
- Changing issue state.
- Updating ownership.
- Sending external notifications.
- Performing bulk edits.
- Taking any high-stakes or hard-to-reverse action.

FleetGraph must never do these automatically:

- Delete Ship content.
- Notify external systems such as email or Slack.
- Act across workspace boundaries.
- Resume a human-in-the-loop action for a user who is not an authorized recipient or workspace admin.

### Notification and Recipient Model

FleetGraph separates authorization from responsibility.

- `workspace_memberships` authorizes access and admin capability.
- `document_associations` locates documents in the program, project, and Week graph.
- Person documents and document properties identify responsible humans.
- Week owners, project owners, issue assignees, and explicit accountable roles determine recipients.

Default proactive recipients:

- Week owner for Week-level findings.
- Project owner for project-level findings.
- Issue assignee for issue-specific blockers.
- Workspace admin only for unresolved ownership or authorization-sensitive findings.

If FleetGraph cannot determine a responsible owner, it creates an ownership-unclear finding instead of notifying the entire workspace.

### Outcome Model

FleetGraph produces durable outcomes, not just generated prose.

```typescript
type ActionCandidate = {
  targetDocumentId: string;
  ownerUserId: string | null;
  roleReason: string;
  urgency: 'low' | 'medium' | 'high';
  evidence: string[];
  recommendedAction: string;
  approvalLevel: 'auto_answer' | 'quick_confirm' | 'explicit_approval';
  reversibility: 'easy' | 'hard';
};
```

Finding lifecycle:

- `open`
- `pending_review`
- `approved`
- `executed`
- `rejected`
- `dismissed`
- `snoozed`
- `expired`

The database-backed FleetGraph inbox is the source of truth. WebSocket `/events` only invalidates and refreshes the UI for live awareness.

## Graph Diagram

This diagram is the target agent architecture. The implemented Week 5 graph-backed path is the proactive at-risk Week detector. The on-demand branch is represented because it is the intended unification path, but the current MVP chat route streams directly through `api/src/fleetgraph/chat.ts`.

```mermaid
flowchart TD
    START((start)) --> trigger["normalize trigger + actor"]
    trigger --> scope["authorize workspace + resolve scope"]
    scope --> intent{mode / intent?}
    intent -->|proactive| detector["select detector / use case"]
    intent -->|on-demand| userIntent{question or action request?}

    detector --> context
    userIntent --> context
    context["build Ship context:<br/>program / project / Week doc / issues / standups / people"] --> fetch["parallel fetch:<br/>documents / activity / accountability / metrics"]
    fetch --> guard{"proactive guard:<br/>advisory lock + material change + suppression"}

    guard -->|quiet| ENDQ((quiet end))
    guard -->|changed| preFilter{"cheap OpenAI model:<br/>worth surfacing?"}
    userIntent -->|answer| reason
    userIntent -->|action request| reason
    preFilter -->|no| ENDQ
    preFilter -->|yes| reason["reason:<br/>finding + evidence + recommendation"]

    reason --> candidate["ActionCandidate:<br/>owner / urgency / evidence / target / approval level"]
    candidate --> policy{approval policy?}
    policy -->|auto answer / notify| output
    policy -->|approval required| pending["persist pending_review<br/>+ checkpoint thread_id"]
    pending --> approval["FleetGraph inbox:<br/>approve / edit / reject / dismiss / snooze"]
    approval --> resume["authorized resume:<br/>recipient or workspace admin"]
    resume --> execute["execute via Ship tools"]
    execute --> output

    output -->|proactive| persist["persist finding + reconcile inbox<br/>/events is best-effort"]
    output -->|on-demand| stream["SSE stream to embedded chat"]
    persist --> END((end))
    stream --> END
```

Trace paths required for validation:

- Proactive quiet exit: no material state change or suppressed finding.
- Proactive finding path: changed state, pre-filter passes, reasoning produces a finding, approval is requested.
- On-demand answer path: user asks a question and receives an SSE streamed answer through the direct MVP chat route.
- On-demand action path: target architecture; user asks for work, graph produces an action candidate or pending approval.

## Trace Links And Runtime Evidence

Shared Langfuse trace links are pending. As of 2026-05-26, the local shell has no `OPENAI_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, or `LANGFUSE_BASE_URL`, so live Langfuse capture cannot be completed from this environment.

Configured runtime sources:

- Local development: `api/.env.local` or `api/.env` loaded by `api/src/db/client.ts` and FleetGraph config.
- Local template: `api/.env.example` documents `OPENAI_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, `LANGFUSE_TRACING_ENVIRONMENT`, and `LANGFUSE_RELEASE`.
- Production SSM: `api/src/config/ssm.ts` loads `/ship/{env}/OPENAI_API_KEY`, `/ship/{env}/LANGFUSE_PUBLIC_KEY`, `/ship/{env}/LANGFUSE_SECRET_KEY`, and `/ship/{env}/LANGFUSE_BASE_URL`; `LANGFUSE_TRACING_ENVIRONMENT` and `LANGFUSE_RELEASE` are optional deployment env vars.
- FleetGraph config validation: `api/src/fleetgraph/config.ts` requires OpenAI and Langfuse connection settings before FleetGraph model paths run.

Local deterministic evidence:

| Scenario | Run id | Branch path | Result | Model tokens | Estimated cost | Evidence |
|----------|--------|-------------|--------|--------------|----------------|----------|
| Quiet pre-filter exit | `55555555-5555-4555-8555-555555555555` | `prefilter-exit` | No finding, no model call | 0 input / 0 output | `$0.000000` | `api/src/fleetgraph/demo-scenarios.test.ts` |
| Finding with pending action | `66666666-6666-4666-8666-666666666666` | `output` | Finding plus action candidate | 850 input / 172 output | `$0.000231` | `api/src/fleetgraph/demo-scenarios.test.ts` |

Verification run:

- `DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev ./node_modules/.bin/vitest run src/fleetgraph/demo-scenarios.test.ts src/fleetgraph/detectors/at-risk-week.test.ts src/fleetgraph/detectors/at-risk-week-persistence.test.ts`
- Result: 3 test files passed, 35 tests passed.
- Full API regression: `DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev pnpm --filter @ship/api test`
- Result: 56 test files passed, 623 tests passed.

## Use Cases

| # | Role | Trigger | Agent detects or produces | Human decides |
|---|------|---------|---------------------------|---------------|
| 1 | Director | A Week is near its end with important issues stalled or blocked. | At-risk Week finding with evidence, owner, severity, and suggested nudge or issue. | Approve nudge, edit action, reject, dismiss, or snooze. |
| 2 | PM / Week owner | A blocker remains unresolved across elapsed-time thresholds. | Stale blocker summary, duration, affected issues, owner, and next action. | Ask for update, create issue, accept risk, or suppress as known. |
| 3 | Engineer | Assigned work has no recent standup or progress signal. | Private reminder or draft standup prompt tied to the user's current work. | Post, edit, dismiss, or snooze. |
| 4 | PM | A Week starts without a plan or active work lacks hypothesis context. | Accountability finding linked to weekly plan and project hypothesis. | Create plan task, notify owner, or mark intentionally deferred. |
| 5 | Director / PM | Scope, issue count, or assignment load suggests overload. | Overload or scope-creep finding with evidence and tradeoff recommendation. | Rebalance work, accept risk, ask team for clarification, or defer. |
| 6 | Any user | User asks contextual chat what is blocked, risky, or next. | Answer scoped to the visible issue, project, or Week document. | Use the answer or ask for a follow-up. |
| 7 | Any user | User asks contextual chat to take action. | Draft action or pending approval using the same action model as proactive mode. | Approve, edit, reject, or leave as draft. |

MVP implementation scope:

- Use case 1 is the flagship end-to-end proactive detector.
- Use case 2 is adjacent to the flagship and should share the same data path.
- Use cases 3 to 5 are extension detectors.
- Use case 6 is MVP chat.
- Use case 7 is architected now; full execution can be staged after the answer path is stable.

## Trigger Model

Decision: hybrid trigger.

FleetGraph uses both:

- An in-process poll tick as the reliability floor.
- A debounced in-process event hook from Ship mutations as the low-latency path.

Why not poll-only:

- Poll-only is reliable but can waste model budget and may miss the five-minute latency target unless the interval is aggressive.
- A short poll interval over many active projects creates unnecessary reads and pre-filter calls.

Why not webhook-only:

- Some meaningful conditions are time-based and do not come from a row mutation.
- A blocker aging from one day to three days can be important even if no one edits anything.
- A Week approaching its end is time-based, not event-based.

Why hybrid:

- Event hooks make fresh changes visible quickly.
- Polling catches time-based risks and missed events.
- Change-detect, suppression, and pre-filtering keep cost bounded.

Default timing:

- Poll interval: about 3 minutes.
- Mutation debounce: 45 seconds.
- Target latency: well under 5 minutes for mutation-triggered risk; under one poll interval plus processing time for time-based risk.
- Local timed proof: `docs/fleetgraph-latency-proof.md` measured mutation commit to persisted finding at `45.113s` against the `300s` target.

Multi-instance behavior:

- Each Elastic Beanstalk instance may run the poll tick.
- A per-project non-blocking Postgres advisory lock is required before invoking the proactive graph.
- If another instance holds the lock, the current instance skips the project.
- Dedup protects persisted finding rows; the advisory lock protects model spend and action execution.

Headless authentication:

- MVP proactive runs execute inside the API process with scoped server-side database and service access.
- The agent does not impersonate a browser session.
- Future external triggers must use a server token or equivalent service credential.

## Test Cases

Shared trace links are not yet captured because Langfuse credentials are missing locally. The deterministic local evidence above verifies the two MVP proactive graph paths and usage metadata that the shared traces must show once credentials are available. The timed latency proof in `docs/fleetgraph-latency-proof.md` verifies the mutation-triggered path against the five-minute target using the real trigger controller, advisory lock, context builder, guard, graph, policy, and persistence path with a deterministic local reasoner.

| # | Ship state | Expected output | Required trace path | Trace link status |
|---|------------|-----------------|---------------------|------------------|
| 1 | Active Week has stalled high-priority issues and an unresolved blocker. | Open finding with severity, evidence, owner, and action candidate. | Proactive changed -> pre-filter yes -> reason -> pending approval. | Local deterministic run passed; shared Langfuse URL pending credentials. |
| 2 | Active Week has no blockers or high-priority blocked issues. | Quiet exit; no duplicate notification and no model reasoning call. | Proactive changed -> pre-filter no -> quiet end. | Local deterministic run passed; shared Langfuse URL pending credentials. |
| 3 | Same active Week is scanned again with a suppressing pending finding. | Quiet exit; no duplicate notification and no expensive reasoning call. | Proactive guard -> quiet end. | Guard suppression covered by detector tests; shared URL pending credentials. |
| 4 | Blocker crosses elapsed-time threshold without a row edit. | Finding resurfaces because elapsed-time signal changed. | Proactive changed -> pre-filter yes -> reason. | Extension case; not part of the two MVP traces. |
| 5 | User opens a Week document and asks, "What is blocking this?" | SSE streamed answer grounded in that Week's issues, standups, and findings. | On-demand answer -> reason -> stream. | Embedded chat implemented and E2E-covered; shared URL pending credentials. |
| 6 | User asks chat to create a follow-up item for a blocker. | Draft or pending action candidate scoped to the blocker and Week. | On-demand action request -> reason -> approval policy. | Architecture path documented; full execution staged after MVP. |
| 7 | Unauthorized user attempts to resume a pending action. | Resume denied; no action executed. | Resume auth guard rejects. | API route coverage implemented. |
| 8 | Two API instances tick the same project concurrently. | One instance acquires the advisory lock; exactly one graph run proceeds. | Proactive trigger -> advisory lock winner only. | Advisory lock controller covered by trigger tests. |

## Architecture Decisions

### Framework Choice

FleetGraph uses LangGraph.js embedded in `@ship/api`.

Rationale:

- Ship is a Node/TypeScript monorepo.
- The API already owns database access, auth, OpenAPI registration, and real-time events.
- A separate Python service would add deployment, auth, and data-access overhead that does not help the one-week delivery.
- LangGraph gives conditional execution, checkpointing, streaming, and human-in-the-loop support.

### Agent-Native Shape

FleetGraph is organized around three layers.

1. Ship domain layer:
   - Programs, projects, Week documents, issues, standups, plans, retros, people, ownership, and workspace membership.

2. Agent outcome layer:
   - Findings, action candidates, approvals, dismissals, snoozes, and context-scoped chat answers.

3. Execution layer:
   - Current MVP: a compiled LangGraph path for proactive at-risk Week detection plus a direct SSE path for on-demand chat.
   - Target architecture: one graph branches by trigger, intent, material change, suppression state, approval policy, and output surface.

This avoids the anti-pattern of building a detector service and bolting on a chatbot. The agent receives events, reasons with dynamic Ship context, calls primitive Ship tools, and persists visible outcomes.

### Node Design

- `trigger`: normalizes proactive ticks and mutation events in the current graph; on-demand chat turn normalization is a target graph node.
- `scope`: authorizes workspace access and resolves the relevant Ship document graph.
- `intent`: target node that separates proactive runs from on-demand question or action requests.
- `detector`: selects the proactive use-case family.
- `context`: builds a bounded Ship-native context bundle.
- `fetch`: pulls documents, issues, standups, accountability status, activity, and metrics in parallel.
- `guard`: applies advisory lock, material-change, dedup, pending-review, dismiss, snooze, and rejection checks.
- `preFilter`: uses a cheap model to decide whether unsolicited proactive analysis is worth deeper reasoning.
- `reason`: produces structured findings, evidence, recommendations, and action candidates.
- `policy`: classifies approval requirements from stakes and reversibility.
- `pending`: persists human-in-the-loop checkpoint state.
- `resume`: validates actor authorization and resumes approved, edited, or rejected actions.
- `execute`: calls Ship tools for approved actions.
- `output`: persists findings and broadcasts UI updates today; target graph output also streams on-demand chat responses.

### State Management

Graph state includes:

- `triggerType`
- `intent`
- `workspaceId`
- `actorUserId`
- `scope`
- fetched Ship context
- detector type
- material-change key
- candidate finding
- action candidate
- approval decision
- messages for on-demand chat

Durable state includes:

- LangGraph checkpointing currently uses `MemorySaver`; durable FleetGraph state is persisted in outcome tables. `PostgresSaver` remains the intended production checkpointer after credentialed deployment hardening.
- FleetGraph finding rows with `workspace_id`, `project_id`, `detector_type`, `content_hash`, status, severity, payload, recipient list, snooze state, and pending action metadata.
- Chat thread ids scoped as `chat:{userId}:{hash(docId)}` with a sliding message window.

### Agent Tool Parity

Every user-visible Ship action that FleetGraph might perform should have an agent-accessible primitive.

Read primitives:

- `read_current_context`
- `list_project_issues`
- `list_week_standups`
- `read_accountability_status`
- `list_open_findings`

Draft primitives:

- `create_draft_action`
- `draft_comment`
- `create_draft_issue`
- `rank_action_candidates`

Write primitives:

- `post_comment`
- `create_issue`
- `update_issue_state`
- `assign_issue`
- `dismiss_finding`
- `snooze_finding`
- `resume_approved_action`

These tools should call the same service layer and persistence paths the UI uses so agent changes are immediately visible through normal Ship queries.

### Human-in-the-Loop Design

Approval policy is based on stakes and reversibility.

| Action type | Approval policy |
|-------------|-----------------|
| Private answer or summary | Auto-answer |
| Risk finding with no write | Auto-notify |
| Draft comment or draft issue | Auto-draft |
| User-requested low-risk visible write | Quick confirm |
| Unsolicited visible write | Explicit approval |
| External notification | Explicit approval |
| Delete or bulk destructive action | Not allowed for MVP |

The confirmation experience lives in FleetGraph Inbox. Pending cards show:

- Finding summary.
- Severity.
- Evidence.
- Target document.
- Responsible owner.
- Proposed action.
- Approve, edit, reject, dismiss, and snooze controls.

Dismiss and snooze are durable suppression choices, not just UI state.

### Security and Trust Boundaries

- Every finding and action row includes `workspace_id`.
- Every read and write binds workspace.
- Cross-workspace ids are denied.
- HITL resume is allowed only for resolved recipients or workspace admins.
- Proactive runs use server-side service access and do not impersonate a user session.
- User-authored Ship content is untrusted LLM input.
- Prompts delimit source content and instruct the model not to treat it as instructions.
- Model output is structured, size-capped, and output-encoded before rendering.
- Human approval is the backstop for consequential actions.
- Write endpoints are not exposed as MCP tools unless per-tool actor authorization is available.

### Deployment Model

FleetGraph runs inside the existing API process on Elastic Beanstalk.

Runtime components:

- API routes for findings, resume, dismiss, snooze, and chat.
- In-process poll tick registered at API boot.
- Mutation hooks that enqueue affected project analysis.
- Existing `/events` channel for live UI invalidation.
- SSE endpoint for chat streaming.
- PostgreSQL for checkpoints and finding persistence.

Deployment constraints:

- EB can run multiple instances, so proactive runs require advisory locks.
- `/api/fleetgraph/chat` needs a non-buffered CloudFront behavior with compression disabled, or direct routing to EB, otherwise SSE may buffer.
- `/events` remains the best-effort live notification path; database-backed queries are authoritative.

### Error and Failure Handling

If Bedrock is unavailable:

- Proactive runs skip model-dependent reasoning and record no generated finding.
- On-demand chat returns a clear unavailable response instead of a 500.
- Health/status endpoints expose agent availability.

If Langfuse is unavailable:

- The graph still runs.
- Tracing degradation is reported separately.
- Required share links cannot be captured until Langfuse is restored.

If Ship data fetch fails:

- The run fails closed for writes.
- No partial action executes.
- Error messages include workspace, project, detector, and route context.

If HITL resume fails:

- The pending action remains pending or moves to an explicit failed state.
- No action executes without confirmed resume state.

## Cost Analysis

These are design estimates plus current deterministic implementation telemetry. Shared Langfuse traces should replace the local evidence rows once credentials are available.

### Cost Controls

Primary cost controls:

- Stage-1 deterministic change detection.
- Durable dedup keys and suppression TTL.
- Cheap-model proactive pre-filter.
- Expensive reasoning only for changed, unsuppressed, worth-surfacing states.
- Bounded context windows.
- Sliding chat history.
- Per-user chat rate limits.
- Advisory locks to avoid duplicate multi-instance model calls.

### Token Budget Per Invocation

| Invocation type | Expected model path | Budget assumption |
|-----------------|--------------------|------------------|
| Proactive quiet scan | No model | 0 model tokens |
| Proactive pre-filter only | Cheap OpenAI model | 2k input / 200 output |
| Proactive full finding | Cheap OpenAI model + reasoning model | 10k input / 1k output total |
| On-demand answer | OpenAI reasoning model | 8k input / 1k output |
| On-demand action request | OpenAI reasoning model, with possible approval draft | 10k input / 1.5k output |

### Production Projection Assumptions

- One project per 10 users.
- Three proactive scans per project per day from poll baseline.
- Two mutation-triggered proactive scans per project per day.
- Ten percent of proactive scans survive pre-filter.
- One on-demand invocation per user per day at 100 users.
- 0.7 on-demand invocations per user per day at 1,000 users.
- 0.4 on-demand invocations per user per day at 10,000 users.
- Average full proactive run cost target: under $0.08.
- Average on-demand run cost target: under $0.06.
- Most proactive scans should cost only database reads.

### Monthly Projection

| Scale | Estimated users/projects | Estimated model-bearing runs per day | Estimated monthly cost |
|-------|--------------------------|--------------------------------------|------------------------|
| 100 users | 100 users / 10 projects | About 106 | About $190/month |
| 1,000 users | 1,000 users / 100 projects | About 750 | About $1,350/month |
| 10,000 users | 10,000 users / 1,000 projects | About 4,500 | About $8,100/month |

These projections intentionally treat on-demand usage as the main cost driver. If proactive pre-filter survival rises above ten percent, cost must be re-estimated before broad rollout.

### Development and Testing Costs

Runtime model spend for the MVP at-risk Week detector is now persisted in `fleetgraph_usage` by graph run. Session-level development spend remains tracked in `FLEETGRAPH_TOKEN_SPEND.md`; append to that ledger at the end of every FleetGraph work session using OpenAI usage data or API response metadata.

| Item | Amount |
|------|--------|
| Quiet pre-filter run | 0 input / 0 output tokens, `$0.000000` |
| Finding path run | 850 input / 172 output tokens, `$0.000231` |
| Total deterministic graph invocations captured | 2 |
| Total deterministic graph spend captured | `$0.000231` |
| Shared Langfuse trace spend | Pending credentials |

## Submission Status

| Requirement | Status |
|-------------|--------|
| Agent Responsibility | Defined in this document |
| Graph Diagram | Defined in this document |
| Use Cases | Defined in this document |
| Trigger Model | Defined in this document |
| Test Cases | MVP proactive paths verified locally; shared trace links require Langfuse credentials |
| Architecture Decisions | Defined in this document |
| Cost Analysis | Design estimate plus deterministic runtime telemetry captured |
| Timed Latency Proof | Passed locally at 45.113 seconds; see `docs/fleetgraph-latency-proof.md` |
| On-Demand Graph Parity | Direct SSE chat is documented as an intentional MVP deviation; graph unification is deferred |
