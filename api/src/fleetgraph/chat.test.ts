import { describe, expect, it } from 'vitest';
import {
  FLEETGRAPH_CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT,
  FLEETGRAPH_CHAT_REQUEST_HISTORY_MESSAGE_LIMIT,
  FLEETGRAPH_CHAT_SSE_HEADERS,
  FleetGraphChatRequestSchema,
  formatFleetGraphChatSseEvent,
} from './chat.js';

describe('FleetGraph chat contracts', () => {
  it('accepts a document-scoped chat request with bounded user and assistant history', () => {
    const parsed = FleetGraphChatRequestSchema.safeParse({
      documentId: '550e8400-e29b-41d4-a716-446655440000',
      documentType: 'sprint',
      question: '  What changed since yesterday?  ',
      conversationHistory: [
        { role: 'user', content: '  Summarize blockers.  ' },
        { role: 'assistant', content: '  The main blocker is procurement.  ' },
      ],
    });

    expect(parsed.success).toBe(true);

    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }

    expect(parsed.data).toEqual({
      documentId: '550e8400-e29b-41d4-a716-446655440000',
      documentType: 'sprint',
      question: 'What changed since yesterday?',
      conversationHistory: [
        { role: 'user', content: 'Summarize blockers.' },
        { role: 'assistant', content: 'The main blocker is procurement.' },
      ],
    });
  });

  it('rejects unsupported document types, blank questions, and oversized history', () => {
    const contextWindowPlusOne = Array.from(
      { length: FLEETGRAPH_CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT + 1 },
      (_value, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `Context message ${index}`,
      })
    );
    const oversizedHistory = Array.from(
      { length: FLEETGRAPH_CHAT_REQUEST_HISTORY_MESSAGE_LIMIT + 1 },
      (_value, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${index}`,
      })
    );

    expect(FleetGraphChatRequestSchema.safeParse({
      documentId: '550e8400-e29b-41d4-a716-446655440000',
      documentType: 'project',
      question: 'What changed?',
      conversationHistory: contextWindowPlusOne,
    }).success).toBe(true);

    expect(FleetGraphChatRequestSchema.safeParse({
      documentId: '550e8400-e29b-41d4-a716-446655440000',
      documentType: 'standup',
      question: 'What is blocked?',
      conversationHistory: [],
    }).success).toBe(false);

    expect(FleetGraphChatRequestSchema.safeParse({
      documentId: '550e8400-e29b-41d4-a716-446655440000',
      documentType: 'issue',
      question: '   ',
      conversationHistory: [],
    }).success).toBe(false);

    expect(FleetGraphChatRequestSchema.safeParse({
      documentId: '550e8400-e29b-41d4-a716-446655440000',
      documentType: 'project',
      question: 'What is blocked?',
      conversationHistory: oversizedHistory,
    }).success).toBe(false);
  });

  it('formats named SSE frames for token, final, error, and heartbeat events', () => {
    expect(formatFleetGraphChatSseEvent({
      event: 'token',
      data: { token: 'hello' },
    })).toBe('event: token\ndata: {"token":"hello"}\n\n');

    expect(formatFleetGraphChatSseEvent({
      event: 'final',
      data: {
        response: 'hello world',
        usage: {
          modelName: 'gpt-4.1-mini',
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30,
        },
      },
    })).toBe(
      'event: final\n' +
      'data: {"response":"hello world","usage":{"modelName":"gpt-4.1-mini","inputTokens":20,"outputTokens":10,"totalTokens":30}}\n\n'
    );

    expect(formatFleetGraphChatSseEvent({
      event: 'error',
      data: { error: 'FleetGraph chat failed' },
    })).toBe('event: error\ndata: {"error":"FleetGraph chat failed"}\n\n');

    expect(formatFleetGraphChatSseEvent({
      event: 'heartbeat',
      data: { sentAt: '2026-05-26T12:00:00.000Z' },
    })).toBe('event: heartbeat\ndata: {"sentAt":"2026-05-26T12:00:00.000Z"}\n\n');
  });

  it('defines SSE headers that discourage proxy buffering', () => {
    expect(FLEETGRAPH_CHAT_SSE_HEADERS).toEqual({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  });
});
