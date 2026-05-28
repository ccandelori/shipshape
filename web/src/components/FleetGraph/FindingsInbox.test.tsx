import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FindingsInbox } from './FindingsInbox';
import { ToastProvider } from '@/components/ui/Toast';
import type { FleetGraphFinding, FleetGraphFindingListResponse } from '@/hooks/useFleetGraphQuery';

const realFetch = global.fetch;

type FleetGraphFindingListTestResponse = Omit<
  FleetGraphFindingListResponse,
  'lifecycle_counts' | 'unread_lifecycle_counts'
> & {
  lifecycle_counts?: FleetGraphFindingListResponse['lifecycle_counts'];
  unread_lifecycle_counts?: FleetGraphFindingListResponse['unread_lifecycle_counts'];
};

type FleetGraphLifecycleCountsTestOverrides = Partial<FleetGraphFindingListResponse['lifecycle_counts']>;

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient): ({ children }: { children: ReactNode }) => JSX.Element {
  return function QueryWrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

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
      },
    ],
    recipient_user: null,
    lifecycle_state: lifecycleState,
    material_change_key: 'material-key-1',
    created_at: '2026-05-26T12:00:00.000Z',
    updated_at: '2026-05-26T12:00:00.000Z',
    expires_at: null,
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
        owner_user: null,
        role_reason: 'Owns this week',
        urgency: 'high',
        evidence: [
          {
            source_type: 'issue',
            quote: 'Blocked issue',
          },
        ],
        recommended_action: {
          kind: 'draft_comment',
          body: 'Ask for an unblock plan.',
        },
        approval_level: 'approval_required',
        reversibility: 'reversible',
      },
    ],
  };
}

function jsonResponse(
  data: FleetGraphFindingListTestResponse | FleetGraphFinding | { token: string },
  status: number
): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(withDefaultLifecycleCounts(data)), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function withDefaultLifecycleCounts(
  data: FleetGraphFindingListTestResponse | FleetGraphFinding | { token: string }
): FleetGraphFindingListResponse | FleetGraphFinding | { token: string } {
  if (!('items' in data)) {
    return data;
  }

  return {
    ...data,
    lifecycle_counts: data.lifecycle_counts ?? createLifecycleCounts(),
    unread_lifecycle_counts: data.unread_lifecycle_counts ?? createLifecycleCounts(),
  };
}

