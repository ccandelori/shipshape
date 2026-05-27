import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbeddedChat } from './EmbeddedChat';

const realFetch = global.fetch;

type JsonResponseBody = { token: string } | { error: string; retry_after_seconds: number };

function jsonResponse(data: JsonResponseBody, status: number): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function sseResponse(events: string[]): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });

  return Promise.resolve(new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  }));
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe('EmbeddedChat', () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('streams assistant tokens into the active response', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/chat' && method === 'POST') {
        expect(JSON.parse(String(init?.body))).toEqual({
          documentId: 'week-1',
          documentType: 'sprint',
          question: 'What is risky?',
          conversationHistory: [],
        });
        return sseResponse([
          'event: heartbeat\ndata: {"sentAt":"2026-05-26T12:00:00.000Z"}\n\n',
          'event: token\ndata: {"token":"Week 12 "}\n\n',
          'event: token\ndata: {"token":"is at risk."}\n\n',
          'event: final\ndata: {"response":"Week 12 is at risk.","usage":{"modelName":"gpt-4o-mini","inputTokens":100,"outputTokens":10,"totalTokens":110}}\n\n',
        ]);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<EmbeddedChat documentId="week-1" documentType="sprint" />);

    fireEvent.change(screen.getByLabelText('Ask FleetGraph'), {
      target: { value: 'What is risky?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Week 12 is at risk.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('What is risky?')).toBeInTheDocument();
    });
  });

  it('sends when crypto.randomUUID is unavailable (HTTP deploy)', async () => {
    const originalRandomUUID = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => {
        throw new TypeError('randomUUID is not available');
      },
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/chat' && method === 'POST') {
        return sseResponse([
          'event: final\ndata: {"response":"ok on http","usage":{"modelName":"gpt-4o-mini","inputTokens":1,"outputTokens":1,"totalTokens":2}}\n\n',
        ]);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    try {
      render(<EmbeddedChat documentId="week-1" documentType="sprint" />);

      fireEvent.change(screen.getByLabelText('Ask FleetGraph'), {
        target: { value: 'Hello?' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

      expect(await screen.findByText('ok on http')).toBeInTheDocument();
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        configurable: true,
        value: originalRandomUUID,
      });
    }
  });

  it('shows rate-limit errors without leaving the composer disabled', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/chat' && method === 'POST') {
        return jsonResponse({
          error: 'FleetGraph chat rate limit exceeded',
          retry_after_seconds: 42,
        }, 429);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<EmbeddedChat documentId="week-1" documentType="sprint" />);

    fireEvent.change(screen.getByLabelText('Ask FleetGraph'), {
      target: { value: 'What is risky?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'FleetGraph chat rate limit exceeded. Try again in 42 seconds.'
    );
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Ask FleetGraph'), {
      target: { value: 'Try again later' },
    });
    expect(screen.getByRole('button', { name: 'Send message' })).not.toBeDisabled();
  });
});
