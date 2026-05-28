import { useEffect, useRef, useState } from 'react';
import { FindingCard, type FindingCardActionHandlers, type FindingCardPendingAction } from './FindingCard';
import type { FleetGraphFinding, FleetGraphLifecycleCounts, FleetGraphLifecycleState } from '@/hooks/useFleetGraphQuery';
import {
  useApproveFleetGraphFindingMutation,
  useDismissFleetGraphFindingMutation,
  useFleetGraphFindingsQuery,
  useMarkFleetGraphFindingsReadMutation,
  useRejectFleetGraphFindingMutation,
  useResumeFleetGraphActionMutation,
  useSnoozeFleetGraphFindingMutation,
} from '@/hooks/useFleetGraphQuery';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

interface FindingsInboxProps {
  lifecycleState?: FindingsInboxLifecycleState;
  limit?: number;
  className?: string;
  initialUnreadLifecycleCounts?: FleetGraphLifecycleCounts | null;
}

type FindingsInboxLifecycleState = Extract<
  FleetGraphLifecycleState,
  'open' | 'pending_review' | 'approved'
>;

interface FindingsInboxLifecycleTab {
  label: string;
  lifecycleState: FindingsInboxLifecycleState;
  emptyTitle: string;
  emptyBody: string;
}

const lifecycleTabs = [
  {
    label: 'Open',
    lifecycleState: 'open',
    emptyTitle: 'No open findings',
    emptyBody: 'FleetGraph has not surfaced anything that needs triage.',
  },
  {
    label: 'Needs Review',
    lifecycleState: 'pending_review',
    emptyTitle: 'No findings need review',
    emptyBody: 'There are no agent actions waiting for human approval.',
  },
  {
    label: 'Approved',
    lifecycleState: 'approved',
    emptyTitle: 'No approved actions',
    emptyBody: 'Approved FleetGraph actions will appear here until they are resumed.',
  },
] as const satisfies readonly FindingsInboxLifecycleTab[];

const lifecycleAutoSelectPriority: FindingsInboxLifecycleState[] = ['pending_review', 'approved', 'open'];

