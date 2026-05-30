import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FleetGraphInboxModal } from './FleetGraphInboxModal';
import { ToastProvider } from '@/components/ui/Toast';
import type { FleetGraphLifecycleCounts } from '@/hooks/useFleetGraphQuery';

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
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

function createLifecycleCounts(overrides?: Partial<FleetGraphLifecycleCounts>): FleetGraphLifecycleCounts {
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

function jsonResponse(): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify({
    items: [],
    lifecycle_counts: createLifecycleCounts(),
    unread_lifecycle_counts: createLifecycleCounts(),
    limit: 20,
    hasMore: false,
    next_cursor: null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe('FleetGraphInboxModal', () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('renders the inbox in a dialog and closes from the header button', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return jsonResponse();
      }
      if (url === '/api/csrf-token' && method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({ token: 'csrf-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      if (url === '/api/fleetgraph/inbox/opened' && method === 'POST') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    }) as typeof fetch;
    const handleClose = vi.fn();

    render(
      <FleetGraphInboxModal open={true} onClose={handleClose} />,
      { wrapper: createWrapper(createQueryClient()) }
    );

    const dialog = await screen.findByRole('dialog', { name: 'FleetGraph Inbox' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass('fleetgraph-inbox-modal-content');
    fireEvent.click(screen.getByRole('button', { name: 'Close FleetGraph inbox' }));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('marks the inbox opened and passes initial unread counts to tab badges', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/fleetgraph/findings?lifecycle_state=open&limit=20' && method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({
          items: [],
          lifecycle_counts: createLifecycleCounts({ open: 1 }),
          unread_lifecycle_counts: createLifecycleCounts(),
          limit: 20,
          hasMore: false,
          next_cursor: null,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      if (url === '/api/csrf-token' && method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({ token: 'csrf-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      if (url === '/api/fleetgraph/inbox/opened' && method === 'POST') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(
      <FleetGraphInboxModal
        open={true}
        onClose={vi.fn()}
        unreadLifecycleCountsSnapshot={createLifecycleCounts({ open: 1 })}
      />,
      { wrapper: createWrapper(createQueryClient()) }
    );

    expect(await screen.findByRole('tab', { name: 'Open 1' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => (
      requestUrl(input) === '/api/fleetgraph/inbox/opened' && init?.method === 'POST'
    ))).toBe(true);
  });
});
