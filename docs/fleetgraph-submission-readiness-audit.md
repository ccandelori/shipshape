# FleetGraph Submission Readiness Audit

Date: 2026-05-29
Source PRD: `/Users/sheep/Desktop/Gauntlet/Week 5 GFA - FleetGraph PRD.pdf`
Assessed source of truth: current `master` checkout at `/Users/sheep/Desktop/Gauntlet/ship`

This audit compares the current FleetGraph implementation and documentation against the original Week 5 PRD. It is intentionally blunt: if a row is not green, it needs either a fix or an explicit submission note before tonight.

## Verdict

FleetGraph is submission-ready from an engineering, documentation, deployment, and observability standpoint:

- The Langfuse trace URLs in `FLEETGRAPH.md` include deployed smoke traces and a 15-row public trace matrix: 14 detection-quality traces plus a current-code chat person-resolution trace. The three deployed-smoke traces, all 14 detection-quality traces, and the chat person-resolution trace were verified through the Langfuse API with `public: true`.
- `docs/evals/fleetgraph-node-telemetry.md` exports concrete Langfuse observation IDs, trace-node metadata, latency, token, and cost fields for every verified public FleetGraph trace.
- Langfuse is the observability provider for this submission. It fulfills the PRD's shared trace requirement by exposing public run trees with branch metadata, model usage, token counts, and trace URLs.
- The V1 and V2 deterministic eval suites pass 16 cases and 50 assertions; the detection-quality live graph eval passes 14 / 14 cases with one public trace per case.

No architectural rebuild is needed. The original grading issue - on-demand chat bypassing the compiled graph - is fixed in `api/src/fleetgraph/graph.ts` and `api/src/routes/fleetgraph-chat.ts`.

## PRD MVP Checklist

| PRD requirement | Current status | Evidence | Submission action |
|---|---|---|---|
| Graph running with at least one proactive detection wired end-to-end | Pass | `api/src/fleetgraph/detectors/at-risk-week.ts`, `api/src/fleetgraph/proactive-runner.ts`, `api/src/fleetgraph/triggers.ts`, `api/src/routes/fleetgraph.ts` | None |
| Observability tracing enabled with shared trace links showing different paths | Pass | `FLEETGRAPH.md` lists public finding, quiet, deployed chat, chat person-resolution, and a 15-row public trace matrix; `docs/evals/fleetgraph-node-telemetry.md` lists node-level observation IDs and telemetry for each verified public trace | None |
| `FLEETGRAPH.md` with Agent Responsibility and at least 5 use cases | Pass | `FLEETGRAPH.md` defines responsibilities and 6 trace-backed use cases | None |
| Graph outline with node types, edges, branching conditions | Pass | `FLEETGRAPH.md` Mermaid diagram; `docs/fleetgraph-graph-explainer.html` | None |
| At least one human-in-the-loop gate | Pass | `api/src/fleetgraph/policy.ts`, `api/src/routes/fleetgraph.ts`, inbox `Needs Review` and `Approved` tabs | None |
| Running against real Ship data; no mocked production responses | Pass | Production context builders read Postgres Ship documents/issues/standups; deployed smoke traces use real document ids; detection-quality traces use controlled Ship-shaped golden contexts for repeatable edge-case coverage | Keep demo clear when using seeded rows, golden eval traces, and deployed real-document traces |
| Agent chat and notifications accessible in UI | Pass | `web/src/components/FleetGraph/*`, `web/src/components/Editor.tsx`, `web/src/pages/App.tsx` | None |
| Deployed and publicly accessible | Pass | Release `20260529-151518` is live at `https://143.198.163.184.nip.io/`; `/health` returned HTTP 200 and Brave smoke verified login, FleetGraph inbox tabs, and Week chat on 2026-05-29 | Re-smoke immediately before submitting only if another deploy occurs |
| Trigger model documented and defended | Pass | `FLEETGRAPH.md` and `PRESEARCH.md` hybrid trigger section | None |

## PRD Performance Checklist

| PRD metric | Current status | Evidence | Submission action |
|---|---|---|---|
| Problem detection latency under 5 minutes | Pass | `docs/fleetgraph-latency-proof.md` records `45.113s` for trigger/orchestration latency with deterministic local reasoner; live finding trace metadata records `7.382s` graph latency with real model call | Do not describe the local proof as a live provider latency benchmark |
| Cost per graph run documented and defended | Pass | `FLEETGRAPH.md` Cost Analysis and `fleetgraph_usage` rows | None |
| Estimated runs per day documented and defended | Pass | `FLEETGRAPH.md` Production Projection Assumptions | None |

## Final Deliverables

| Required file/section | Status | Evidence |
|---|---|---|
| Root `PRESEARCH.md` | Pass | Updated on 2026-05-29 |
| Root `FLEETGRAPH.md` | Pass | Updated with quick start, traces, architecture, test cases, costs |
| Agent Responsibility | Pass | `FLEETGRAPH.md` |
| Graph Diagram | Pass | `FLEETGRAPH.md` Mermaid |
| Use Cases | Pass | 6 trace-backed use cases |
| Trigger Model | Pass | Hybrid poll plus mutation debounce |
| Test Cases | Pass | Test table includes public trace URLs and node-level telemetry artifact |
| Formal eval reports | Pass | V1, V2, and detection-quality markdown plus JSON reports under `docs/evals/` |
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
| Durable submitted outcomes exist in Postgres | Findings, action candidates, approvals, suppressions, usage, action executions, inbox reads, and finding reads are stored in Postgres | Pass |
| Implementation coverage for the documented use cases | Use case 1 and use case 6 are implemented as primary surfaces; use case 6 includes a trace-backed person-name resolution check; use cases 2-5 are represented as explicit traced acceptance states for stale blockers, missing progress, missing planning/accountability, and overload/scope pressure | Pass |

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
| `docs/evals/fleetgraph-v1-eval-report.md` | Formal deterministic V1 eval report | Current |
| `docs/evals/fleetgraph-v2-eval-report.md` | Formal deterministic V2 eval report | Current |
| `FLEETGRAPH_TOKEN_SPEND.md` | Cost ledger | Current as supporting ledger |

## Pre-Submit Actions

Do these immediately before submitting:

1. Open the three deployed-smoke Langfuse traces, the chat person-name trace, and the 15-row public trace matrix from `FLEETGRAPH.md`.
2. Review prompt/context content one last time for sensitive data.
3. Reopen `https://143.198.163.184.nip.io/health` and confirm HTTP 200.
4. Log in as `dev@ship.local` and smoke:
   - FleetGraph inbox opens.
   - `Needs Review` and `Approved` tabs render.
   - Week `Ask FleetGraph` streams an answer.
5. Run `pnpm fleetgraph:eval` if you want a fresh local V1/V2 eval timestamp for the final packet.
6. Submit `FLEETGRAPH.md`, `PRESEARCH.md`, the V1, V2, and detection-quality eval reports under `docs/evals/`, the public app URL, the demo video, and the trace URLs.

## Submission Boundary

The submitted product scope is the trace-backed FleetGraph runtime described in `FLEETGRAPH.md`: proactive at-risk Week detection, human-in-the-loop findings/actions, context-scoped on-demand chat, public Langfuse traces, latency proof, and cost evidence.

They are worth building next, but chasing them before final submission would create avoidable regression risk.
