# FleetGraph

A project-intelligence agent for Ship.

FleetGraph reads the state of a Ship project, reasons about what changed or what a user is asking, and turns that context into findings, next actions, approvals, and context-scoped answers. It is not a standalone chatbot and not just a detector service. It is a Ship-native agent loop with access to the same work graph and action surfaces that users operate through the UI.

## Grader Quick Start

Use this block for the final walkthrough and submission review.

| Item | Value |
|------|-------|
| Public app | `https://143.198.163.184.nip.io/` |
| Demo login | `dev@ship.local` / `admin123` |
| Live finding recipient login | `henry.patel@ship.local` / `admin123` |
| Week document for chat | `https://143.198.163.184.nip.io/documents/ae794fb3-2b32-449b-819f-34348d317295` |
| Issue with FleetGraph comment | `https://143.198.163.184.nip.io/documents/27e15c1b-3f6c-4e1d-8880-15a5c5705459` |
| Finding path trace | [Public Langfuse trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b0fb54c7f46e28c96d1eaa531fc89d0d) |
| Quiet path trace | [Public Langfuse trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/144ea791af91486a3a83f102f52856c0) |
| Chat trace | [Public Langfuse trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b2624ad3010625d9f91ce4945404e758) |
| Demo script | `docs/fleetgraph-5-minute-demo-script.md` |
| Final recording cue card | `docs/fleetgraph-final-recording-script.md` |
| Latency proof | `docs/fleetgraph-latency-proof.md` |
| Deterministic eval reports | `docs/evals/fleetgraph-v1-eval-report.md`, `docs/evals/fleetgraph-v2-eval-report.md` |
| PRD readiness audit | `docs/fleetgraph-submission-readiness-audit.md` |

The Langfuse links above were captured from the deployed droplet on 2026-05-28 and verified through the Langfuse API with `public: true`. Langfuse is the observability provider for this submission; it satisfies the PRD's shared trace requirement by exposing the same run tree, branch metadata, model usage, token counts, and public trace URLs that the PRD requested from LangSmith. FleetGraph keeps public trace export opt-in because public links expose prompt, context, and run metadata to anyone with the URL.

Deployed smoke status, 2026-05-29 3:16 PM CDT: release `20260529-151518` is live on the public droplet. `/health` returns HTTP 200 over both the droplet HTTP route and `https://143.198.163.184.nip.io/health`; `dev@ship.local` login works in Brave; FleetGraph inbox tabs render with Needs Review counts; and the Week chat opens from the `Ask FleetGraph` pill with source-linked context through the shared FleetGraph graph.

## Agent Responsibility

FleetGraph has two modes that now enter the same compiled LangGraph runtime. The top-level `fleetgraph.runtime` graph branches by mode: proactive at-risk Week detection delegates to the existing detector graph, while on-demand chat executes its token streaming model call inside the on-demand graph branch. The HTTP route still owns request validation, auth, rate limiting, SSE framing, heartbeat, and abort cleanup.

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
- Another instance is already processing the same project scope.
- An open, snoozed, dismissed, or pending-review finding already exists for the same scoped document and material-change key.

### On-Demand Mode

On-demand mode runs when a user opens embedded FleetGraph chat in Ship. The chat is scoped to the document or entity the user is viewing.

On-demand mode reasons about:

- The current document type and id.
- The current project, program, and Week document context.
- Issues, standups, findings, and pending actions linked to that context.
- The user's question.
- The user's workspace permissions.

The prompt context supplied to the model for on-demand chat includes a server-derived `people` map (user ID to `{name, email}`) for every `ownerUserId`, `assigneeUserId`, and `authorUserId` present in the scoped documents and activity. The model is explicitly instructed to use the human name from this map and to emit an explicit "unknown person (id)" form when no record exists. Newly captured on-demand chat trace contexts include `personResolution: 'applied'` metadata; the known/unknown mapping behavior is covered by `api/src/fleetgraph/chat-runner.test.ts`.

The submitted on-demand scope is context-scoped answering. Consequential Ship writes are demonstrated through the proactive finding approval flow.

