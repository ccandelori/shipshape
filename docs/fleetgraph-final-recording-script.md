# FleetGraph Final Recording Script

Updated: 2026-05-30

Use this for the final dry run and recording. The target is the public droplet.

## What This Demo Must Prove

Lead with the product, but make the grading fixes visible:

- FleetGraph is inside Ship, not a standalone chatbot.
- Proactive findings and on-demand chat now enter the same compiled `fleetgraph.runtime` LangGraph.
- Visible writes are human-gated through approve/resume before Ship comments are posted.
- The submitted six use cases have public trace links, not "covered by tests" placeholders.
- Langfuse traces show branch paths, node telemetry, token counts, costs, and model output.
- Quiet poll exits are no longer sprayed into Langfuse; only useful runs are exported.
- Chat resolves people by name from Ship identity data instead of exposing raw UUIDs.
- The demo has rich issue context, acceptance criteria, comments, and source chips so chat has something real to discuss.
- `/my-week` no longer traps the presenter in a dead-end "Failed to load week data" state.

## Current Submission Target

| Item | Value |
|---|---|
| Public app | `https://143.198.163.184.nip.io/` |
| Demo login | `dev@ship.local` / `admin123` |
| Backup recipient login | `henry.patel@ship.local` / `admin123` |
| Last verified deploy | release `20260530-183403`, commit `65ec41b6ff4e348265c37c695df124dd1cb0f4bc` |
| Health URL | `https://143.198.163.184.nip.io/health` |
| Week chat document | `https://143.198.163.184.nip.io/documents/ae794fb3-2b32-449b-819f-34348d317295` |
| HITL comment issue | `https://143.198.163.184.nip.io/documents/27e15c1b-3f6c-4e1d-8880-15a5c5705459` |
| Finding trace | `https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b0fb54c7f46e28c96d1eaa531fc89d0d` |
| Quiet trace | `https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/144ea791af91486a3a83f102f52856c0` |
| Week chat trace | `https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b2624ad3010625d9f91ce4945404e758` |
| Person-name chat trace | `https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b71ea0bc51bf7e600d2443d7586de209` |

## Pre-Flight Reset

Run this before each dry run. It resets only demo FleetGraph artifacts, not the whole workspace.

```bash
ssh ship@143.198.163.184 "sudo -n bash -lc 'set -a; source /etc/ship/env; set +a; cd /opt/ship/current/api; node dist/fleetgraph/scripts/demo-health.js --reset --app-url https://143.198.163.184.nip.io'"
```

After it finishes, copy the printed links for:

- `Meaty issue for chat: Real-time collaboration merge conflicts under load`
- `Meaty issue for chat: Week planning flow is confusing for first-time users`

Those are stronger chat targets than a sparse Week overview because they include descriptions, comments, owners, acceptance criteria, and clear blockers.

## Browser Tabs To Open Before Recording

Use a full-width Brave window. Log in once, then open:

| Tab | Page | Why |
|---|---|---|
| 1 | Ship app root | Start point and FleetGraph inbox. |
| 2 | HITL comment issue | Shows the approved/resumed agent write. |
| 3 | Real-time collaboration issue | Best chat demo target; rich blocker and acceptance criteria. |
| 4 | Week 14 document | Backup chat target and broader Week context. |
| 5 | Langfuse finding trace | Proves proactive model path. |
| 6 | Langfuse quiet trace or person-name trace | Proves branch difference or name resolution. |

Confirm before recording:

- `https://143.198.163.184.nip.io/health` returns 200.
- `/my-week` loads, or at least shows recovery actions instead of a dead-end error.
- FleetGraph inbox opens from the lower-left rail icon above Settings.
- `Needs Review` contains a pending HITL finding.
- `Approved` is available after approving the pending finding.
- The `Ask FleetGraph` pill appears on issue and Week documents.
- The meaty issue chat can send and returns source-linked text.
- Langfuse trace tabs are already loaded. Do not search live.

## Five-Minute Recording