export function FindingsInbox({
  lifecycleState,
  limit,
  className,
  initialUnreadLifecycleCounts,
}: FindingsInboxProps) {
  const [selectedLifecycleState, setSelectedLifecycleState] = useState<FindingsInboxLifecycleState>(
    lifecycleState ?? 'open'
  );
  const [hasManualLifecycleSelection, setHasManualLifecycleSelection] = useState(false);
  const [unreadLifecycleCountsSnapshot, setUnreadLifecycleCountsSnapshot] =
    useState<FleetGraphLifecycleCounts | null>(initialUnreadLifecycleCounts ?? null);
  const [sessionUnreadFindingIds, setSessionUnreadFindingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const effectiveLimit = limit ?? 20;
  const activeTab = lifecycleTabs.find((tab) => tab.lifecycleState === selectedLifecycleState) ?? lifecycleTabs[0];
  const findingsQuery = useFleetGraphFindingsQuery({
    lifecycleState: selectedLifecycleState,
    limit: effectiveLimit,
  }, { enabled: true });
  const approveMutation = useApproveFleetGraphFindingMutation();
  const rejectMutation = useRejectFleetGraphFindingMutation();
  const dismissMutation = useDismissFleetGraphFindingMutation();
  const snoozeMutation = useSnoozeFleetGraphFindingMutation();
  const resumeMutation = useResumeFleetGraphActionMutation();
  const markFindingsReadMutation = useMarkFleetGraphFindingsReadMutation();
  const { showToast } = useToast();
  const markedReadKeysRef = useRef<Set<string>>(new Set());

  const actions: FindingCardActionHandlers = {
    onApprove: (input) => approveMutation.mutate(input, {
      onSuccess: () => showToast('Action approved. Ready to resume.', 'success', 5000),
    }),
    onReject: (input) => rejectMutation.mutate(input, {
      onSuccess: () => showToast('Finding rejected.', 'success', 5000),
    }),
    onDismiss: (input) => dismissMutation.mutate(input, {
      onSuccess: () => showToast('Finding dismissed.', 'success', 5000),
    }),
    onSnooze: (input) => snoozeMutation.mutate(input, {
      onSuccess: () => showToast('Finding snoozed.', 'success', 5000),
    }),
    onResume: (input) => resumeMutation.mutate(input, {
      onSuccess: (finding) => {
        const actionCandidate = finding.action_candidates.find((candidate) => (
          candidate.id === input.actionCandidateId
        ));
        const targetDocument = actionCandidate?.target_document ?? null;

        showToast(
          formatResumeSuccessMessage(actionCandidate?.recommended_action.kind ?? null),
          'success',
          7000,
          targetDocument
            ? {
                label: 'View document',
                onClick: () => {
                  window.location.href = `/documents/${targetDocument.id}`;
                },
              }
            : undefined
        );
      },
    }),
  };

  const findings = findingsQuery.data?.items ?? [];
  const lifecycleCounts = findingsQuery.data?.lifecycle_counts ?? null;
  const unreadLifecycleCounts = unreadLifecycleCountsSnapshot ?? findingsQuery.data?.unread_lifecycle_counts ?? null;
  const visibleCount = findings.length;

  useEffect(() => {
    setUnreadLifecycleCountsSnapshot(initialUnreadLifecycleCounts ?? null);
  }, [initialUnreadLifecycleCounts]);

  useEffect(() => {
    if (unreadLifecycleCountsSnapshot !== null || findingsQuery.data === undefined) {
      return;
    }

    setUnreadLifecycleCountsSnapshot(findingsQuery.data.unread_lifecycle_counts);
  }, [findingsQuery.data, unreadLifecycleCountsSnapshot]);

  useEffect(() => {
    if (lifecycleState !== undefined) {
      setSelectedLifecycleState(lifecycleState);
    }
  }, [lifecycleState]);

  useEffect(() => {
    const unreadFindingIds = findings
      .filter((finding) => finding.is_unread)
      .map((finding) => finding.id);

    if (unreadFindingIds.length === 0) {
      return;
    }

    setSessionUnreadFindingIds((currentFindingIds) => {
      let changed = false;
      const nextFindingIds = new Set(currentFindingIds);

      for (const findingId of unreadFindingIds) {
        if (!nextFindingIds.has(findingId)) {
          nextFindingIds.add(findingId);
          changed = true;
        }
      }

      return changed ? nextFindingIds : currentFindingIds;
    });
  }, [findings]);

  useEffect(() => {
    if (lifecycleState !== undefined || hasManualLifecycleSelection || lifecycleCounts === null) {
      return;
    }

    const preferredLifecycleState = selectPreferredLifecycleState(lifecycleCounts);
    if (preferredLifecycleState !== selectedLifecycleState) {
      setSelectedLifecycleState(preferredLifecycleState);
    }
  }, [hasManualLifecycleSelection, lifecycleCounts, lifecycleState, selectedLifecycleState]);

  const selectLifecycleTab = (nextLifecycleState: FindingsInboxLifecycleState) => {
    setHasManualLifecycleSelection(true);
    setSelectedLifecycleState(nextLifecycleState);
  };

  useEffect(() => {
    if (!findingsQuery.isSuccess || findings.length === 0) {
      return;
    }

    if (
      lifecycleState === undefined
      && !hasManualLifecycleSelection
      && lifecycleCounts !== null
      && selectPreferredLifecycleState(lifecycleCounts) !== selectedLifecycleState
    ) {
      return;
    }

    if ((unreadLifecycleCounts?.[selectedLifecycleState] ?? 0) <= 0) {
      return;
    }

    const findingIds = findings.map((finding) => finding.id);
    const readKey = `${selectedLifecycleState}:${findingIds.join(',')}`;

    if (markedReadKeysRef.current.has(readKey)) {
      return;
    }

    markedReadKeysRef.current.add(readKey);
    let didStartMarkingRead = false;
    const timeoutId = window.setTimeout(() => {
      didStartMarkingRead = true;
      markFindingsReadMutation.mutate(
        { findingIds },
        {
          onSuccess: () => {
            setUnreadLifecycleCountsSnapshot(null);
          },
          onError: () => {
            markedReadKeysRef.current.delete(readKey);
          },
        }
      );
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      if (!didStartMarkingRead) {
        markedReadKeysRef.current.delete(readKey);
      }
    };
  }, [
    findings,
    findingsQuery.isSuccess,
    hasManualLifecycleSelection,
    lifecycleCounts,
    lifecycleState,
    markFindingsReadMutation,
    selectedLifecycleState,
    unreadLifecycleCounts,
  ]);

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-background', className)} aria-label="FleetGraph findings inbox">
      <header className="border-b border-border px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">FleetGraph Inbox</h2>
            <p className="mt-1 text-sm text-muted">
              {findingsQuery.isLoading ? 'Loading findings...' : `${visibleCount} ${visibleCount === 1 ? 'finding' : 'findings'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => findingsQuery.refetch()}
            disabled={findingsQuery.isFetching}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-border/60 disabled:opacity-50"
          >
            {findingsQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="mt-4 flex gap-1" role="tablist" aria-label="FleetGraph finding lifecycle">
          {lifecycleTabs.map((tab) => {
            const selected = tab.lifecycleState === selectedLifecycleState;
            const count = unreadLifecycleCounts?.[tab.lifecycleState] ?? 0;

            return (
              <button
                key={tab.lifecycleState}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={count > 0 ? `${tab.label} ${formatLifecycleCount(count)}` : tab.label}
                onClick={() => selectLifecycleTab(tab.lifecycleState)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? 'bg-accent text-white'
                    : 'text-muted hover:bg-border/60 hover:text-foreground'
                )}
              >
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      'ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold leading-none',
                      selected
                        ? 'bg-white text-accent'
                        : 'bg-accent text-white'
                    )}
                  >
                    {formatLifecycleCount(count)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {findingsQuery.isLoading && (
          <div className="rounded-lg border border-border bg-border/10 px-4 py-6 text-sm text-muted">
            Loading findings...
          </div>
        )}

        {findingsQuery.isError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-4">
            <p className="text-sm font-medium text-red-300">Failed to load FleetGraph findings</p>
            <button
              type="button"
              onClick={() => findingsQuery.refetch()}
              className="mt-3 rounded-md bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              Retry
            </button>
          </div>
        )}

        {!findingsQuery.isLoading && !findingsQuery.isError && findings.length === 0 && (
          <div className="rounded-lg border border-border bg-border/10 px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">{activeTab.emptyTitle}</p>
            <p className="mt-1 text-sm text-muted">{activeTab.emptyBody}</p>
          </div>
        )}

        {findings.length > 0 && (
          <div className="space-y-3">
            {findings.map((finding) => {
              const displayFinding = sessionUnreadFindingIds.has(finding.id)
                ? { ...finding, is_unread: true }
                : finding;

              return (
                <FindingCard
                  key={finding.id}
                  finding={displayFinding}
                  actions={actions}
                  pendingAction={resolvePendingAction({
                    finding,
                    approveMutation,
                    rejectMutation,
                    dismissMutation,
                    snoozeMutation,
                    resumeMutation,
                  })}
                />
              );
            })}
          </div>
        )}

        {findingsQuery.data?.hasMore && (
          <p className="mt-4 rounded-md border border-border bg-border/10 px-3 py-2 text-xs text-muted">
            More findings are available. Narrow the lifecycle filter or refresh after clearing current findings.
          </p>
        )}
      </div>
    </section>
  );
}

function selectPreferredLifecycleState(counts: FleetGraphLifecycleCounts): FindingsInboxLifecycleState {
  return lifecycleAutoSelectPriority.find((lifecycleState) => counts[lifecycleState] > 0) ?? 'open';
}

function formatResumeSuccessMessage(actionKind: string | null): string {
  if (actionKind === 'draft_comment') {
    return 'Comment posted by FleetGraph';
  }

  return 'FleetGraph action executed';
}

function formatLifecycleCount(count: number): string {
  if (count > 99) {
    return '99+';
  }

  return count.toString();
}

function resolvePendingAction(input: {
  finding: FleetGraphFinding;
  approveMutation: ReturnType<typeof useApproveFleetGraphFindingMutation>;
  rejectMutation: ReturnType<typeof useRejectFleetGraphFindingMutation>;
  dismissMutation: ReturnType<typeof useDismissFleetGraphFindingMutation>;
  snoozeMutation: ReturnType<typeof useSnoozeFleetGraphFindingMutation>;
  resumeMutation: ReturnType<typeof useResumeFleetGraphActionMutation>;
}): FindingCardPendingAction {
  if (input.approveMutation.isPending && input.approveMutation.variables?.findingId === input.finding.id) {
    return 'approve';
  }

  if (input.rejectMutation.isPending && input.rejectMutation.variables?.findingId === input.finding.id) {
    return 'reject';
  }

  if (input.dismissMutation.isPending && input.dismissMutation.variables?.findingId === input.finding.id) {
    return 'dismiss';
  }

  if (input.snoozeMutation.isPending && input.snoozeMutation.variables?.findingId === input.finding.id) {
    return 'snooze';
  }

  if (
    input.resumeMutation.isPending
    && input.finding.action_candidates.some((actionCandidate) => (
      actionCandidate.id === input.resumeMutation.variables?.actionCandidateId
    ))
  ) {
    return 'resume';
  }

  return null;
}
