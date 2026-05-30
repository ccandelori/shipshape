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
    is_unread: false,
    trace: null,
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

function createFindingWithRecommendedActionKind(
  lifecycleState: FleetGraphFinding['lifecycle_state'],
  actionKind: FleetGraphFinding['action_candidates'][number]['recommended_action']['kind']
): FleetGraphFinding {
  const finding = createFinding(lifecycleState);
  const primaryActionCandidate = finding.action_candidates[0]!;

  return {
    ...finding,
    action_candidates: [
      {
        ...primaryActionCandidate,
        recommended_action: {
          ...primaryActionCandidate.recommended_action,
          kind: actionKind,
          body: 'Assign an owner to recover the proof path for the shared observability evidence.',
        },
      },
    ],
  };
}

describe('FindingCard', () => {
  it('renders evidence and limits open findings to suppressing actions', () => {
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
    expect(screen.queryByRole('button', { name: 'Approve finding' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject finding' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss finding' }));
    fireEvent.change(screen.getByLabelText('Dismiss reason'), {
      target: { value: 'Known and tracked elsewhere' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm dismiss' }));
    expect(actions.onDismiss).toHaveBeenCalledWith({
      findingId: 'finding-1',
      reason: 'Known and tracked elsewhere',
    });
  });

  it('marks unread findings with a compact new badge', () => {
    render(
      <FindingCard
        finding={{ ...createFinding('open'), is_unread: true }}
        actions={createActionHandlers()}
        pendingAction={null}
      />
    );

    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('shows why the finding exists and links its trace when run metadata is available', () => {
    const actions = createActionHandlers();
    const finding: FleetGraphFinding = {
      ...createFinding('pending_review'),
      trace: {
        run_id: 'fleetgraph-run-123',
        trigger: 'proactive',
        detector: 'at_risk_week',
        model_name: 'gpt-4.1-mini',
        input_tokens: 1180,
        output_tokens: 260,
        estimated_cost_usd: '0.000900',
        branch_path: 'output',
        trace_url: 'https://cloud.langfuse.com/project/demo/traces/fleetgraph-run-123',
        created_at: '2026-05-26T12:01:00.000Z',
      },
    };

    render(
      <FindingCard
        finding={finding}
        actions={actions}
        pendingAction={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Why this?' }));

    expect(screen.getByText('Graph observability')).toBeInTheDocument();
    expect(screen.getByText('Public trace')).toBeInTheDocument();
    expect(screen.getByText('Run fleetgraph-run-123')).toBeInTheDocument();
    expect(screen.getByText('Path Output')).toBeInTheDocument();
    expect(screen.getByText('Input 1,180')).toBeInTheDocument();
    expect(screen.getByText('Output 260')).toBeInTheDocument();
    expect(screen.getByText('Cost $0.000900')).toBeInTheDocument();
    expect(screen.getByText('Material key')).toBeInTheDocument();
    expect(screen.getByText('material-key-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Langfuse trace' })).toHaveAttribute(
      'href',
      'https://cloud.langfuse.com/project/demo/traces/fleetgraph-run-123'
    );
  });

  it('distinguishes local run metadata from a public trace link', () => {
    const finding: FleetGraphFinding = {
      ...createFinding('pending_review'),
      trace: {
        run_id: 'fleetgraph-run-local',
        trigger: 'poll',
        detector: 'at_risk_week',
        model_name: 'gpt-4.1-mini',
        input_tokens: 740,
        output_tokens: 128,
        estimated_cost_usd: '0.000512',
        branch_path: 'prefilter-exit',
        trace_url: null,
        created_at: '2026-05-26T12:01:00.000Z',
      },
    };

    render(
      <FindingCard
        finding={finding}
        actions={createActionHandlers()}
        pendingAction={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Why this?' }));

    expect(screen.getByText('Local telemetry')).toBeInTheDocument();
    expect(screen.getByText('Trace status')).toBeInTheDocument();
    expect(screen.getByText('Not publicly shared')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open Langfuse trace' })).not.toBeInTheDocument();
  });

  it('approves and rejects pending-review findings', () => {
    const actions = createActionHandlers();
    render(
      <FindingCard
        finding={createFinding('pending_review')}
        actions={actions}
        pendingAction={null}
      />
    );

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

  it('does not offer resume for approved actions that are not executable in Ship yet', () => {
    const actions = createActionHandlers();
    render(
      <FindingCard
        finding={createFindingWithRecommendedActionKind('approved', 'assign_issue')}
        actions={actions}
        pendingAction={null}
      />
    );

    expect(screen.queryByRole('button', { name: 'Resume approved action' })).not.toBeInTheDocument();
    expect(screen.getByText('Manual follow-up required')).toBeInTheDocument();
  });

  it('submits dismiss and snooze decisions with audit reasons', () => {
    const actions = createActionHandlers();
    render(
      <FindingCard
        finding={createFinding('open')}
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