### 0:00-0:25 - Frame The Product

Screen: Ship after login.

Say:

> Ship already has the work graph: programs, projects, Weeks, issues, standups, comments, and docs. FleetGraph sits inside that graph. It has push mode for proactive findings and pull mode for document-scoped chat.

Then add the grading fix plainly:

> The important architecture fix since the first submission is that both modes now enter the same compiled FleetGraph LangGraph runtime.

### 0:25-1:20 - FleetGraph Inbox

Action:

1. Click the FleetGraph icon on the lower-left rail.
2. Show the lifecycle tabs: `Open`, `Needs Review`, `Approved`.
3. Point out the badge counts and unread/new state.
4. On `Open`, show a finding with severity, evidence, action, and trace/cost summary.

Say:

> This is the proactive side. FleetGraph produces durable findings with evidence and telemetry. The tabs are the human review queue: open triage, needs review, and approved-but-not-yet-resumed actions.

Optional if you need a quick interaction:

1. Click `Dismiss`.
2. Enter `Handled in standup`.
3. Confirm.

Say:

> Dismiss and snooze are how a reviewer suppresses noise instead of letting the agent repeat itself.

### 1:20-2:15 - Human-Gated Write

Action:

1. In the inbox, click `Needs Review`.
2. Click `Approve` on the pending finding.
3. Click `Approved`.
4. Click `Resume`.
5. Switch to the HITL comment issue tab.
6. Hard refresh if needed.
7. Scroll to the bottom of the main document body.
8. Show the `Dev User` comment beginning with "Please add the shared Langfuse trace URLs..."

Say:

> This is the safety line. FleetGraph can draft a visible write, but it does not post until a human approves and resumes it. After resume, the action lands as normal Ship content, here as an issue comment.

Do not say this comment came from the open inbox card. It comes from the `pending_review` HITL finding.

### 2:15-3:35 - On-Demand Chat In The Same Graph

Preferred screen: `Real-time collaboration merge conflicts under load`.

Action:

1. Click `Ask FleetGraph`.
2. Paste:

```text
Summarize the blocker, who owns it, and what acceptance criteria still need proof.
```

3. Click `Send`.
4. Wait for streaming to begin.
5. Point at the owner name, issue-specific blocker, acceptance criteria, and source chip.

Say:

> This is pull mode. The chat is scoped to the issue I am viewing, and it runs through the same `fleetgraph.runtime` graph branch as the proactive detector. The answer is grounded in this Ship document and its linked context, including comments and acceptance criteria.

If you use the Week instead, ask:

```text
What is blocking this week, who owns recovery, and what should we do next?
```

If you use the Week planning issue instead, ask:

```text
Who owns this issue, why is it at risk, and what is the smallest demoable recovery plan?
```

### 3:35-4:25 - Observability And Trace Matrix

Action:

1. Switch to the Langfuse finding trace.
2. Show branch path, observations, model generation, token counts, cost, and latency.
3. Optionally switch to quiet trace or person-name trace.

Say:

> This is the audit trail for the agent run: branch path, node observations, model input/output, tokens, cost, latency, and finding metadata. The final packet also has one public trace per submitted use case, plus node telemetry extracted from Langfuse observations.

If showing quiet trace:

> Quiet paths are intentionally different: no generation observation, zero model tokens, and no finding.

If showing person-name trace:

> This trace demonstrates the chat fix where FleetGraph resolves user IDs into human names before the model answers.

### 4:25-4:50 - Evals And Guardrails

Screen: Stay on Langfuse or switch back to Ship.

Say:

> The repo has deterministic V1 and V2 eval gates. V1 covers the flagship agent paths: quiet exit, finding creation, shared graph chat, source grounding, HITL policy, and fail-closed unsupported scope. V2 covers production guardrails: material-change dedup, advisory locks, opt-in public trace export, redaction, chat history bounds, rate limits, and safe trace URLs.

Then one sentence on trace evidence:

