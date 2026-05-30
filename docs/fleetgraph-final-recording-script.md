# FleetGraph Final Recording Script

Updated: 2026-05-29

Use this for dry runs and the final video. It is shorter than the full manual and assumes the public droplet is the recording target.

## Pre-Flight

Run this after deploy, before each dry run:

```bash
ssh ship@143.198.163.184 "sudo -n bash -lc 'set -a; source /etc/ship/env; set +a; cd /opt/ship/current/api; node dist/fleetgraph/scripts/demo-health.js --reset --app-url https://143.198.163.184.nip.io'"
```

**Trace Regeneration (Critical for Observability Proof)**

Before recording, follow the full **Capture & Verification Checklist** in `FLEETGRAPH.md`. At minimum:

1. Enable public trace export:
   ```bash
   export FLEETGRAPH_PUBLIC_TRACE_EXPORT=true
   export LANGFUSE_PROJECT_ID=<your-langfuse-project-id>
   ```

2. Regenerate key traces (especially the on-demand chat trace showing person name resolution):
   ```bash
   DATABASE_URL=... \
   LANGFUSE_PROJECT_ID=... \
   FLEETGRAPH_PUBLIC_TRACE_EXPORT=true \
   pnpm --filter @ship/api exec tsx src/fleetgraph/scripts/run-detection-quality-eval.ts --live --trace --strict
   ```

3. If you plan to mention person-name resolution, capture or refresh a chat trace with a question that asks who owns a blocker. Otherwise use the existing Week blocking trace.

4. Verify every trace you will show is public, review for PII, then turn the export flag off.

Open these tabs before recording. The Langfuse finding trace below is the current public proof trace; replace it only if you intentionally recapture a newer one and verify it is public.

| Tab | URL |
|---|---|
| Ship app | `https://143.198.163.184.nip.io/` |
| Week chat | `https://143.198.163.184.nip.io/documents/ae794fb3-2b32-449b-819f-34348d317295` |
| Issue comment | `https://143.198.163.184.nip.io/documents/27e15c1b-3f6c-4e1d-8880-15a5c5705459` |
| Meaty issue chat | Use the `Meaty issue for chat: Real-time collaboration merge conflicts under load` link printed by the pre-flight health command |
| Backup meaty issue chat | Use the `Meaty issue for chat: Week planning flow is confusing for first-time users` link printed by the pre-flight health command |
| Langfuse finding trace | `https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b0fb54c7f46e28c96d1eaa531fc89d0d` |

Login:

```text
dev@ship.local
admin123
```

Confirm before recording:

- `/health` returns 200.
- FleetGraph inbox opens from the left rail icon above Settings.
- The **Open** tab has one visible finding.
- The **Needs Review** tab has the HITL finding.
- The Week page and the meaty issue page both have the **Ask FleetGraph** pill.
- All chosen Langfuse tabs are already loaded (never search live during recording).

## Five-Minute Storyboard

### 0:00-0:25 - Set The Frame

Screen: Ship app after login.

Say:

> Ship already has the work graph: programs, projects, Weeks, issues, standups, and docs. FleetGraph is an agent inside that graph. It pushes reviewable findings, and it answers questions in the document you are already viewing.

### 0:25-1:20 - Inbox And Findings

Action:

1. Click the FleetGraph icon on the left rail, above Settings.
2. Show the **Open** tab.
3. Point at severity, evidence, and target document.
4. Click **Dismiss**, enter `Handled in standup`, confirm.

Say:

> This is the proactive side. The agent creates durable findings with evidence, but the human controls whether a finding is dismissed, snoozed, approved, or executed.

### 1:20-2:10 - HITL Write Path

Action:

1. Switch to the **Needs Review** tab.
2. Click **Approve** on the pending finding.
3. Switch to **Approved**.
4. Click **Resume**.
5. Switch to the issue comment tab and hard refresh.
6. Scroll to the bottom and show the FleetGraph comment.

Say:

> This is the important safety line: FleetGraph can propose a visible write, but it does not post until a person approves and resumes it. After approval, the write lands as normal Ship content.

If the comment is already present from a prior dry run, say:

> I reset this before recording, but this tab already has the completed result from the same approval flow.

### 2:10-3:35 - On-Demand Chat Through The Shared Graph

Action:

1. Switch to the Week chat tab, or the meaty issue chat tab if you want a more concrete issue-level answer.
2. Click **Ask FleetGraph** if the chat panel is closed.
3. Ask one question. For the Week tab:

```text
What is blocking this week, who owns recovery, and what should we do next?
```

For the real-time collaboration issue:

```text
Summarize the blocker, who owns it, and what acceptance criteria still need proof.
```

For the Week planning issue:

```text
Who owns this issue, why is it at risk, and what is the smallest demoable recovery plan?
```

4. Wait for streaming to start.

Say:

> This is pull mode. The chat is scoped to the document I am viewing, and it now enters the same compiled FleetGraph LangGraph runtime as the proactive path.

Do not stay here too long. Once the answer clearly streams and cites Week context, move on.

### 3:35-4:20 - Observability

Action:

1. Switch to the Langfuse trace tab.
2. Show branch metadata, observations, token usage, and latency.

Say:

> This is the audit trail for an agent run: branch taken, model input and output, tokens, latency, and resulting finding metadata. Routine quiet poll exits are gated so observability stays useful without flooding Langfuse.

### 4:20-4:50 - Eval Evidence

Screen: Stay on Langfuse or switch back to Ship.

Say:

> The repo also has deterministic V1 and V2 eval gates: V1 covers the core agent paths, and V2 covers guardrails like dedup suppression, advisory locks, trace export gating, redaction, chat history bounding, rate limits, and safe trace URLs. Together they pass 16 cases and 50 assertions.

Do not open terminal in the main recording unless asked. The files are:

- `docs/evals/fleetgraph-v1-eval-report.md`
- `docs/evals/fleetgraph-v2-eval-report.md`

### 4:50-5:00 - Close

Say:

> FleetGraph is not a side chatbot. It is a Ship-native agent loop: real work graph, proactive detection, shared graph runtime for chat, human approval for visible writes, observability, cost controls, and evals that prove the guardrails.

## If Something Breaks

| Problem | Fast recovery |
|---|---|
| Inbox is empty | Run the pre-flight reset command and refresh. |
| Needs Review item is gone | It was approved in a dry run; run reset, then refresh. |
| Comment is missing | Approve from **Needs Review**, then resume from **Approved**, then hard-refresh issue. |
| Chat pill is hidden | Widen the browser or collapse the left document tree. |
| Chat send stalls | Hard-refresh the Week tab and try once; otherwise switch to Langfuse. |
| Langfuse trace asks for login | Use the trace already opened in your logged-in Langfuse session. |

## Submission Proof Checklist

- Public app: `https://143.198.163.184.nip.io/`
- Public traces: listed in `FLEETGRAPH.md`
- Eval reports: `docs/evals/`
- Main docs: `FLEETGRAPH.md`, `PRESEARCH.md`, `docs/fleetgraph-submission-readiness-audit.md`
- Full API regression last recorded: 61 files, 669 tests