Implementation status as of 2026-05-29: on-demand chat is routed through `api/src/fleetgraph/graph.ts` with `mode: 'ondemand_chat'`. The route prepares the authorized prompt context before opening SSE so it can still return normal HTTP errors for invalid scope or missing model configuration. Once streaming starts, the compiled graph branch owns Langfuse tracing and model token streaming through the same FleetGraph runtime entry point used by proactive mode.

### Autonomy Rules

FleetGraph can do these without approval:

- Read Ship state within the user's workspace.
- Summarize context.
- Rank risks.
- Produce findings.
- Produce private chat answers.
- Create action candidates attached to proactive findings.
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
- Person documents and the users table (with server-resolved names supplied to on-demand chat prompts) identify responsible humans.
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

This diagram shows the submitted shared runtime. The implemented graph-backed paths are proactive at-risk Week detection and on-demand chat streaming.

```mermaid
flowchart TD
    START((start)) --> trigger["normalize trigger + actor"]
    trigger --> scope["authorize workspace + resolve scope"]
    scope --> intent{mode / intent?}
    intent -->|proactive| detector["select detector / use case"]
    intent -->|on-demand| userIntent["context question"]

    detector --> context
    userIntent --> context
    context["build Ship context:<br/>program / project / Week doc / issues / standups / people"] --> fetch["parallel fetch:<br/>documents / activity / accountability / metrics"]
    fetch --> guard{"proactive guard:<br/>advisory lock + material change + suppression"}

    guard -->|quiet| ENDQ((quiet end))
    guard -->|changed| preFilter{"deterministic pre-filter:<br/>worth surfacing?"}
    userIntent --> reason
    preFilter -->|no| ENDQ
    preFilter -->|yes| reason["reason:<br/>finding + evidence + recommendation"]

    reason --> candidate["ActionCandidate:<br/>owner / urgency / evidence / target / approval level"]
    candidate --> policy{approval policy?}
    policy -->|auto answer / notify| output
    policy -->|approval required| pending["persist pending_review<br/>+ action metadata"]
    pending --> approval["FleetGraph inbox:<br/>approve / edit / reject / dismiss / snooze"]
    approval --> resume["authorized resume:<br/>recipient or workspace admin"]
    resume --> execute["execute approved write<br/>(draft_comment today)"]
    execute --> output

    output -->|proactive| persist["persist finding + reconcile inbox<br/>/events is best-effort"]
    output -->|on-demand| stream["SSE stream to embedded chat"]
    persist --> END((end))
    stream --> END
```

Trace paths required for validation:

- Proactive quiet exit: no material state change or suppressed finding.
- Proactive finding path: changed state, pre-filter passes, reasoning produces a finding; policy decides whether it is notify-only or pending review.
- On-demand answer path: user asks a question, enters the shared `fleetgraph.runtime` graph with `mode: 'ondemand_chat'`, and receives an SSE streamed answer from the graph's chat branch.

## Trace Links And Runtime Evidence

FleetGraph emits Langfuse traces from both proactive and on-demand graph branches. As of 2026-05-28, the public droplet has captured public Langfuse Cloud traces for the MVP finding path, quiet path, and on-demand chat path. Public sharing remains an explicit approval step because traces include prompt/context metadata.

Configured runtime sources:

- Local development: `api/.env.local` or `api/.env` loaded by `api/src/db/client.ts` and FleetGraph config.
- Local template: `api/.env.example` documents `OPENAI_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, optional `LANGFUSE_PROJECT_ID`, `LANGFUSE_TRACING_ENVIRONMENT`, `LANGFUSE_RELEASE`, and opt-in `FLEETGRAPH_PUBLIC_TRACE_EXPORT`.
- Production SSM: `api/src/config/ssm.ts` loads `/ship/{env}/OPENAI_API_KEY`, `/ship/{env}/LANGFUSE_PUBLIC_KEY`, `/ship/{env}/LANGFUSE_SECRET_KEY`, and `/ship/{env}/LANGFUSE_BASE_URL`; `LANGFUSE_TRACING_ENVIRONMENT` and `LANGFUSE_RELEASE` are optional deployment env vars.
- FleetGraph config validation: `api/src/fleetgraph/config.ts` requires OpenAI and Langfuse connection settings before FleetGraph model paths run.
- Public trace export: `api/src/fleetgraph/langfuse.ts` publishes only selected FleetGraph traces when `FLEETGRAPH_PUBLIC_TRACE_EXPORT=true`. `LANGFUSE_PROJECT_ID` is optional but required for FleetGraph to construct a clickable `traceUrl`; without it the trace is still made public and the trace id is recorded in Langfuse metadata/logs. Public export is turned on only during submission/demo capture windows.

Live droplet evidence:

| Scenario | Trace | Branch path | Result | Model tokens | Estimated cost | Runtime evidence |
|----------|-------|-------------|--------|--------------|----------------|------------------|
| Finding path | [Public Langfuse trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b0fb54c7f46e28c96d1eaa531fc89d0d) | `output` | Finding `8cf63756-2cc0-428c-9488-7c3306130760` persisted with `notify_only` policy | 1135 input / 157 output | `$0.000264` | Created from deployed mutation-triggered run `5e814f55-35f6-4fdf-80d3-1533dc0c386e`; latency target met at `7.382s` graph latency. |
| Quiet pre-filter exit | [Public Langfuse trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/144ea791af91486a3a83f102f52856c0) | `prefilter-exit` | No finding and no model generation observations | 0 input / 0 output | `$0.000000` | Mutation-triggered run `1ad1925a-5d18-45e9-abd3-baa46a5a2ccd`; pre-filter exited in `447.004ms`. |
| On-demand Week chat | [Public Langfuse trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b2624ad3010625d9f91ce4945404e758) | `ondemand_chat` | SSE answer grounded in Week 14 and linked issues | 2043 input / 120 output | Captured in trace metadata | Generated by deployed `/api/fleetgraph/chat` against Week `ae794fb3-2b32-449b-819f-34348d317295`. |

Local deterministic evidence:

| Scenario | Run id | Branch path | Result | Model tokens | Estimated cost | Evidence |
|----------|--------|-------------|--------|--------------|----------------|----------|
| Quiet pre-filter exit | `55555555-5555-4555-8555-555555555555` | `prefilter-exit` | No finding, no model call | 0 input / 0 output | `$0.000000` | `api/src/fleetgraph/demo-scenarios.test.ts` |
| Finding with pending action | `66666666-6666-4666-8666-666666666666` | `output` | Finding plus action candidate | 850 input / 172 output | `$0.000231` | `api/src/fleetgraph/demo-scenarios.test.ts` |

Deterministic eval suites:

| Command | Result | Report |
|---------|--------|--------|
| `DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev pnpm fleetgraph:eval` | V1: 8 cases / 24 assertions passed; V2: 8 cases / 26 assertions passed | `docs/evals/fleetgraph-v1-eval-report.md`, `docs/evals/fleetgraph-v2-eval-report.md`, and matching JSON files |
| `DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev LANGFUSE_PROJECT_ID=cmpmytg8s012vad0g8q19n2xv FLEETGRAPH_PUBLIC_TRACE_EXPORT=true pnpm fleetgraph:quality-eval -- --live --trace --strict` | Detection quality: 14 cases / 14 passed, one public Langfuse trace per case | `docs/evals/fleetgraph-detection-quality-eval.md`, `docs/evals/fleetgraph-detection-quality-eval.json` |

The V1 and V2 eval suites are deterministic pre-submit gates, not replacements for public Langfuse traces. V1 verifies the same high-risk behaviors graders probe: quiet proactive exit, finding/action creation, on-demand chat entering the compiled `fleetgraph.runtime` graph, prompt/source grounding, HITL policy, proactive graph branch parity, and fail-closed unsupported chat scope. V2 hardens the proof layer with material-change stability, duplicate suppression, advisory lock serialization, opt-in trace export, Langfuse redaction, chat history bounding, chat rate limiting, and safe trace URL construction.

Verification run:

- `DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev pnpm --filter @ship/api exec vitest run src/fleetgraph/context.test.ts src/fleetgraph/chat-runner.test.ts src/routes/fleetgraph-chat.test.ts src/fleetgraph/graph.test.ts src/fleetgraph/detectors/at-risk-week.test.ts`
- Result: 5 test files passed, 60 tests passed.
- Full API regression: `DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev pnpm --filter @ship/api test`
- Result: 61 test files passed, 669 tests passed.

## Use Cases

The six rows below are the submitted, trace-backed use cases.

| # | Role | Trigger | Agent detects or produces | Human decides |
|---|------|---------|---------------------------|---------------|
| 1 | Director | A Week is near its end with important issues stalled or blocked. | At-risk Week finding with evidence, owner, severity, and suggested nudge or issue. | Approve nudge, edit action, reject, dismiss, or snooze. |
| 2 | PM / Week owner | A blocker remains unresolved across elapsed-time thresholds. | At-risk Week finding with stale-blocker evidence, duration, affected issues, owner, and next action. | Ask for update, create issue, accept risk, or suppress as known. |
| 3 | Engineer | Assigned work has no recent standup or progress signal. | At-risk Week finding with evidence calling out missing progress on assigned work. | Dismiss, snooze, approve a proposed visible action when one exists, or follow up manually. |
| 4 | PM | A Week starts without a plan or active work lacks hypothesis context. | At-risk Week finding with missing-plan/accountability evidence linked to weekly plan and project hypothesis. | Create plan task, notify owner, or mark the risk intentionally accepted. |
| 5 | Director / PM | Scope, issue count, or assignment load suggests overload. | At-risk Week finding with overload or scope-pressure evidence and tradeoff recommendation. | Rebalance work, accept risk, ask team for clarification, or defer. |
| 6 | Any user | User asks contextual chat what is blocked, risky, or next. | Answer scoped to the visible issue, project, or Week document. | Use the answer or ask for a follow-up. |

MVP implementation scope:

- Use case 1 is the flagship end-to-end proactive detector.
- Use cases 2 to 5 are implemented as risk patterns in the at-risk Week graph's context and reasoning path, then validated by live model traces in the detection quality eval suite. They share the flagship graph, policy, output, usage, and trace path rather than separate detector modules.
- Use case 6 is context-scoped chat.

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

- Each API instance in a multi-instance deployment may run the poll tick.
- A per-project non-blocking Postgres advisory lock is required before invoking the proactive graph.
- If another instance holds the lock, the current instance skips the project.
- Dedup protects persisted finding rows; the advisory lock protects model spend and action execution.

Headless authentication:

- MVP proactive runs execute inside the API process with scoped server-side database and service access.
- The agent does not impersonate a browser session.
- Future external triggers must use a server token or equivalent service credential.

## Test Cases

**How we closed the observability gap.** The early submission had trace holes. The final submission does not use test-only coverage as a substitute for required observability evidence. The table below is the grader-facing trace matrix: every row has a public Langfuse trace URL, and the 14-case detection-quality report has one public trace per case. V1/V2 deterministic evals remain regression gates for guards, policy, history bounding, redaction, and rate limits, but this section only lists trace-backed evidence.

## Submission Test Cases - Public Trace Matrix

| # | Acceptance area / use case | Eval case | Ship state | Expected output | Public trace |
|---|----------------------------|-----------|------------|-----------------|--------------|
| 1 | Quiet path / cost control | DQ-Q01 | Healthy Week with no blocker or blocked high-priority issue. | Pre-filter exits quietly with zero model spend. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/395191121a1a47b757c1e4e9f3b3917c) |
| 2 | Quiet path / active but unblocked work | DQ-Q02 | Active work mentions "no blockers." | No false finding. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/48ac10eb11261f4a8342c9b5fe2bfcd8) |
| 3 | Quiet path / low-priority blocker | DQ-Q03 | Low-priority blocked item has a positive update. | No escalation for non-critical risk. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/0fb30befcc3a0c29aa67e6d3e7827f03) |
| 4 | Quiet path / resolved blocker language | DQ-Q04 | Latest standup says prior blocker is resolved or unblocked. | No false positive from the word "block." | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/ff8a06791454ec137635c93b52844061) |
| 5 | Quiet path / high volume but moving | DQ-Q05 | Many items are active with recent progress signals. | No overload finding. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/92847024ef62d15c2dc714a0ce759a19) |
| 6 | UC1: at-risk Week | DQ-R01 | High-priority blocker plus explicit blocker standup. | Finding with evidence, severity, recipient, and pending action candidate. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/eedcf0102dddb9def28bb663ea1d066a) |
| 7 | At-risk Week / stalled issues | DQ-R02 | Multiple important issues have no recent updates. | Finding calls out stalled high-priority work. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/3912dc4e3ecf5a17aa88af5afc5e40d0) |
| 8 | UC5: overload / scope pressure | DQ-R03 | One owner carries many high-priority items and says work is slipping. | Finding recommends a human-gated recovery action. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/efad6941fb67264083fb252ee89af120) |
| 9 | UC2: stale blocker | DQ-R04 | Aging technical blocker near Week end. | Finding resurfaces unresolved risk with escalation context. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/9e459de6a80456442218e628441d4b9c) |
| 10 | UC4: missing plan / accountability | DQ-R05 | No weekly plan exists while important work stalls. | Finding ties risk to missing accountability context. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/c9ef7e6b82d2ec366c45b04e42c92758) |
| 11 | UC3: no recent progress signal | DQ-R06 | Critical-path work is silent while other work continues. | Finding calls out missing progress signal on assigned work. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/afe6fce1844efe9340e4c6d6e8b06058) |
| 12 | Iteration blocker coverage | DQ-R07 | Iteration records a blocker without matching standup coverage. | Finding uses iteration evidence. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/de9cab014f1d332186c0b62e06448d9f) |
| 13 | Quiet path / old blocker resolved | DQ-Q06 | Old blocker is explicitly marked resolved in the latest standup. | No stale false positive. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/f18a74a9a5befc21b2d97bcd30c1c64f) |
| 14 | Critical-path silence | DQ-R08 | Critical-path items are silent across multiple standups. | Finding calls out repeated missing progress signal. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/40a2a18b8cfdc3ffcad3d80dc5414306) |
| 15 | UC6: context-scoped on-demand chat | Deployed chat trace | User asks what is blocking the visible Week. | SSE answer is grounded in scoped Week issues and sources. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b2624ad3010625d9f91ce4945404e758) |

Full live trace report: `docs/evals/fleetgraph-detection-quality-eval.md` contains all 14 golden detection-quality cases (14/14 passed on 2026-05-29). Every trace URL was verified through the Langfuse API with `public: true`.

## V1 Acceptance Eval Evidence Mapping

This table maps the original V1 eval identifiers to their current public runtime evidence. When a case intentionally fails before graph/model execution, the expected result is no Langfuse graph trace; those cases are backed by the deterministic V1 report and called out explicitly rather than presented as model-observed traces.

| V1 case | Behavior | Evidence |
|---|---|---|
| `FG-EVAL-001` | Healthy Week exits quietly before model reasoning. | [DQ-Q01 public trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/395191121a1a47b757c1e4e9f3b3917c), branch `prefilter-exit`, 0 input / 0 output tokens. |
| `FG-EVAL-002` | Blocked Week produces a finding and pending action. | [DQ-R01 public trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/eedcf0102dddb9def28bb663ea1d066a), branch `output`. |
| `FG-EVAL-003` | On-demand chat uses the compiled FleetGraph graph branch. | [Deployed chat public trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b2624ad3010625d9f91ce4945404e758), branch `ondemand_chat`. |
| `FG-EVAL-004` | Week chat prompt stays grounded in scoped Ship sources. | [Deployed chat public trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b2624ad3010625d9f91ce4945404e758) plus `docs/evals/fleetgraph-v1-eval-report.md` source-label assertions. |
| `FG-EVAL-005` | Notify-only recommendations do not create pending actions. | [Public finding trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b0fb54c7f46e28c96d1eaa531fc89d0d) showing `notify_only` policy, plus `docs/evals/fleetgraph-v1-eval-report.md` policy assertions. |
| `FG-EVAL-006` | Visible writes require explicit HITL approval. | [DQ-R01 public trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/eedcf0102dddb9def28bb663ea1d066a), pending action candidate path. |
| `FG-EVAL-007` | Proactive detector enters the compiled FleetGraph graph branch. | [DQ-R02 public trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/3912dc4e3ecf5a17aa88af5afc5e40d0), proactive at-risk Week branch. |
| `FG-EVAL-008` | Unsupported chat scopes fail closed before model execution. | `docs/evals/fleetgraph-v1-eval-report.md`; no Langfuse graph trace is emitted by design because the request is rejected before graph entry. |

## Capture & Verification Checklist

Use this checklist before every dry run or final submission recording:

**1. Pre-flight health**
```bash
# On the droplet (or local after deploy)
ssh ship@<droplet> "sudo -n bash -lc 'set -a; source /etc/ship/env; set +a; cd /opt/ship/current/api; node dist/fleetgraph/scripts/demo-health.js --reset --app-url https://<your-url>'"
```

**2. Enable public trace export (short window only)**
```bash
# On the API process
export FLEETGRAPH_PUBLIC_TRACE_EXPORT=true
export LANGFUSE_PROJECT_ID=<your-langfuse-project-id>
# Restart or hot-reload the API, then run the commands below
```

**3. Regenerate key live traces (recommended order)**
```bash
# Full high-signal matrix (14 cases, one public trace each)
DATABASE_URL=... \
LANGFUSE_PROJECT_ID=... \
FLEETGRAPH_PUBLIC_TRACE_EXPORT=true \
pnpm --filter @ship/api exec tsx src/fleetgraph/scripts/run-detection-quality-eval.ts --live --trace --strict