> The PRD trace matrix is separate from those regression reports: six submitted use cases map to public Langfuse links, and the supporting matrix has fifteen public trace rows.

### 4:50-5:00 - Close

Say:

> FleetGraph is now a Ship-native agent loop: real work graph, shared LangGraph runtime, proactive detection, document-scoped chat, HITL for visible writes, public observability, cost controls, and evals that protect the guardrails.

## What To Draw Attention To If Asked

| Topic | What to say |
|---|---|
| Early submission gap | "The first version had chat streaming directly through OpenAI. Now chat enters the compiled `fleetgraph.runtime` graph with `mode: ondemand_chat`." |
| Use case evidence | "There are six submitted use cases and every one has a public trace in `FLEETGRAPH.md`." |
| More than two traces | "The final packet includes a 15-row public trace matrix, not just the required pair." |
| Better tracing | "Langfuse public export is opt-in and selected. Routine quiet polls are kept in local usage rows without flooding Langfuse." |
| Human names | "The chat context includes a server-built people map, so answers can say Alice Chen or Grace Lee instead of UUIDs." |
| Meaty data | "The demo issues include descriptions, comments, owners, and acceptance criteria so the agent has real context to reason over." |
| `/my-week` fix | "The dashboard route now recovers cleanly instead of leaving the user trapped on a blank error." |
| Submission evidence | "`FLEETGRAPH.md` is the source of truth: quick start, graph diagram, use cases, trace matrix, evals, cost, and deployment evidence." |

## Dry-Run Checklist

Run one full dry run without recording:

1. Reset demo state with the SSH command.
2. Open all six tabs.
3. Log in with `dev@ship.local`.
4. Open FleetGraph inbox.
5. Approve and resume one `Needs Review` item.
6. Confirm the comment appears on the HITL comment issue.
7. Ask the meaty issue chat question.
8. Confirm the answer names an owner and shows a source chip.
9. Open Langfuse finding trace.
10. Practice the close without opening terminal.

If anything fails, reset once and repeat. If the same thing fails twice, do not improvise in the recording; switch to the pre-opened trace and narrate the verified evidence.

## Failure Recovery

| Problem | Recovery |
|---|---|
| Inbox empty | Run the pre-flight reset command and refresh. |
| `Needs Review` empty | Reset; it was probably approved during rehearsal. |
| `Resume` says unsupported action | Pick the seeded `draft_comment` finding, not another finding type. |
| Comment not visible | Hard refresh the issue and scroll the main body; there is no comments tab. |
| Chat send button disabled | The text may be placeholder text; click the input and type the question manually. |
| Chat stalls | Hard refresh once; if it still stalls, show the pre-opened Langfuse chat trace. |
| Langfuse asks for login | Use the already-opened Langfuse session, or use the public trace URL from `FLEETGRAPH.md`. |
| `/my-week` fails | Use the recovery buttons; this path is no longer a dead-end. For the demo, use document URLs for chat. |

## Submission Packet Pointers

- Main source of truth: `FLEETGRAPH.md`
- Presearch: `PRESEARCH.md`
- Readiness audit: `docs/fleetgraph-submission-readiness-audit.md`
- Final script: `docs/fleetgraph-final-recording-script.md`
- Deterministic evals: `docs/evals/fleetgraph-v1-eval-report.md`, `docs/evals/fleetgraph-v2-eval-report.md`
- PRD trace matrix: `docs/evals/fleetgraph-detection-quality-eval.md`
- Node telemetry: `docs/evals/fleetgraph-node-telemetry.md`
- Public trace verification: `docs/evals/fleetgraph-public-trace-verification.json`

## Last Verification Notes

- Public app health verified on 2026-05-30: `200 OK`.
- Live Brave smoke verified login, `/my-week`, FleetGraph inbox, issue chat popover, send, streaming answer, owner name, and source chip.
- Targeted web tests passed for `MyWeekPage.test.tsx` and `FindingsInbox.test.tsx`.
- Full API regression was last re-run at 62 files / 675 tests passing under the documented V1 database URL.
