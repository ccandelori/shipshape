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
| Deployed Week chat trace | [Public Langfuse trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b2624ad3010625d9f91ce4945404e758) |
| Chat person-name trace | [Public Langfuse trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b71ea0bc51bf7e600d2443d7586de209) |
| Demo script | `docs/fleetgraph-5-minute-demo-script.md` |
| Final recording cue card | `docs/fleetgraph-final-recording-script.md` |
| Latency proof | `docs/fleetgraph-latency-proof.md` |
| Deterministic eval reports | `docs/evals/fleetgraph-v1-eval-report.md`, `docs/evals/fleetgraph-v2-eval-report.md` |
| PRD readiness audit | `docs/fleetgraph-submission-readiness-audit.md` |

The deployed finding, quiet, and Week chat Langfuse links above were captured from the public droplet on 2026-05-28 and verified through the Langfuse API with `public: true`. The chat person-name trace was captured on 2026-05-29 from current code against seeded Ship data to prove that on-demand chat resolves assignee ids to human names. Langfuse is the observability provider for this submission; it satisfies the PRD's shared trace requirement by exposing the same run tree, branch metadata, model usage, token counts, and public trace URLs that the PRD requested from LangSmith. FleetGraph keeps public trace export opt-in because public links expose prompt, context, and run metadata to anyone with the URL.

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

The submitted write path requires confirmation before:

- Posting a comment or nudge visible to others through an approved `draft_comment` action.
- Resuming any pending human-in-the-loop action.

FleetGraph must never do these automatically:

- Delete Ship content.
- Create or assign an issue.
- Change issue state.
- Update ownership.
- Notify external systems such as email or Slack.
- Perform bulk edits.
- Take any high-stakes or hard-to-reverse action.
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

Current-code chat evidence:

| Scenario | Trace | Branch path | Result | Model tokens | Runtime evidence |
|----------|-------|-------------|--------|--------------|------------------|
| On-demand issue chat with person resolution | [Public Langfuse trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b71ea0bc51bf7e600d2443d7586de209) | `ondemand_chat` | Answer resolves the assigned user as Alice Chen instead of returning the assignee UUID. | 570 input / 8 output | Generated by `pnpm fleetgraph:capture-chat-trace` against seeded issue `3f2dfdad-cad5-47ad-8aea-0858be19c8b2`; report: `docs/evals/fleetgraph-chat-person-resolution.md`. |

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
| `pnpm fleetgraph:node-telemetry` | Node-level telemetry exported from Langfuse Observations API for every verified public trace | `docs/evals/fleetgraph-node-telemetry.md`, `docs/evals/fleetgraph-node-telemetry.json` |

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
| 1 | Director | A Week is near its end with important issues stalled or blocked. | At-risk Week finding with evidence, owner, severity, and suggested next step. | Approve a comment/nudge, reject, dismiss, or snooze. |
| 2 | PM / Week owner | A technical blocker remains unresolved as the Week approaches its end. | At-risk Week finding with stale-blocker evidence, affected issue, owner, and escalation context. | Ask for update, follow up manually, accept risk, or suppress as known. |
| 3 | Engineer | Assigned high-priority work has no recent standup or progress signal while other work continues. | At-risk Week finding with evidence calling out missing progress on assigned work. | Dismiss, snooze, approve a proposed visible action when one exists, or follow up manually. |
| 4 | PM | A Week has no weekly plan document while high-priority work has stalled. | At-risk Week finding with missing-plan/accountability evidence linked to weekly plan and project context. | Follow up with the owner or mark the risk intentionally accepted. |
| 5 | Director / PM | A single owner is assigned a high volume of high-priority items with visible overload signals. | At-risk Week finding with overload or scope-pressure evidence and tradeoff recommendation. | Rebalance work, accept risk, ask team for clarification, or defer. |
| 6 | Any user | User asks contextual chat who owns work, who is assigned, what is blocked, or what is next. | Answer scoped to the visible issue, project, or Week document, using human names for assignees/owners when Ship identity data is available. | Use the answer or ask for a follow-up. |

MVP implementation scope:

- Use case 1 is the flagship end-to-end proactive detector.
- Use cases 2 to 5 are represented as explicit acceptance states for stale blockers, missing progress, missing planning/accountability, and overload/scope pressure; each state has a live model trace in the detection-quality eval suite.
- Use case 6 is context-scoped chat, including server-side person-name resolution from Ship identity data.

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

Timed evidence boundary:

- The `45.113s` proof is an orchestration latency proof over real local Ship Postgres data, production trigger debounce, production guards, production persistence, and a deterministic local reasoner. It intentionally does not measure OpenAI or Langfuse provider latency.
- The deployed finding trace in the Grader Quick Start is a public droplet run with a real model call and `7.382s` graph latency metadata.
- The submission does not claim that every documented use case was reproduced as a separate browser stopwatch run on the public droplet; rows 1-14 in the trace matrix are controlled live-model graph runs, while the droplet traces prove the public deployment path.

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

