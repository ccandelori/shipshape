import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FleetGraphInboxModal } from './FleetGraphInboxModal';
import { ToastProvider } from '@/components/ui/Toast';

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

function jsonResponse(): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify({
    items: [],
    lifecycle_counts: {
      open: 0,
      pending_review: 0,
      approved: 0,
      executed: 0,
      rejected: 0,
      dismissed: 0,
      snoozed: 0,
      expired: 0,
    },
    limit: 20,
    hasMore: false,
    next_cursor: null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('FleetGraphInboxModal', () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('renders the inbox in a dialog and closes from the header button', async () => {
    global.fetch = vi.fn(() => jsonResponse()) as typeof fetch;
    const handleClose = vi.fn();

    render(
      <FleetGraphInboxModal open={true} onClose={handleClose} />,
      { wrapper: createWrapper(createQueryClient()) }
    );

    expect(await screen.findByRole('dialog', { name: 'FleetGraph Inbox' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close FleetGraph inbox' }));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
