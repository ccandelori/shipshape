# FleetGraph Submission Readiness Audit

Date: 2026-05-28  
Source PRD: `/Users/sheep/Desktop/Gauntlet/Week 5 GFA - FleetGraph PRD.pdf`  
Assessed source of truth: `codex/fleetgraph-guided-polish` worktree at `/private/tmp/ship-fleetgraph-awesome`

This audit compares the current FleetGraph implementation and documentation against the original Week 5 PRD. It is intentionally blunt: if a row is not green, it needs either a fix or an explicit submission note before tonight.

## Verdict

FleetGraph is submission-ready from an engineering and documentation standpoint with one packaging caveat:

- The Langfuse trace URLs in `FLEETGRAPH.md` are real deployed traces, but currently documented as authenticated project links. If graders are not Langfuse project members, make the selected traces public in Langfuse Cloud or recapture them with `FLEETGRAPH_PUBLIC_TRACE_EXPORT=true` before final submission.

No architectural rebuild is needed. The original grading issue - on-demand chat bypassing the compiled graph - is fixed in `api/src/fleetgraph/graph.ts` and `api/src/routes/fleetgraph-chat.ts`.

## PRD MVP Checklist

| PRD requirement | Current status | Evidence | Submission action |
|---|---|---|---|
| Graph running with at least one proactive detection wired end-to-end | Pass | `api/src/fleetgraph/detectors/at-risk-week.ts`, `api/src/fleetgraph/proactive-runner.ts`, `api/src/fleetgraph/triggers.ts`, `api/src/routes/fleetgraph.ts` | None |
| Observability tracing enabled with at least two shared trace links showing different paths | Conditional pass | `FLEETGRAPH.md` lists finding, quiet, and chat Langfuse traces | Recapture with SDK public export, make traces public manually, or grant reviewer Langfuse project access |
| `FLEETGRAPH.md` with Agent Responsibility and at least 5 use cases | Pass | `FLEETGRAPH.md` defines responsibilities and 7 use cases | None |
| Graph outline with node types, edges, branching conditions | Pass | `FLEETGRAPH.md` Mermaid diagram; `docs/fleetgraph-graph-explainer.html` | None |
| At least one human-in-the-loop gate | Pass | `api/src/fleetgraph/policy.ts`, `api/src/routes/fleetgraph.ts`, inbox `Needs Review` and `Approved` tabs | None |
| Running against real Ship data; no mocked production responses | Pass | Context builders read Postgres Ship documents/issues/standups; seed and live data use real tables | Keep demo clear when using seeded rows versus live traces |
| Agent chat and notifications accessible in UI | Pass | `web/src/components/FleetGraph/*`, `web/src/components/Editor.tsx`, `web/src/pages/App.tsx` | None |
| Deployed and publicly accessible | Pass | `https://143.198.163.184.nip.io/` and `/health` returned HTTP 200 on 2026-05-28 | Re-smoke immediately before submitting |
| Trigger model documented and defended | Pass | `FLEETGRAPH.md` and `PRESEARCH.md` hybrid trigger section | None |

## PRD Performance Checklist

| PRD metric | Current status | Evidence | Submission action |
|---|---|---|---|
| Problem detection latency under 5 minutes | Pass | `docs/fleetgraph-latency-proof.md` records `45.113s`; live finding trace metadata records `10.456s` graph latency | None |
| Cost per graph run documented and defended | Pass | `FLEETGRAPH.md` Cost Analysis and `fleetgraph_usage` rows | None |
| Estimated runs per day documented and defended | Pass | `FLEETGRAPH.md` Production Projection Assumptions | None |

## Final Deliverables

| Required file/section | Status | Evidence |
|---|---|---|
| Root `PRESEARCH.md` | Pass | Updated on 2026-05-28 |
| Root `FLEETGRAPH.md` | Pass | Updated with quick start, traces, architecture, test cases, costs |
| Agent Responsibility | Pass | `FLEETGRAPH.md` |
| Graph Diagram | Pass | `FLEETGRAPH.md` Mermaid |
| Use Cases | Pass | 7 use cases |
| Trigger Model | Pass | Hybrid poll plus mutation debounce |
| Test Cases | Conditional pass | Test table includes trace URLs; trace access must be public or reviewer-authenticated |
| Architecture Decisions | Pass | `FLEETGRAPH.md` Architecture Decisions |
| Cost Analysis | Pass | `FLEETGRAPH.md` Cost Analysis |

## Architecture Truth Check

| Claim | Current repo reality | Status |
|---|---|---|
| Proactive and on-demand share the same graph architecture | `fleetgraph.runtime` branches to `proactive_at_risk_week` and `ondemand_chat` in `api/src/fleetgraph/graph.ts`; chat route invokes `runFleetGraphGraph` | Pass |
| Chat is embedded in context, not standalone | Editor renders the **Ask FleetGraph** pill on project, issue, and Week documents | Pass |
| Chat is scoped to current view | Route resolves document scope and context builders load Week/project/issue context before graph invocation | Pass |
| Visible writes require HITL | `pending_review` actions require approve then resume; resume writes supported `draft_comment` actions | Pass |
| Durable outcomes exist | Findings, action candidates, approvals, suppressions, usage, action executions, inbox reads, finding reads are stored in Postgres | Pass |
| LangGraph checkpoints are durable in Postgres | Current graph checkpointing uses `MemorySaver`; durable outcomes are Postgres-backed | Deferred, documented |
| All 7 use cases are implemented as detectors/actions | Use case 1 and use case 6 are implemented; use case 7 is architected; use cases 2-5 are extension families | Deferred, documented |

## Current Documentation Inventory

| Document | Purpose | Current state |
|---|---|---|
| `FLEETGRAPH.md` | Canonical submission artifact | Current |
| `PRESEARCH.md` | Root PRD pre-search deliverable | Current |
| `docs/fleetgraph-user-manual.md` | Human user manual | Current |
| `docs/fleetgraph-5-minute-demo-script.md` | Recording/run-of-show | Current |
| `docs/fleetgraph-agent-exercise-guide.md` | Deep manual exercise guide | Current |
| `docs/fleetgraph-graph-explainer.html` | Visual architecture explainer | Current |
| `docs/fleetgraph-latency-proof.md` | Latency evidence | Current |
| `FLEETGRAPH_TOKEN_SPEND.md` | Cost ledger | Current as supporting ledger |

## Pre-Submit Actions

Do these immediately before submitting:

1. Open the three Langfuse traces from `FLEETGRAPH.md`.
2. Review prompt/context content for sensitive data.
3. If graders will not have Langfuse project access, either make the selected traces public in Langfuse Cloud or recapture them with `FLEETGRAPH_PUBLIC_TRACE_EXPORT=true` and `LANGFUSE_PROJECT_ID` configured so FleetGraph publishes them through the Langfuse SDK.
4. Reopen `https://143.198.163.184.nip.io/health` and confirm HTTP 200.
5. Log in as `dev@ship.local` and smoke:
   - FleetGraph inbox opens.
   - `Needs Review` and `Approved` tabs render.
   - Week `Ask FleetGraph` streams an answer.
6. Submit `FLEETGRAPH.md`, `PRESEARCH.md`, the public app URL, the demo video, and the trace URLs.

## Do Not Rebuild Tonight

These are product improvements, not Week 5 submission blockers:

- `PostgresSaver` graph checkpointing.
- Additional detector modules for missing standup, planless Week, overload, and scope creep.
- Browser edit-before-approve.
- Chat-initiated issue creation/action candidates.
- Server-side durable chat history.

They are worth building next, but chasing them before final submission would create avoidable regression risk.
