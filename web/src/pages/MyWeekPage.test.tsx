import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyWeekPage } from './MyWeekPage';

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
  return function MyWeekPageWrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/my-week']}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('MyWeekPage', () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('shows recovery actions when week data cannot be loaded', async () => {
    global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      error: 'Person not found for current user',
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }))) as typeof fetch;

    render(<MyWeekPage />, { wrapper: createWrapper(createQueryClient()) });

    expect(await screen.findByRole('heading', { name: 'Week data could not be loaded' })).toBeInTheDocument();
    expect(screen.getByText('HTTP 404')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Documents' })).toHaveAttribute('href', '/docs');
    expect(screen.getByRole('button', { name: 'Return to login' })).toBeInTheDocument();
  });
});