**How we closed the observability gap.** The early submission had trace holes. The final submission does not use test-only coverage as a substitute for required observability evidence. The per-use-case table below is the grader-facing map: each row corresponds to exactly one submitted use case, states the Ship state under test, states what FleetGraph produced, and links the public trace for that state.

Rows 1-14 in the supporting trace matrix are live OpenAI + Langfuse graph runs against controlled Ship-shaped golden contexts from `api/src/fleetgraph/evals/detection-quality-cases.ts`. They prove deterministic pre-filter behavior and reasoning branch behavior under the acceptance states that implement use cases 1-5. Row 15 is a live on-demand chat execution against seeded Ship data that proves the chat branch injects a server-derived people map and the model emits a human name instead of a UUID. The Grader Quick Start deployed traces at the top of this file provide additional real-document evidence from the public droplet.

Strictness boundary: the detection-quality live eval status gates the pre-filter decision and final finding/no-finding decision for each case. It records severity, branch path, trace URL, and model output for review, but exact lifecycle/policy contracts are enforced by the deterministic policy and route tests unless a matrix row explicitly names lifecycle behavior.

## Per-Use-Case Trace Map

| Use case | Ship state | Agent output | Public trace |
|----------|------------|--------------|--------------|
| UC1: at-risk Week | High-priority blocked issue plus blocker standup evidence. | Finding with evidence, severity, Week owner, and pending action candidate. | [DQ-R01](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/eedcf0102dddb9def28bb663ea1d066a) |
| UC2: stale blocker | Technical blocker that has remained unresolved as the Week approaches its end. | Finding resurfaces unresolved risk with escalation context. | [DQ-R04](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/9e459de6a80456442218e628441d4b9c) |
| UC3: no recent progress signal | Assigned high-priority work has no recent standup or progress signal while other work continues. | Finding calls out missing progress signal on assigned work. | [DQ-R06](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/afe6fce1844efe9340e4c6d6e8b06058) |
| UC4: missing plan/accountability | Week has no weekly plan document while high-priority work has stalled. | Finding ties risk to missing accountability context. | [DQ-R05](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/c9ef7e6b82d2ec366c45b04e42c92758) |
| UC5: overload/scope pressure | Single owner is assigned a high volume of high-priority items with visible overload signals. | Finding recommends a human-gated recovery action. | [DQ-R03](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/efad6941fb67264083fb252ee89af120) |
| UC6: context-scoped on-demand chat | User asks who owns or is assigned to the visible issue or blocker. | Chat response uses resolved human names from the server-supplied people map, e.g. "Alice Chen," rather than raw user ids or UUIDs. | [Chat person-name trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b71ea0bc51bf7e600d2443d7586de209) |

## Submission Test Cases - Public Trace Matrix

| # | Acceptance area / use case | Eval case | State under test | Expected output | Public trace |
|---|----------------------------|-----------|------------|-----------------|--------------|
| 1 | Quiet path / cost control | DQ-Q01 | Healthy Week with no blocker or blocked high-priority issue. | Pre-filter exits quietly with zero model spend. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/395191121a1a47b757c1e4e9f3b3917c) |
| 2 | Quiet path / active but unblocked work | DQ-Q02 | Active work mentions "no blockers." | No false finding. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/48ac10eb11261f4a8342c9b5fe2bfcd8) |
| 3 | Quiet path / low-priority blocker | DQ-Q03 | Low-priority blocked item has a positive update. | No escalation for non-critical risk. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/0fb30befcc3a0c29aa67e6d3e7827f03) |
| 4 | Quiet path / resolved blocker language | DQ-Q04 | Latest standup says prior blocker is resolved or unblocked. | No false positive from the word "block." | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/ff8a06791454ec137635c93b52844061) |
| 5 | Quiet path / high volume but moving | DQ-Q05 | Many items are active with recent progress signals. | No overload finding. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/92847024ef62d15c2dc714a0ce759a19) |
| 6 | UC1: at-risk Week | DQ-R01 | High-priority blocker plus explicit blocker standup. | Finding with evidence, severity, Week owner, and pending action candidate. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/eedcf0102dddb9def28bb663ea1d066a) |
| 7 | At-risk Week / stalled issues | DQ-R02 | Multiple important issues have no recent updates. | Finding calls out stalled high-priority work. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/3912dc4e3ecf5a17aa88af5afc5e40d0) |
| 8 | UC5: overload / scope pressure | DQ-R03 | Single owner is assigned a high volume of high-priority items with visible overload signals. | Finding recommends a human-gated recovery action. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/efad6941fb67264083fb252ee89af120) |
| 9 | UC2: stale blocker | DQ-R04 | Technical blocker has remained unresolved as the Week approaches its end. | Finding resurfaces unresolved risk with escalation context. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/9e459de6a80456442218e628441d4b9c) |
| 10 | UC4: missing plan / accountability | DQ-R05 | No weekly plan document exists while high-priority work has stalled. | Finding ties risk to missing accountability context. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/c9ef7e6b82d2ec366c45b04e42c92758) |
| 11 | UC3: no recent progress signal | DQ-R06 | Assigned high-priority work has no recent standup or progress signal while other work continues. | Finding calls out missing progress signal on assigned work. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/afe6fce1844efe9340e4c6d6e8b06058) |
| 12 | Iteration blocker coverage | DQ-R07 | Iteration records a blocker without matching standup coverage. | Finding uses iteration evidence. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/de9cab014f1d332186c0b62e06448d9f) |
| 13 | Quiet path / old blocker resolved | DQ-Q06 | Old blocker is explicitly marked resolved in the latest standup. | No stale false positive. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/f18a74a9a5befc21b2d97bcd30c1c64f) |
| 14 | Critical-path silence | DQ-R08 | Critical-path items are silent across multiple standups. | Finding calls out repeated missing progress signal. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/40a2a18b8cfdc3ffcad3d80dc5414306) |
| 15 | UC6: context-scoped on-demand chat | Chat person-name trace | User asks who owns or is assigned to the visible issue. | Chat answer uses Alice Chen from Ship identity data instead of returning the UUID. | [Langfuse](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b71ea0bc51bf7e600d2443d7586de209) |

