import { useEffect, useState } from 'react';
import { FindingCard, type FindingCardActionHandlers, type FindingCardPendingAction } from './FindingCard';
import type { FleetGraphFinding, FleetGraphLifecycleState } from '@/hooks/useFleetGraphQuery';
import {
  useApproveFleetGraphFindingMutation,
  useDismissFleetGraphFindingMutation,
  useFleetGraphFindingsQuery,
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

export function FindingsInbox({ lifecycleState, limit, className }: FindingsInboxProps) {
  const [selectedLifecycleState, setSelectedLifecycleState] = useState<FindingsInboxLifecycleState>(
    lifecycleState ?? 'open'
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
  const { showToast } = useToast();

  const actions: FindingCardActionHandlers = {
    onApprove: (input) => approveMutation.mutate(input),
    onReject: (input) => rejectMutation.mutate(input),
    onDismiss: (input) => dismissMutation.mutate(input),
    onSnooze: (input) => snoozeMutation.mutate(input),
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
  const visibleCount = findings.length;

  useEffect(() => {
    if (lifecycleState !== undefined) {
      setSelectedLifecycleState(lifecycleState);
    }
  }, [lifecycleState]);

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

            return (
              <button
                key={tab.lifecycleState}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSelectedLifecycleState(tab.lifecycleState)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? 'bg-accent text-white'
                    : 'text-muted hover:bg-border/60 hover:text-foreground'
                )}
              >
                {tab.label}
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
            {findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
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
            ))}
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

function formatResumeSuccessMessage(actionKind: string | null): string {
  if (actionKind === 'draft_comment') {
    return 'Comment posted by FleetGraph';
  }

  return 'FleetGraph action executed';
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
