---
title: "FleetGraph runtime telemetry boundary"
date: 2026-05-30
category: patterns
module: fleetgraph
problem_type: architecture_boundary
component: observability
severity: medium
applies_when:
  - "Adding FleetGraph observability that must be trusted outside the running process"
  - "Publishing Langfuse traces or node-level reports for review"
  - "Changing graph node metadata, branch decisions, guard outcomes, or chat trace context"
related_components:
  - "agent_runtime"
  - "observability"
  - "submission_evidence"
  - "testing_framework"
tags:
  - fleetgraph
  - observability
  - telemetry
  - langfuse
  - architecture
---

# FleetGraph runtime telemetry boundary

## Context

FleetGraph needs two different observability outputs:

- product/runtime evidence: what the graph decided while it ran
- review artifacts: public trace links and node-level reports that make those decisions inspectable

The current Langfuse export path is useful submission evidence plumbing. It can prove that public traces exist, that observations include node metadata, and that a reviewer can inspect graph branches. It should not become the long-term canonical model for FleetGraph runtime telemetry.

The canonical record of a graph run should be emitted while the graph runs. Langfuse traces, markdown reports, JSON exports, and cost summaries should consume that record instead of reconstructing graph behavior from trace names and loosely shaped metadata.

## Guidance

Introduce a narrow typed event boundary before adding more observability fields to detector or chat state.

The preferred shape is a small event model:

```ts
type FleetGraphTelemetryEvent =
  | FleetGraphRunStartedEvent
  | FleetGraphNodeCompletedEvent
  | FleetGraphBranchSelectedEvent
  | FleetGraphModelUsageRecordedEvent
  | FleetGraphRunCompletedEvent;
```

Each event should carry only the facts produced at that moment:

- `runId`
- `workspaceId`
- `mode`
- `detectorType`
- `traceNode`
- `scopedDocumentId`
- branch or guard decision fields when that event is specifically about a branch or guard
- model usage fields only when model usage exists
- public trace fields only when the trace publisher has a URL

Langfuse publication should be a consumer of those events. The node telemetry export should also be a consumer. The detector should not know which fields a markdown report wants, and the markdown report should not infer graph policy from string prefixes.

## Anti-Pattern

Avoid making the detector state carry a wide diagnostics object that tries to satisfy every downstream report:

```ts
interface LargeTraceMetadataBag {
  traceNode: string | null;
  branchPath: string | null;
  guardDecision: string | null;
  preFilterShouldReason: boolean | null;
  lifecycleState: string | null;
  personResolution: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}
```

That pattern couples graph execution to review artifact shape. It also encourages post-hoc parsers to decide what counts as FleetGraph telemetry by inspecting names and nullable fields.

## Better Boundary

Keep graph code responsible for graph decisions. Keep telemetry code responsible for publication and reporting.

```ts
interface FleetGraphTelemetrySink {
  record(event: FleetGraphTelemetryEvent): Promise<void>;
}
```

The graph receives a sink through dependencies and records events at node boundaries. A production sink can write structured rows and attach Langfuse metadata. A test sink can capture events in memory. An export command can query structured rows or read captured event artifacts and format them for review.

This keeps the boundary small:

- graph nodes emit facts
- sinks decide where facts go
- reports project facts into human-readable artifacts

## Why This Matters

FleetGraph already has enough complexity in the at-risk Week detector: scope building, context loading, guards, suppression, pre-filtering, model reasoning, policy, persistence, and HITL action creation. Observability is cross-cutting, so it needs a boundary that prevents every new proof requirement from widening detector state.

A typed runtime telemetry boundary also makes future claims safer. If documentation says a graph node produced a branch decision, that decision should be represented by a runtime event emitted by the node, not by an export script guessing from observation metadata after the fact.

## When to Apply

Apply this pattern before adding:

- new detector node telemetry
- new public trace report fields
- additional branch or guard metadata
- chat action telemetry
- cost or latency summaries that need to tie back to a graph run

Small UI projections of existing telemetry can keep using existing API response fields. New cross-cutting observability should go through the event boundary.

## Related

- `api/src/fleetgraph/detectors/at-risk-week.ts`
- `api/src/fleetgraph/telemetry.ts`
- `api/src/fleetgraph/scripts/export-node-telemetry.ts`
- `api/src/fleetgraph/langfuse.ts`
- `api/src/fleetgraph/chat.ts`
