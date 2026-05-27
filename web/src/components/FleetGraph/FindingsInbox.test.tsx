import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FindingsInbox } from './FindingsInbox';
import type { FleetGraphFinding, FleetGraphFindingListResponse } from '@/hooks/useFleetGraphQuery';

const realFetch = global.fetch;

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
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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

function jsonResponse(data: FleetGraphFindingListResponse | FleetGraphFinding | { token: string }, status: number): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
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

  it('renders open findings and approves through the FleetGraph API mutation', async () => {
    const openFinding = createFinding('open');
    const approvedFinding = createFinding('approved');
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return jsonResponse({
          items: [openFinding],
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

    render(<FindingsInbox />, { wrapper: createWrapper(createQueryClient()) });

    expect(await screen.findByText('Week 12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve finding' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input, init]) => (
        requestUrl(input) === '/api/fleetgraph/findings/finding-1/approve'
        && init?.method === 'POST'
      ))).toBe(true);
    });
  });
});
