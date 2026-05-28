import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT } from '@/lib/fleetgraphChatMemory';
import { EmbeddedChat } from './EmbeddedChat';

const realFetch = global.fetch;

type JsonResponseBody = { token: string } | { error: string; retry_after_seconds: number };

interface FleetGraphChatTestRequest {
  documentId: string;
  documentType: string;
  question: string;
  conversationHistory: Array<{
    role: string;
    content: string;
  }>;
}

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
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('sends a suggested prompt from the empty state', async () => {
    const requests: FleetGraphChatTestRequest[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/chat' && method === 'POST') {
        requests.push(JSON.parse(String(init?.body)) as FleetGraphChatTestRequest);
        return sseResponse([
          'event: final\ndata: {"response":"The week is blocked by trace evidence.","usage":{"modelName":"gpt-4o-mini","inputTokens":100,"outputTokens":10,"totalTokens":110}}\n\n',
        ]);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<EmbeddedChat documentId="week-1" documentType="sprint" />);

    fireEvent.click(screen.getByRole('button', { name: 'What is blocking this?' }));

    expect(await screen.findByText('The week is blocked by trace evidence.')).toBeInTheDocument();
    expect(requests[0]).toMatchObject({
      documentId: 'week-1',
      documentType: 'sprint',
      question: 'What is blocking this?',
      conversationHistory: [],
    });
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
          'event: final\ndata: {"response":"Week 12 is at risk.","usage":{"modelName":"gpt-4o-mini","inputTokens":100,"outputTokens":10,"totalTokens":110},"sources":[{"label":"Week 12","documentId":"week-1","documentType":"sprint","kind":"scope"},{"label":"Procurement blocker","documentId":"issue-1","documentType":"issue","kind":"related"}]}\n\n',
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
    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Week 12' })).toHaveAttribute('href', '/documents/week-1');
    expect(screen.getByText('Procurement blocker')).toBeInTheDocument();
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
    const requests: FleetGraphChatTestRequest[] = [];
    let mode: 'rate-limit' | 'success' = 'rate-limit';
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/chat' && method === 'POST') {
        requests.push(JSON.parse(String(init?.body)) as FleetGraphChatTestRequest);
        if (mode === 'success') {
          return sseResponse([
            'event: final\ndata: {"response":"Recovered after rate limit.","usage":{"modelName":"gpt-4o-mini","inputTokens":100,"outputTokens":10,"totalTokens":110}}\n\n',
          ]);
        }

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

    mode = 'success';
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Recovered after rate limit.')).toBeInTheDocument();
    await waitFor(() => {
      expect(requests).toHaveLength(2);
    });
    expect(requests[1]).toMatchObject({
      question: 'Try again later',
      conversationHistory: [
        {
          role: 'user',
          content: 'What is risky?',
        },
      ],
    });
    expect(JSON.stringify(requests[1])).not.toContain('FleetGraph chat rate limit exceeded');
  });

  it('restores document-scoped conversation after the chat panel is reopened', async () => {
    const requests: FleetGraphChatTestRequest[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/chat' && method === 'POST') {
        requests.push(JSON.parse(String(init?.body)) as FleetGraphChatTestRequest);
        return sseResponse([
          'event: final\ndata: {"response":"Week 12 is blocked by trace evidence.","usage":{"modelName":"gpt-4o-mini","inputTokens":100,"outputTokens":10,"totalTokens":110}}\n\n',
        ]);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    const firstRender = render(<EmbeddedChat documentId="week-1" documentType="sprint" />);

    fireEvent.change(screen.getByLabelText('Ask FleetGraph'), {
      target: { value: 'What is blocking this week?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Week 12 is blocked by trace evidence.')).toBeInTheDocument();
    firstRender.unmount();

    render(<EmbeddedChat documentId="week-1" documentType="sprint" />);

    expect(screen.getByText('What is blocking this week?')).toBeInTheDocument();
    expect(screen.getByText('Week 12 is blocked by trace evidence.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Ask FleetGraph'), {
      target: { value: 'What should we do next?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(requests).toHaveLength(2);
    });
    expect(requests[1]).toMatchObject({
      documentId: 'week-1',
      documentType: 'sprint',
      question: 'What should we do next?',
      conversationHistory: [
        {
          role: 'user',
          content: 'What is blocking this week?',
        },
        {
          role: 'assistant',
          content: 'Week 12 is blocked by trace evidence.',
        },
      ],
    });
  });

  it('starts a new chat by clearing document-scoped conversation memory', async () => {
    window.localStorage.setItem('fleetgraph.chat:sprint:week-1', JSON.stringify([
      {
        id: 'user-1',
        role: 'user',
        content: 'What is blocking this week?',
        status: 'sent',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Trace evidence is still missing.',
        status: 'completed',
      },
    ]));

    const firstRender = render(<EmbeddedChat documentId="week-1" documentType="sprint" />);

    expect(screen.getByText('What is blocking this week?')).toBeInTheDocument();
    expect(screen.getByText('Trace evidence is still missing.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start new FleetGraph chat' }));

    expect(screen.queryByText('What is blocking this week?')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace evidence is still missing.')).not.toBeInTheDocument();
    expect(screen.getByText('Ask about risks, blockers, ownership, or likely next actions.')).toBeInTheDocument();

    firstRender.unmount();
    render(<EmbeddedChat documentId="week-1" documentType="sprint" />);

    expect(screen.queryByText('What is blocking this week?')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace evidence is still missing.')).not.toBeInTheDocument();
  });

  it('sends only the latest bounded conversation history from persisted messages', async () => {
    const requests: FleetGraphChatTestRequest[] = [];
    const persistedMessages = Array.from(
      { length: FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT + 2 },
      (_value, index) => ({
        id: `message-${index}`,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `History message ${index}`,
        status: index % 2 === 0 ? 'sent' : 'completed',
      })
    );
    window.localStorage.setItem('fleetgraph.chat:sprint:week-1', JSON.stringify(persistedMessages));
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/csrf-token' && method === 'GET') {
        return jsonResponse({ token: 'csrf-token' }, 200);
      }

      if (url === '/api/fleetgraph/chat' && method === 'POST') {
        requests.push(JSON.parse(String(init?.body)) as FleetGraphChatTestRequest);
        return sseResponse([
          'event: final\ndata: {"response":"Bounded history accepted.","usage":{"modelName":"gpt-4o-mini","inputTokens":100,"outputTokens":10,"totalTokens":110}}\n\n',
        ]);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<EmbeddedChat documentId="week-1" documentType="sprint" />);

    fireEvent.change(screen.getByLabelText('Ask FleetGraph'), {
      target: { value: 'Use bounded history' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Bounded history accepted.')).toBeInTheDocument();
    expect(requests[0]?.conversationHistory).toHaveLength(FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT);
    expect(requests[0]?.conversationHistory[0]).toEqual({
      role: 'user',
      content: 'History message 2',
    });
    expect(requests[0]?.conversationHistory.at(-1)).toEqual({
      role: 'assistant',
      content: `History message ${FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT + 1}`,
    });
  });
});
