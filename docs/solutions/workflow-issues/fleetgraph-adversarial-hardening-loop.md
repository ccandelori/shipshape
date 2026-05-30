---
title: "FleetGraph adversarial hardening loop"
date: 2026-05-30
category: workflow-issues
module: fleetgraph
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "A submission is close and external critique is finding real but uneven risks"
  - "The product must improve without opening a destabilizing architecture refactor"
  - "Documentation claims must match implementation exactly"
  - "Multiple small hardening commits are safer than one broad rewrite"
related_components:
  - "assistant"
  - "documentation"
  - "testing_framework"
  - "tooling"
tags:
  - fleetgraph
  - adversarial-review
  - submission-hardening
  - small-batches
  - tests
---

# FleetGraph adversarial hardening loop

## Context

FleetGraph received several adversarial reviews after the implementation was already close to submission-ready. The critiques mixed different classes of risk: hard rubric gaps, documentation overclaims, maintainability debt, thin tests, and optional product polish.

Treating every critique as equally urgent would have caused churn. Ignoring the critiques would have left real attack surfaces in place. The useful workflow was to sort findings by blast radius and take small verified slices.

## Guidance

Start by classifying each critique into one of four buckets:

- submission blocker: a claim, trace, deployment, or rubric item is false or missing
- small hardening win: a local change improves evidence or robustness with low blast radius
- architecture debt: the critique is valid, but fixing it safely requires a larger design pass
- non-issue: the critique conflicts with accepted constraints or already-documented boundaries

Only implement the first two buckets before submission. Capture architecture debt as an internal solution note or issue so the critique is not lost, but do not turn a nearly-ready submission into a rewrite.

For each small hardening win:

1. Pick a change with a narrow rollback boundary.
2. Add or update a focused test first when the behavior is code-visible.
3. Run the smallest meaningful verification command.
4. Commit the slice separately.
5. Re-check that submission docs still make only true claims.

FleetGraph used this loop for several small wins:

- hardened `FLEETGRAPH.md` wording so LangGraph checkpoint support could not be misread as durable `PostgresSaver` usage
- extracted `FleetGraphChatControl` so the sticky editor chat overlay had a testable seam without mocking the whole TipTap/Yjs editor
- moved the rich Ship Core demo issues and comment seeding helpers out of `api/src/db/seed.ts`
- reused the exported demo issue titles in `demo-health.ts` so seed data and demo links cannot drift silently
- named and regression-tested the telemetry parser policy for observations identified by `fleetgraph.*`, `detectorType: at_risk_week`, or `personResolution: applied`

## Why This Matters

Adversarial critique is valuable, but it can become noise if it does not distinguish between correctness, evidence, maintainability, and taste. The order matters.

For FleetGraph, the highest-risk submission failures were false claims and missing proof. Once those were closed, the next-best improvements were small seams and tests that made existing behavior more defensible. The larger architecture critique around telemetry was real, but a full runtime telemetry event boundary was not a safe pre-submission change.

This keeps the product moving in the right direction without replacing one risk with another.

## When to Apply

- During final submission hardening after external or adversarial review.
- When the code is working but the evidence package is being scrutinized.
- When a critique identifies valid architecture debt that is too large for the current deadline.
- When a file is too large but only a small slice can be safely extracted.
- When a UI change is already working but lacks a testable seam.

## Examples

### Hardening a documentation claim

Avoid broad framework claims that imply implementation details the product does not use:

```markdown
LangGraph gives conditional execution, checkpointing, streaming, and human-in-the-loop support.
```

Prefer implementation-specific wording:

```markdown
LangGraph gives conditional execution and streaming primitives. FleetGraph persists user-visible outcomes in Postgres and keeps transient execution checkpoints in process for this submission.
```

### Adding a testable UI seam

When the full `Editor` is too expensive to test directly because it owns TipTap, Yjs, IndexedDB, comments, and websocket state, extract the specific seam under review:

```tsx
export function FleetGraphChatControl({
  open,
  onOpenChange,
  documentId,
  documentType,
  memoryScope,
}: FleetGraphChatControlProps) {
  return (
    <div
      className="pointer-events-none sticky top-0 z-20 -mb-10 flex justify-end px-6 pt-5"
      data-testid="fleetgraph-chat-editor-overlay"
    >
      <FleetGraphChatPopover
        open={open}
        onOpenChange={onOpenChange}
        documentId={documentId}
        documentType={documentType}
        memoryScope={memoryScope}
      />
    </div>
  );
}
```

Then test the behavior the critique called out:

```ts
expect(overlay).toHaveClass('pointer-events-none');
expect(overlay).toHaveClass('sticky');
expect(overlay).toHaveClass('justify-end');
expect(trigger).toHaveClass('pointer-events-auto');
```

### Reducing seed monolith pressure

Move demo-specific rich data out of `seed.ts` when it has its own narrative, comments, acceptance criteria, and related demo health checks. Export the source-of-truth titles so downstream tooling cannot duplicate strings:

```ts
export const shipCoreDemoIssueTitles = shipCoreDemoIssues.map((issue) => issue.title);
```

## Related

- `docs/solutions/patterns/fleetgraph-runtime-telemetry-boundary.md`
- `docs/solutions/workflow-issues/fleetgraph-demo-health-reset-workflow.md`
- `docs/solutions/ui-bugs/fleetgraph-inbox-chat-controls-polish.md`
- `FLEETGRAPH.md`
- `web/src/components/FleetGraph/FleetGraphChatControl.tsx`
- `api/src/db/shipCoreDemoIssues.ts`
- `api/src/fleetgraph/telemetry.ts`
