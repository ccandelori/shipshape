---
title: "Polish FleetGraph inbox and chat controls"
date: 2026-05-28
category: ui-bugs
module: fleetgraph
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - "FleetGraph badge did not count every actionable finding state"
  - "FindingsInbox did not open on the most actionable populated tab"
  - "Action mutations lacked visible feedback"
  - "Embedded chat could retain stale document-scoped conversation context"
  - "Auto-opened action item modal could trigger aria-hidden focus warnings"
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - "assistant"
  - "development_workflow"
  - "testing_framework"
tags:
  - fleetgraph
  - findings-inbox
  - embedded-chat
  - action-items-modal
  - ui-state
  - accessibility
---

# Polish FleetGraph inbox and chat controls

## Problem

FleetGraph's core UI surfaces worked, but several interaction gaps made the agent feel unreliable during demo and review flows. Users could miss actionable HITL states, receive no visible confirmation after decisions, retain stale chat context without a reset affordance, or see modal focus warnings when accountability dialogs opened over hidden page content.

## Symptoms

- The navigation rail badge counted `open` and `pending_review` findings, but not `approved` findings that still needed resume/execution.
- The inbox could default to the `Open` tab even when `Needs Review` or `Approved` contained more urgent work.
- Approve, reject, dismiss, and snooze mutations completed without a clear success signal.
- Persisted embedded chat conversations lacked an explicit `New chat` control, so stale context could survive panel close/reopen.
- The action-items modal could open while focus remained on content behind the dialog, producing an `aria-hidden` focus warning.

Session history showed the same product shape from the user side: demo prep repeatedly surfaced "where is the agent?", "the send button doesn't fire", hidden HITL paths, and invisible action payoff after approval/resume (session history).

## What Didn't Work

- Relying on the first inbox tab was too shallow. It could show a seeded/open item while hiding the more demo-critical `pending_review` or `approved` lifecycle.
- Relying on websocket invalidation alone did not make decisions feel complete. Users needed immediate feedback that an action had been accepted.
- Persisting chat history solved context loss, but without a reset control it created the opposite problem: users had no obvious boundary between continuing a thread and starting fresh.
- Radix's default focus behavior was not explicit enough for the auto-opened accountability modal path. The browser warning came from real app focus timing, not from the narrow unit-test happy path.

## Solution

Treat agent UI state as a ranked workflow, not a passive list. FleetGraph now ranks lifecycle states by user action value: review pending decisions first, resumable approved actions second, and open findings last.

```ts
const lifecycleAutoSelectPriority: FindingsInboxLifecycleState[] = [
  'pending_review',
  'approved',
  'open',
];

function selectPreferredLifecycleState(
  counts: FleetGraphLifecycleCounts
): FindingsInboxLifecycleState {
  return lifecycleAutoSelectPriority.find((state) => counts[state] > 0) ?? 'open';
}
```

The inbox uses server-provided lifecycle counts to choose the first useful tab, but stops auto-switching after the user manually chooses a tab.

```ts
if (lifecycleState !== undefined || hasManualLifecycleSelection || lifecycleCounts === null) {
  return;
}

const preferredLifecycleState = selectPreferredLifecycleState(lifecycleCounts);
if (preferredLifecycleState !== selectedLifecycleState) {
  setSelectedLifecycleState(preferredLifecycleState);
}
```

The rail badge now counts every actionable state:

```ts
export function getNavigationRailAttentionCount(
  counts: FleetGraphLifecycleCounts | null | undefined
): number {
  return (counts?.open ?? 0) + (counts?.pending_review ?? 0) + (counts?.approved ?? 0);
}
```

FleetGraph actions now confirm successful mutations:

```ts
onApprove: (input) => approveMutation.mutate(input, {
  onSuccess: () => showToast('Action approved. Ready to resume.', 'success', 5000),
}),
onReject: (input) => rejectMutation.mutate(input, {
  onSuccess: () => showToast('Finding rejected.', 'success', 5000),
}),
```

Embedded chat now exposes `New chat` once messages exist. Starting over clears the prompt, stream state, and messages. Incrementing `requestIdRef` makes late stream events from the old request harmless.

```ts
const startNewChat = () => {
  requestIdRef.current += 1;
  setQuestion('');
  setStreamState(createFleetGraphChatStreamState());
  setMessages([]);
};
```

The action-items modal now moves focus into a stable dialog control when opened:

```tsx
<Dialog.Content
  onOpenAutoFocus={(event) => {
    event.preventDefault();
    closeButtonRef.current?.focus();
  }}
>
  <button ref={closeButtonRef} aria-label="Close" />
</Dialog.Content>
```

## Why This Works

The fix aligns the interface with the agent workflow. `pending_review` and `approved` findings are more actionable than generic open findings because they represent explicit human handoff points: approve/reject and resume. Counting and prioritizing those states makes the inbox point at the work a user can actually finish.

Toasts close the feedback loop for asynchronous mutations. They prevent users from having to infer success from card movement, refetch timing, or network activity.

The chat reset makes context persistence intentional. Persisted conversation is useful when continuing a scoped investigation, but a visible reset gives users control when they want a clean question. The request-id guard prevents stale streaming callbacks from mutating the new empty chat state.

Explicit modal focus turns a timing-sensitive accessibility warning into deterministic behavior. Keyboard focus lands inside the dialog every time, including the real auto-open path that originally exposed the warning.

## Prevention

- Rank lifecycle states by action value before choosing default tabs. UI defaults should answer "what can the user act on next?", not "which tab is first in the array?"
- Count all durable states that still need follow-through. In FleetGraph, `approved` is still actionable until resume/execution completes.
- Add success and failure feedback for every user-triggered agent decision. Avoid relying on background invalidation as the only feedback.
- Persist chat only with an explicit reset affordance. If a scoped assistant remembers context, it should also expose a clear way to leave that context behind.
- Test accessibility-sensitive focus paths through the same opening mechanism users hit in the app, not just isolated component render.

Relevant tests:

- `web/src/components/NavigationRailIcon.test.tsx` verifies actionable badge counts.
- `web/src/components/FleetGraph/FindingsInbox.test.tsx` verifies smart lifecycle selection and action toasts.
- `web/src/components/FleetGraph/EmbeddedChat.test.tsx` verifies `New chat` clears persisted scoped memory.
- `web/src/components/ActionItemsModal.test.tsx` verifies focus moves inside the modal.

Verification performed:

- `pnpm --filter web exec vitest run src/components/NavigationRailIcon.test.tsx src/components/FleetGraph/FindingsInbox.test.tsx src/components/FleetGraph/EmbeddedChat.test.tsx src/components/ActionItemsModal.test.tsx`
- `pnpm --filter web type-check`
- `pnpm --filter web build`

During the original fix, full workspace `pnpm type-check` was blocked by an unrelated dashboard import error in `dashboard/src/tabs/EvidenceTab.tsx`; verify current status with the repository's current type-check command before reusing that historical result.

## Related Issues

- Changed files: `web/src/components/NavigationRailIcon.tsx`, `web/src/components/FleetGraph/FindingsInbox.tsx`, `web/src/components/FleetGraph/EmbeddedChat.tsx`, and `web/src/components/ActionItemsModal.tsx`.
- Related docs scan found no existing FleetGraph inbox/chat solution doc in `docs/solutions/`.
- GitHub issue search was skipped because `gh issue list` could not reach `api.github.com` from this environment.