function createLifecycleCounts(
  overrides?: FleetGraphLifecycleCountsTestOverrides
): FleetGraphFindingListResponse['lifecycle_counts'] {
  return {
    open: 0,
    pending_review: 0,
    approved: 0,
    executed: 0,
    rejected: 0,
    dismissed: 0,
    snoozed: 0,
    expired: 0,
    ...overrides,
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe('FindingsInbox', () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('switches lifecycle tabs and approves a pending-review finding through the FleetGraph API mutation', async () => {
    const openFinding = createFinding('open');
    const pendingFinding = createFinding('pending_review');
    const approvedFinding = createFinding('approved');
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [openFinding],
          lifecycle_counts: createLifecycleCounts({ open: 1, pending_review: 1 }),
          unread_lifecycle_counts: createLifecycleCounts({ open: 1, pending_review: 1 }),
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/fleetgraph/findings?lifecycle_state=pending_review&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [pendingFinding],
          lifecycle_counts: createLifecycleCounts({ open: 1, pending_review: 1 }),
          unread_lifecycle_counts: createLifecycleCounts({ open: 1, pending_review: 1 }),
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/findings/finding-1/approve' && method === 'POST') {
        expect(JSON.parse(String(init?.body))).toEqual({ action_candidate_id: 'action-1' });
        expect(init?.headers).toEqual({
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'csrf-token',
        });
        return jsonResponse(approvedFinding, 200);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<FindingsInbox lifecycleState="open" />, { wrapper: createWrapper(createQueryClient()) });

    expect(await screen.findByText('Week 12')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Open 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Needs Review 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Approved' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve finding' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Needs Review 1' }));
    expect(await screen.findByRole('button', { name: 'Approve finding' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve finding' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input, init]) => (
        requestUrl(input) === '/api/fleetgraph/findings/finding-1/approve'
        && init?.method === 'POST'
      ))).toBe(true);
    });
    expect(await screen.findByText('Action approved. Ready to resume.')).toBeInTheDocument();
  });

  it('rejects a pending-review finding through the FleetGraph API mutation', async () => {
    const pendingFinding = createFinding('pending_review');
    const rejectedFinding = createFinding('rejected');
    let rejected = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [],
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/fleetgraph/findings?lifecycle_state=pending_review&limit=20' && method === 'GET') {
        return jsonResponse({
          items: rejected ? [] : [pendingFinding],
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/findings/finding-1/reject' && method === 'POST') {
        rejected = true;
        expect(JSON.parse(String(init?.body))).toEqual({ reason: 'Already handled by team lead' });
        expect(init?.headers).toEqual({
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'csrf-token',
        });
        return jsonResponse(rejectedFinding, 200);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<FindingsInbox />, { wrapper: createWrapper(createQueryClient()) });

    expect(await screen.findByText('No open findings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Needs Review' }));
    expect(await screen.findByRole('button', { name: 'Reject finding' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject finding' }));
    fireEvent.change(screen.getByLabelText('Reject reason'), {
      target: { value: 'Already handled by team lead' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input, init]) => (
        requestUrl(input) === '/api/fleetgraph/findings/finding-1/reject'
        && init?.method === 'POST'
      ))).toBe(true);
    });
    expect(await screen.findByText('No findings need review')).toBeInTheDocument();
    expect(await screen.findByText('Finding rejected.')).toBeInTheDocument();
  });

  it('shows a visible confirmation after dismissing an open finding', async () => {
    const openFinding = createFinding('open');
    const dismissedFinding = createFinding('dismissed');
    let dismissed = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return jsonResponse({
          items: dismissed ? [] : [openFinding],
          lifecycle_counts: createLifecycleCounts({
            open: dismissed ? 0 : 1,
            dismissed: dismissed ? 1 : 0,
          }),
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/findings/finding-1/dismiss' && method === 'POST') {
        dismissed = true;
        expect(JSON.parse(String(init?.body))).toEqual({ reason: 'Noise for this demo' });
        return jsonResponse(dismissedFinding, 200);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<FindingsInbox />, { wrapper: createWrapper(createQueryClient()) });

    expect(await screen.findByRole('button', { name: 'Dismiss finding' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss finding' }));
    fireEvent.change(screen.getByLabelText('Dismiss reason'), {
      target: { value: 'Noise for this demo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm dismiss' }));

    expect(await screen.findByText('Finding dismissed.')).toBeInTheDocument();
    expect(await screen.findByText('No open findings')).toBeInTheDocument();
  });

  it('names the selected lifecycle in the empty state', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [],
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/fleetgraph/findings?lifecycle_state=pending_review&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [],
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<FindingsInbox />, { wrapper: createWrapper(createQueryClient()) });

    expect(await screen.findByText('No open findings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Needs Review' }));
    expect(await screen.findByText('No findings need review')).toBeInTheDocument();
  });

  it('lands on needs-review findings when the inbox has multiple actionable tabs', async () => {
    const pendingFinding = createFinding('pending_review');
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [],
          lifecycle_counts: createLifecycleCounts({
            open: 1,
            pending_review: 2,
            approved: 1,
          }),
          unread_lifecycle_counts: createLifecycleCounts({
            open: 1,
            pending_review: 2,
            approved: 1,
          }),
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/fleetgraph/findings?lifecycle_state=pending_review&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [pendingFinding],
          lifecycle_counts: createLifecycleCounts({
            open: 1,
            pending_review: 2,
            approved: 1,
          }),
          unread_lifecycle_counts: createLifecycleCounts({
            open: 1,
            pending_review: 2,
            approved: 1,
          }),
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<FindingsInbox />, { wrapper: createWrapper(createQueryClient()) });

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Needs Review 2' })).toHaveAttribute('aria-selected', 'true');
    });
    expect(await screen.findByRole('button', { name: 'Approve finding' })).toBeInTheDocument();
  });

  it('lands on approved actions before open findings when no findings need review', async () => {
    const approvedFinding = createFinding('approved');
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [],
          lifecycle_counts: createLifecycleCounts({ open: 3, approved: 1 }),
          unread_lifecycle_counts: createLifecycleCounts({ open: 3, approved: 1 }),
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/fleetgraph/findings?lifecycle_state=approved&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [approvedFinding],
          lifecycle_counts: createLifecycleCounts({ open: 3, approved: 1 }),
          unread_lifecycle_counts: createLifecycleCounts({ open: 3, approved: 1 }),
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<FindingsInbox />, { wrapper: createWrapper(createQueryClient()) });

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Approved 1' })).toHaveAttribute('aria-selected', 'true');
    });
    expect(await screen.findByRole('button', { name: 'Resume approved action' })).toBeInTheDocument();
  });

  it('keeps unread tab badges from the modal-open snapshot while list data refreshes', async () => {
    const pendingFinding = createFinding('pending_review');
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [],
          lifecycle_counts: createLifecycleCounts({ open: 4, pending_review: 2, approved: 1 }),
          unread_lifecycle_counts: createLifecycleCounts(),
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/fleetgraph/findings?lifecycle_state=pending_review&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [pendingFinding],
          lifecycle_counts: createLifecycleCounts({ open: 4, pending_review: 2, approved: 1 }),
          unread_lifecycle_counts: createLifecycleCounts(),
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(
      <FindingsInbox
        initialUnreadLifecycleCounts={createLifecycleCounts({ open: 1, pending_review: 2, approved: 1 })}
      />,
      { wrapper: createWrapper(createQueryClient()) }
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Needs Review 2' })).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByRole('tab', { name: 'Open 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Approved 1' })).toBeInTheDocument();
  });

  it('shows a visible payoff after resuming an approved FleetGraph action', async () => {
    const approvedFinding = createFinding('approved');
    const executedFinding = createFinding('executed');
    let resumed = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [],
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/fleetgraph/findings?lifecycle_state=approved&limit=20' && method === 'GET') {
        return jsonResponse({
          items: resumed ? [] : [approvedFinding],
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }, 200);
      }

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/actions/action-1/resume' && method === 'POST') {
        resumed = true;
        return jsonResponse(executedFinding, 200);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<FindingsInbox />, { wrapper: createWrapper(createQueryClient()) });

    expect(await screen.findByText('No open findings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Approved' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resume approved action' }));

    expect(await screen.findByText('Comment posted by FleetGraph')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View document' })).toBeInTheDocument();
    expect(await screen.findByText('No approved actions')).toBeInTheDocument();
  });
});
