import { describe, expect, it } from 'vitest';
import {
  FLEETGRAPH_CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT,
  FLEETGRAPH_CHAT_RATE_LIMIT_MAX_REQUESTS,
  FLEETGRAPH_CHAT_RATE_LIMIT_WINDOW_MS,
  evaluateFleetGraphChatRateLimit,
  selectFleetGraphChatContextHistory,
  type FleetGraphChatMessage,
  type FleetGraphChatRateLimitState,
} from './chat.js';

describe('FleetGraph chat rate limiting and history bounds', () => {
  it('keeps only the last 10 conversation messages without mutating the request history', () => {
    const history = Array.from(
      { length: FLEETGRAPH_CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT + 3 },
      (_value, index): FleetGraphChatMessage => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${index}`,
      })
    );

    const selectedHistory = selectFleetGraphChatContextHistory(history);

    expect(selectedHistory).toEqual(history.slice(-FLEETGRAPH_CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT));
    expect(history).toHaveLength(FLEETGRAPH_CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT + 3);
  });

  it('allows 10 chat requests per user in a sliding one-hour window', () => {
    let state: FleetGraphChatRateLimitState = new Map();
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const nowMs = Date.parse('2026-05-26T12:00:00.000Z');

    for (let requestIndex = 0; requestIndex < FLEETGRAPH_CHAT_RATE_LIMIT_MAX_REQUESTS; requestIndex += 1) {
      const result = evaluateFleetGraphChatRateLimit({
        state,
        userId,
        nowMs,
      });
      state = result.state;

      expect(result.decision).toMatchObject({
        allowed: true,
        remaining: FLEETGRAPH_CHAT_RATE_LIMIT_MAX_REQUESTS - requestIndex - 1,
      });
    }

    const deniedResult = evaluateFleetGraphChatRateLimit({
      state,
      userId,
      nowMs,
    });

    expect(deniedResult.decision).toMatchObject({
      allowed: false,
      retryAfterSeconds: 3_600,
      resetAtMs: nowMs + FLEETGRAPH_CHAT_RATE_LIMIT_WINDOW_MS,
    });

    const allowedAfterWindow = evaluateFleetGraphChatRateLimit({
      state: deniedResult.state,
      userId,
      nowMs: nowMs + FLEETGRAPH_CHAT_RATE_LIMIT_WINDOW_MS + 1,
    });

    expect(allowedAfterWindow.decision).toMatchObject({
      allowed: true,
      remaining: FLEETGRAPH_CHAT_RATE_LIMIT_MAX_REQUESTS - 1,
    });
  });

  it('does not mutate the input rate limit state', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const nowMs = Date.parse('2026-05-26T12:00:00.000Z');
    const existingState: FleetGraphChatRateLimitState = new Map([[userId, [nowMs]]]);

    const result = evaluateFleetGraphChatRateLimit({
      state: existingState,
      userId,
      nowMs: nowMs + 1,
    });

    expect(existingState.get(userId)).toEqual([nowMs]);
    expect(result.state.get(userId)).toEqual([nowMs, nowMs + 1]);
  });
});
