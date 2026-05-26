import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import type {
  FleetGraphActionCandidate,
  FleetGraphFinding,
  FleetGraphLifecycleState,
  FleetGraphRecommendedAction,
  FleetGraphSeverity,
} from '@/hooks/useFleetGraphQuery';

export type FindingCardPendingAction =
  | 'approve'
  | 'reject'
  | 'dismiss'
  | 'snooze'
  | 'resume'
  | null;

export interface ApproveFindingCardInput {
  findingId: string;
  actionCandidateId?: string;
  editedAction?: FleetGraphRecommendedAction | null;
}

export interface ReasonedFindingCardInput {
  findingId: string;
  reason: string;
}

export interface SnoozeFindingCardInput {
  findingId: string;
  reason: string;
  expiresAt: string;
}

export interface ResumeFindingCardInput {
  actionCandidateId: string;
}

export interface FindingCardActionHandlers {
  onApprove: (input: ApproveFindingCardInput) => void;
  onReject: (input: ReasonedFindingCardInput) => void;
  onDismiss: (input: ReasonedFindingCardInput) => void;
  onSnooze: (input: SnoozeFindingCardInput) => void;
  onResume: (input: ResumeFindingCardInput) => void;
}

interface FindingCardProps {
  finding: FleetGraphFinding;
  actions: FindingCardActionHandlers;
  pendingAction: FindingCardPendingAction;
}

type DecisionFormKind = 'reject' | 'dismiss' | 'snooze';

const actionableLifecycleStates: readonly FleetGraphLifecycleState[] = ['open', 'pending_review'];

const severityClasses: Record<FleetGraphSeverity, string> = {
  low: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  medium: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
  high: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  critical: 'border-red-500/30 bg-red-500/10 text-red-300',
};

const lifecycleClasses: Record<FleetGraphLifecycleState, string> = {
  open: 'border-accent/30 bg-accent/10 text-accent',
  pending_review: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  approved: 'border-green-500/30 bg-green-500/10 text-green-300',
  executed: 'border-green-500/30 bg-green-500/10 text-green-300',
  rejected: 'border-red-500/30 bg-red-500/10 text-red-300',
  dismissed: 'border-neutral-500/30 bg-neutral-500/10 text-neutral-300',
  snoozed: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  expired: 'border-neutral-500/30 bg-neutral-500/10 text-neutral-400',
};

