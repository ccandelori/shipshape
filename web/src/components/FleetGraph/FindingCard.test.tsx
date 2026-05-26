import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FindingCard, type FindingCardActionHandlers } from './FindingCard';
import type { FleetGraphFinding } from '@/hooks/useFleetGraphQuery';

function createFinding(lifecycleState: FleetGraphFinding['lifecycle_state']): FleetGraphFinding {
  return {
    id: 'finding-1',
    workspace_id: 'workspace-1',
    scoped_document: {
      id: 'week-1',
      document_type: 'sprint',
      title: 'Week 12',
    },
    detector_type: 'at_risk_week',
    severity: 'high',
    evidence: [
      {
        source_type: 'standup',
        source_document_id: 'standup-1',
        quote: 'Blocked on partner API',
        observed_at: '2026-05-26T12:00:00.000Z',
      },
    ],
    recipient_user: {
      id: 'user-1',
      name: 'Riley',
      email: 'riley@example.com',
    },
    lifecycle_state: lifecycleState,
    material_change_key: 'material-key-1',
    created_at: '2026-05-26T12:00:00.000Z',
    updated_at: '2026-05-26T12:00:00.000Z',
    expires_at: null,
    action_candidates: [
      {
        id: 'action-1',
        finding_id: 'finding-1',
        target_document: {
          id: 'week-1',
          document_type: 'sprint',
          title: 'Week 12',
        },
        owner_user: {
          id: 'owner-1',
          name: 'Morgan',
          email: 'morgan@example.com',
        },
        role_reason: 'Owns the weekly delivery plan',
        urgency: 'high',
        evidence: [
          {
            source_type: 'issue',
            source_document_id: 'issue-1',
            quote: 'API integration is still blocked',
          },
        ],
        recommended_action: {
          kind: 'draft_comment',
          title: 'Ask for unblock plan',
          body: 'Ask Morgan for the concrete unblock plan before Friday.',
        },
        approval_level: 'approval_required',
        reversibility: 'reversible',
      },
    ],
  };
}

function createActionHandlers(): FindingCardActionHandlers {
  return {
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onDismiss: vi.fn(),
    onSnooze: vi.fn(),
    onResume: vi.fn(),
  };
}

describe('FindingCard', () => {
  it('renders evidence and submits lifecycle actions for an open finding', () => {
    const actions = createActionHandlers();
    render(
      <FindingCard
        finding={createFinding('open')}
        actions={actions}
        pendingAction={null}
      />
    );

    expect(screen.getByText('Week 12')).toBeInTheDocument();
    expect(screen.getByText('Blocked on partner API')).toBeInTheDocument();
    expect(screen.getByText('Ask Morgan for the concrete unblock plan before Friday.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve finding' }));
    expect(actions.onApprove).toHaveBeenCalledWith({
      findingId: 'finding-1',
      actionCandidateId: 'action-1',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reject finding' }));
    fireEvent.change(screen.getByLabelText('Reject reason'), {
      target: { value: 'Needs human review first' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    expect(actions.onReject).toHaveBeenCalledWith({
      findingId: 'finding-1',
      reason: 'Needs human review first',
    });
  });

  it('shows resume without approval controls after a finding is approved', () => {
    const actions = createActionHandlers();
    render(
      <FindingCard
        finding={createFinding('approved')}
        actions={actions}
        pendingAction={null}
      />
    );

    expect(screen.queryByRole('button', { name: 'Approve finding' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume approved action' }));

    expect(actions.onResume).toHaveBeenCalledWith({ actionCandidateId: 'action-1' });
  });

  it('submits dismiss and snooze decisions with audit reasons', () => {
    const actions = createActionHandlers();
    render(
      <FindingCard
        finding={createFinding('pending_review')}
        actions={actions}
        pendingAction={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss finding' }));
    fireEvent.change(screen.getByLabelText('Dismiss reason'), {
      target: { value: 'Known duplicate' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm dismiss' }));
    expect(actions.onDismiss).toHaveBeenCalledWith({
      findingId: 'finding-1',
      reason: 'Known duplicate',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Snooze finding' }));
    fireEvent.change(screen.getByLabelText('Snooze reason'), {
      target: { value: 'Waiting for Friday update' },
    });
    fireEvent.change(screen.getByLabelText('Snooze until'), {
      target: { value: '2026-05-27T09:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm snooze' }));

    expect(actions.onSnooze).toHaveBeenCalledWith({
      findingId: 'finding-1',
      reason: 'Waiting for Friday update',
      expiresAt: new Date('2026-05-27T09:30').toISOString(),
    });
  });
});