# Targeted chat trace that demonstrates person name resolution
# (open a Week or Issue document and ask in Ask FleetGraph)
# "Who owns the main blocker?" or "Who is responsible for the highest priority issue?"
```

**4. Verify every trace you will show**
- Open each URL in Langfuse.
- Confirm it is marked `public: true`.
- Confirm it contains branch path, token counts, and model output.
- Review the prompt/context for any PII before leaving it public.
- Turn `FLEETGRAPH_PUBLIC_TRACE_EXPORT` back off after capture.

**5. Update all references**
- `FLEETGRAPH.md` (both tables above)
- `docs/fleetgraph-5-minute-demo-script.md`
- `docs/fleetgraph-final-recording-script.md`
- Any slide or demo notes

**6. Final smoke before recording**
- `/health` returns 200
- FleetGraph inbox shows findings
- Ask FleetGraph pill is visible on a Week document
- All chosen Langfuse tabs are already loaded (never search live during recording)

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
   - One top-level compiled LangGraph runtime with branches for proactive at-risk Week detection and on-demand chat streaming.

This avoids the anti-pattern of building a detector service and bolting on a chatbot. The agent receives events, reasons with dynamic Ship context, persists visible outcomes, and calls the approved write primitive available in the MVP.

### Node Design

- `trigger`: normalizes proactive ticks and mutation events; the chat route normalizes on-demand request/auth/scope before invoking the graph.
- `scope`: authorizes workspace access and resolves the relevant Ship document graph.
- `intent`: separates proactive runs from on-demand questions through the top-level `fleetgraph.runtime` branch.
- `detector`: selects the proactive use-case family.
- `context`: builds a bounded Ship-native context bundle (on-demand chat paths now include a server-resolved people name map with explicit unknown handling).
- `fetch`: pulls documents, issues, standups, accountability status, activity, and metrics in parallel.
- `guard`: applies advisory lock, material-change, dedup, pending-review, dismiss, snooze, and rejection checks.
- `preFilter`: uses a cheap deterministic signal filter to decide whether unsolicited proactive analysis is worth deeper model reasoning.
- `reason`: produces structured findings, evidence, recommendations, and action candidates.
- `policy`: classifies approval requirements from stakes and reversibility.
- `pending`: persists human-in-the-loop finding state and action candidate metadata.
- `resume`: validates actor authorization and resumes approved, edited, or rejected actions.
- `execute`: calls the supported Ship write primitive for approved actions (`draft_comment` today).
- `output`: persists findings and broadcasts UI updates on proactive paths; the implemented on-demand branch streams chat responses over SSE from inside the shared graph runtime.

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

- Durable FleetGraph state is persisted in Postgres outcome tables. The graph runtime keeps transient execution checkpoints in process; user-visible findings, approvals, suppressions, usage, action executions, inbox reads, and finding reads are database-backed.
- FleetGraph finding rows with `workspace_id`, `project_id`, `detector_type`, `content_hash`, status, severity, payload, recipient list, snooze state, and pending action metadata.
- Chat memory is client-side and scoped by workspace, user, document type, and document id with a bounded sliding message window.

### Implemented Action Surface

FleetGraph's submitted write execution is intentionally narrow: approved `draft_comment` actions plus finding lifecycle operations such as dismiss, snooze, approve, reject, resume, read, and unread.

Read primitives:

- `read_current_context`
- `list_project_issues`
- `list_week_standups`
- `read_accountability_status`
- `list_open_findings`

Draft primitives:

- `create_draft_action`
- `draft_comment`
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
- Approve, reject, dismiss, and snooze controls.

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

FleetGraph runs inside the existing API process. The architecture supports Elastic Beanstalk-style multi-instance deployment, while the current public submission is deployed on the droplet at `https://143.198.163.184.nip.io/`.