export function FindingCard({ finding, actions, pendingAction }: FindingCardProps) {
  const [decisionFormKind, setDecisionFormKind] = useState<DecisionFormKind | null>(null);
  const [reason, setReason] = useState('');
  const [snoozeExpiresAt, setSnoozeExpiresAt] = useState('');
  const primaryActionCandidate = finding.action_candidates[0] ?? null;
  const canDecide = actionableLifecycleStates.includes(finding.lifecycle_state);
  const canResume = finding.lifecycle_state === 'approved' && primaryActionCandidate !== null;
  const isBusy = pendingAction !== null;
  const decisionFormTitle = useMemo(() => {
    if (decisionFormKind === 'reject') return 'Reject finding';
    if (decisionFormKind === 'dismiss') return 'Dismiss finding';
    if (decisionFormKind === 'snooze') return 'Snooze finding';
    return null;
  }, [decisionFormKind]);

  const handleApprove = () => {
    actions.onApprove({
      findingId: finding.id,
      ...(primaryActionCandidate ? { actionCandidateId: primaryActionCandidate.id } : {}),
    });
  };

  const handleOpenDecisionForm = (kind: DecisionFormKind) => {
    setDecisionFormKind(kind);
    setReason('');
    setSnoozeExpiresAt('');
  };

  const handleCancelDecision = () => {
    setDecisionFormKind(null);
    setReason('');
    setSnoozeExpiresAt('');
  };

  const handleConfirmDecision = () => {
    const trimmedReason = reason.trim();

    if (decisionFormKind === 'reject') {
      actions.onReject({ findingId: finding.id, reason: trimmedReason });
      handleCancelDecision();
      return;
    }

    if (decisionFormKind === 'dismiss') {
      actions.onDismiss({ findingId: finding.id, reason: trimmedReason });
      handleCancelDecision();
      return;
    }

    if (decisionFormKind === 'snooze') {
      actions.onSnooze({
        findingId: finding.id,
        reason: trimmedReason,
        expiresAt: new Date(snoozeExpiresAt).toISOString(),
      });
      handleCancelDecision();
    }
  };

  const handleResume = () => {
    if (!primaryActionCandidate) return;
    actions.onResume({ actionCandidateId: primaryActionCandidate.id });
  };

  const reasonIsValid = reason.trim().length > 0;
  const snoozeIsValid = decisionFormKind !== 'snooze' || snoozeExpiresAt.length > 0;

  return (
    <article className="rounded-lg border border-border bg-background p-4 shadow-sm">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={severityClasses[finding.severity]}>
              {formatLabel(finding.severity)}
            </Badge>
            <Badge className={lifecycleClasses[finding.lifecycle_state]}>
              {formatLabel(finding.lifecycle_state)}
            </Badge>
            <span className="text-xs text-muted">{formatLabel(finding.detector_type)}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            {finding.scoped_document.title}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {formatLabel(finding.scoped_document.document_type)}
            {finding.recipient_user ? ` · ${finding.recipient_user.name}` : ''}
          </p>
        </div>
        <time className="shrink-0 text-xs text-muted" dateTime={finding.created_at}>
          {formatDate(finding.created_at)}
        </time>
      </header>

      <section className="mt-4 space-y-2" aria-label="Evidence">
        {finding.evidence.map((item) => (
          <blockquote
            key={`${item.source_type}-${item.source_document_id ?? item.quote}`}
            className="rounded-md border border-border/70 bg-border/20 px-3 py-2 text-sm text-foreground"
          >
            <p>{item.quote}</p>
            <footer className="mt-1 text-xs text-muted">
              {formatLabel(item.source_type)}
              {item.observed_at ? ` · ${formatDate(item.observed_at)}` : ''}
            </footer>
          </blockquote>
        ))}
      </section>

      {primaryActionCandidate && (
        <ActionCandidateSummary actionCandidate={primaryActionCandidate} />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canDecide && (
          <>
            <button
              type="button"
              aria-label="Approve finding"
              onClick={handleApprove}
              disabled={isBusy}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {pendingAction === 'approve' ? 'Approving...' : 'Approve'}
            </button>
            <button
              type="button"
              aria-label="Reject finding"
              onClick={() => handleOpenDecisionForm('reject')}
              disabled={isBusy}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-border/60 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              aria-label="Dismiss finding"
              onClick={() => handleOpenDecisionForm('dismiss')}
              disabled={isBusy}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-border/60 disabled:opacity-50"
            >
              Dismiss
            </button>
            <button
              type="button"
              aria-label="Snooze finding"
              onClick={() => handleOpenDecisionForm('snooze')}
              disabled={isBusy}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-border/60 disabled:opacity-50"
            >
              Snooze
            </button>
          </>
        )}
        {canResume && (
          <button
            type="button"
            aria-label="Resume approved action"
            onClick={handleResume}
            disabled={isBusy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {pendingAction === 'resume' ? 'Resuming...' : 'Resume'}
          </button>
        )}
      </div>

      {decisionFormKind && decisionFormTitle && (
        <div className="mt-4 rounded-md border border-border bg-border/10 p-3">
          <p className="text-sm font-medium text-foreground">{decisionFormTitle}</p>
          <div className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-muted" htmlFor={`${finding.id}-${decisionFormKind}-reason`}>
              {formatLabel(decisionFormKind)} reason
            </label>
            <textarea
              id={`${finding.id}-${decisionFormKind}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              placeholder="Add context for the audit trail"
            />
            {decisionFormKind === 'snooze' && (
              <div>
                <label className="block text-xs font-medium text-muted" htmlFor={`${finding.id}-snooze-until`}>
                  Snooze until
                </label>
                <input
                  id={`${finding.id}-snooze-until`}
                  type="datetime-local"
                  value={snoozeExpiresAt}
                  onChange={(event) => setSnoozeExpiresAt(event.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelDecision}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-border/60"
              >
                Cancel
              </button>
              <button
                type="button"
                aria-label={`Confirm ${decisionFormKind}`}
                onClick={handleConfirmDecision}
                disabled={!reasonIsValid || !snoozeIsValid || isBusy}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function ActionCandidateSummary({ actionCandidate }: { actionCandidate: FleetGraphActionCandidate }) {
  return (
    <section className="mt-4 rounded-md border border-border/70 bg-border/10 px-3 py-3" aria-label="Recommended action">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{formatLabel(actionCandidate.recommended_action.kind)}</span>
        <span aria-hidden="true">·</span>
        <span>{formatLabel(actionCandidate.approval_level)}</span>
        <span aria-hidden="true">·</span>
        <span>{formatLabel(actionCandidate.reversibility)}</span>
      </div>
      {actionCandidate.recommended_action.title && (
        <p className="mt-2 text-sm font-medium text-foreground">
          {actionCandidate.recommended_action.title}
        </p>
      )}
      <p className="mt-1 text-sm text-foreground">
        {actionCandidate.recommended_action.body}
      </p>
      <p className="mt-2 text-xs text-muted">
        {actionCandidate.owner_user ? actionCandidate.owner_user.name : 'Unassigned'} · {actionCandidate.role_reason}
      </p>
    </section>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={cn('rounded border px-2 py-0.5 text-xs font-medium', className)}>
      {children}
    </span>
  );
}

function formatLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