Full live trace report: `docs/evals/fleetgraph-detection-quality-eval.md` contains all 14 golden detection-quality cases (14/14 passed on 2026-05-29). Every trace URL was verified through the Langfuse API with `public: true`; see `docs/evals/fleetgraph-public-trace-verification.json`.

The public submission matrix has 15 rows: 14 detection-quality graph traces plus one on-demand chat person-resolution trace.

Concrete node telemetry: `docs/evals/fleetgraph-node-telemetry.md` is generated from Langfuse's Observations API. It lists each public trace URL plus concrete observation IDs for the graph nodes and model observations inside that trace, including `scope`, `context`, `guard`, `preFilter`, `reason`, `policy`, `output`, and `fleetgraph.chat.response` where present. Langfuse public sharing is trace-level, so child node rows use the shared public trace URL plus observation IDs rather than separate child-observation public URLs.

V1 and V2 deterministic eval reports are regression gates, not the PRD trace matrix. They verify guard, policy, source-grounding, history-window, rate-limit, and redaction behavior that should fail before model execution or does not require model reasoning.

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

# Concrete graph-node telemetry from the public trace matrix
# Requires LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY, and LANGFUSE_SECRET_KEY.
pnpm fleetgraph:node-telemetry

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
- LangGraph gives conditional execution and streaming primitives. FleetGraph persists user-visible outcomes in Postgres and keeps transient execution checkpoints in process for this submission.

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

- `resume_approved_draft_comment`
- `approve_action`
- `reject_action`
- `dismiss_finding`
- `snooze_finding`
- `mark_finding_read`
- `mark_finding_unread`

These primitives call the same service layer and persistence paths the UI uses so FleetGraph changes are immediately visible through normal Ship queries.

### Human-in-the-Loop Design

Approval policy is based on stakes and reversibility.

| Action type | Approval policy |
|-------------|-----------------|
| Private answer or summary | Auto-answer |
| Risk finding with no write | Auto-notify |
| Draft comment action candidate | Explicit approval before visible write |
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

Runtime model spend for the MVP at-risk Week detector is persisted in `fleetgraph_usage` by graph run and summarized below. Development-session spend is documented separately in `FLEETGRAPH_TOKEN_SPEND.md`; the Codex desktop sessions used for this work did not expose per-session billing or token exports into the repo, so that ledger records only available tool telemetry rather than fabricated totals.

| Item | Amount |
|------|--------|
| Quiet pre-filter run | 0 input / 0 output tokens, `$0.000000` |
| Finding path run | 850 input / 172 output tokens, `$0.000231` |
| Total deterministic graph invocations captured | 2 |
| Total deterministic graph spend captured | `$0.000231` |
| Live finding trace spend | 1135 input / 157 output tokens, `$0.000264` |
| Live chat trace spend | 2043 input / 120 output tokens, about `$0.000378` |
| Live chat person-resolution trace spend | 570 input / 8 output tokens, about `$0.000090` |

## Submission Status

| Requirement | Status |
|-------------|--------|
| Agent Responsibility | Defined in this document |
| Graph Diagram | Defined in this document |
| Use Cases | Six trace-backed use cases defined in this document |
| Trigger Model | Defined in this document |
| Test Cases | V1 and V2 deterministic eval suites passed; public droplet traces plus 15-row public trace matrix captured |
| Architecture Decisions | Defined in this document |
| Cost Analysis | Design estimate plus deterministic runtime telemetry captured |
| Timed Latency Proof | Passed locally at 45.113 seconds; see `docs/fleetgraph-latency-proof.md` |
| On-Demand Graph Parity | Implemented: on-demand chat enters the same compiled `fleetgraph.runtime` LangGraph as proactive detection; the route still owns auth, validation, rate limiting, and SSE framing |