Runtime components:

- API routes for findings, resume, dismiss, snooze, and chat.
- In-process poll tick registered at API boot.
- Mutation hooks that enqueue affected project analysis.
- Existing `/events` channel for live UI invalidation.
- SSE endpoint for chat streaming.
- PostgreSQL for durable FleetGraph outcomes, read state, finding persistence, and action execution records.

Deployment constraints:

- Multi-instance deployments can run multiple poll ticks, so proactive runs require advisory locks.
- `/api/fleetgraph/chat` needs a non-buffered proxy path for SSE. On CloudFront/EB this means compression disabled for that behavior; on the droplet the nginx route must avoid response buffering.
- `/events` remains the best-effort live notification path; database-backed queries are authoritative.

### Error and Failure Handling

If OpenAI is unavailable:

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

- The action remains non-executed and the API returns an explicit error.
- No visible write executes without confirmed resume state.

## Cost Analysis

These are design estimates plus current deterministic implementation telemetry. Public Langfuse traces complement the local evidence rows; the local rows remain deterministic baselines that can be regenerated without live model access.

### Cost Controls

Primary cost controls:

- Stage-1 deterministic change detection.
- Durable dedup keys and suppression TTL.
- Deterministic proactive pre-filter.
- Expensive reasoning only for changed, unsuppressed, worth-surfacing states.
- Bounded context windows.
- Sliding chat history.
- Per-user chat rate limits.
- Advisory locks to avoid duplicate multi-instance model calls.

