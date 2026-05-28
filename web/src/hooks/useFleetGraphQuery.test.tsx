import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useMarkFleetGraphInboxOpenedMutation,
  useMarkFleetGraphFindingsReadMutation,
  useFleetGraphFindingsQuery,
  type FleetGraphFinding,
  type FleetGraphFindingListResponse,
} from './useFleetGraphQuery';

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

function jsonResponse(data: FleetGraphFindingListResponse, status: number): Promise<Response> {
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

function createFleetGraphFinding(): FleetGraphFinding {
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
    lifecycle_state: 'open',
    material_change_key: 'material-key-1',
    created_at: '2026-05-26T12:00:00.000Z',
    updated_at: '2026-05-26T12:00:00.000Z',
    expires_at: null,
    trace: null,
    action_candidates: [],
  };
}

describe('useFleetGraphFindingsQuery', () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('fetches findings with lifecycle, limit, and cursor filters under one cache namespace', async () => {
    const responseBody: FleetGraphFindingListResponse = {
      items: [createFleetGraphFinding()],
      lifecycle_counts: {
        open: 1,
        pending_review: 0,
        approved: 0,
        executed: 0,
        rejected: 0,
        dismissed: 0,
        snoozed: 0,
        expired: 0,
      },
      unread_lifecycle_counts: {
        open: 1,
        pending_review: 0,
        approved: 0,
        executed: 0,
        rejected: 0,
        dismissed: 0,
        snoozed: 0,
        expired: 0,
      },
      limit: 10,
      hasMore: true,
      next_cursor: 'cursor-2',
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      expect(requestUrl(input)).toBe('/api/fleetgraph/findings?lifecycle_state=open&limit=10&cursor=cursor-1');
      return jsonResponse(responseBody, 200);
    });
    global.fetch = fetchMock as typeof fetch;

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useFleetGraphFindingsQuery({
        lifecycleState: 'open',
        limit: 10,
        cursor: 'cursor-1',
      }, { enabled: true }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().findAll({ queryKey: ['fleetgraph', 'findings'] })).toHaveLength(1);
  });
});

describe('useMarkFleetGraphInboxOpenedMutation', () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('posts the inbox-opened watermark and invalidates FleetGraph findings', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/csrf-token' && method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({ token: 'csrf-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      if (url === '/api/fleetgraph/inbox/opened' && method === 'POST') {
        expect(init?.headers).toEqual({
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'csrf-token',
        });
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;
    const queryClient = createQueryClient();
    queryClient.setQueryData(['fleetgraph', 'findings', 'list'], { stale: true });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(
      () => useMarkFleetGraphInboxOpenedMutation(),
      { wrapper: createWrapper(queryClient) }
    );

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(fetchMock.mock.calls.some(([input, init]) => (
      requestUrl(input) === '/api/fleetgraph/inbox/opened'
      && init?.method === 'POST'
    ))).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['fleetgraph', 'findings'] });
  });
});

describe('useMarkFleetGraphFindingsReadMutation', () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('posts visible finding ids and invalidates FleetGraph findings', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/csrf-token' && method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({ token: 'csrf-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      if (url === '/api/fleetgraph/findings/read' && method === 'POST') {
        expect(JSON.parse(String(init?.body))).toEqual({
          finding_ids: ['finding-1', 'finding-2'],
        });
        expect(init?.headers).toEqual({
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'csrf-token',
        });
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(
      () => useMarkFleetGraphFindingsReadMutation(),
      { wrapper: createWrapper(queryClient) }
    );

    result.current.mutate({ findingIds: ['finding-1', 'finding-2'] });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(fetchMock.mock.calls.some(([input, init]) => (
      requestUrl(input) === '/api/fleetgraph/findings/read'
      && init?.method === 'POST'
    ))).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['fleetgraph', 'findings'] });
  });
});
