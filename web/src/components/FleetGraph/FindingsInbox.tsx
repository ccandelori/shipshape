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
import { cn } from '@/lib/cn';

interface FindingsInboxProps {
  lifecycleState?: FleetGraphLifecycleState;
  limit?: number;
  className?: string;
}

export function FindingsInbox({ lifecycleState, limit, className }: FindingsInboxProps) {
  const effectiveLifecycleState = lifecycleState ?? 'open';
  const effectiveLimit = limit ?? 20;
  const findingsQuery = useFleetGraphFindingsQuery({
    lifecycleState: effectiveLifecycleState,
    limit: effectiveLimit,
  }, { enabled: true });
  const approveMutation = useApproveFleetGraphFindingMutation();
  const rejectMutation = useRejectFleetGraphFindingMutation();
  const dismissMutation = useDismissFleetGraphFindingMutation();
  const snoozeMutation = useSnoozeFleetGraphFindingMutation();
  const resumeMutation = useResumeFleetGraphActionMutation();

  const actions: FindingCardActionHandlers = {
    onApprove: (input) => approveMutation.mutate(input),
    onReject: (input) => rejectMutation.mutate(input),
    onDismiss: (input) => dismissMutation.mutate(input),
    onSnooze: (input) => snoozeMutation.mutate(input),
    onResume: (input) => resumeMutation.mutate(input),
  };

  const findings = findingsQuery.data?.items ?? [];
  const visibleCount = findings.length;

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
            <p className="text-sm font-medium text-foreground">No open findings</p>
            <p className="mt-1 text-sm text-muted">FleetGraph has no findings in this state.</p>
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
