import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionItemsModal } from './ActionItemsModal';

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
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

function ActionItemsModalHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <main data-testid="main-content">
        <button type="button" onClick={() => setOpen(true)}>
          Open action items
        </button>
      </main>
      <ActionItemsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe('ActionItemsModal', () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('moves focus into the dialog when opened from the page content', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';

      if (url === '/api/accountability/action-items' && method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({
          items: [],
          total: 0,
          has_overdue: false,
          has_due_today: false,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<ActionItemsModalHarness />, { wrapper: createWrapper(createQueryClient()) });

    const trigger = screen.getByRole('button', { name: 'Open action items' });
    trigger.focus();
    fireEvent.click(trigger);

    const closeButton = await screen.findByRole('button', { name: 'Close' });
    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });
  });
});