### Token Budget Per Invocation

| Invocation type | Expected model path | Budget assumption |
|-----------------|--------------------|------------------|
| Proactive quiet scan | No model | 0 model tokens |
| Proactive pre-filter exit | No model; deterministic signal filter | 0 model tokens |
| Proactive full finding | OpenAI reasoning model after deterministic pre-filter passes | 10k input / 1k output total |
| On-demand answer | OpenAI reasoning model | 8k input / 1k output |

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
| Live finding trace spend | 1135 input / 157 output tokens, `$0.000264` |
| Live chat trace spend | 2043 input / 120 output tokens, captured in Langfuse trace metadata |

## Submission Status

| Requirement | Status |
|-------------|--------|
| Agent Responsibility | Defined in this document |
| Graph Diagram | Defined in this document |
| Use Cases | Six trace-backed use cases defined in this document |
| Trigger Model | Defined in this document |
| Test Cases | V1 and V2 deterministic eval suites passed; public droplet traces plus 14-case detection-quality trace matrix captured |
| Architecture Decisions | Defined in this document |
| Cost Analysis | Design estimate plus deterministic runtime telemetry captured |
| Timed Latency Proof | Passed locally at 45.113 seconds; see `docs/fleetgraph-latency-proof.md` |
| On-Demand Graph Parity | Implemented: on-demand chat enters the same compiled `fleetgraph.runtime` LangGraph as proactive detection; the route still owns auth, validation, rate limiting, and SSE framing |
