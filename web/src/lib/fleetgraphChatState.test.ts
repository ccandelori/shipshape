import { describe, expect, it } from 'vitest';
import {
  createFleetGraphChatStreamState,
  reduceFleetGraphChatStreamEvent,
  type FleetGraphChatUsage,
} from './fleetgraphChatState';

describe('FleetGraph chat stream state', () => {
  it('accumulates streamed tokens and finalizes with model usage', () => {
    const usage: FleetGraphChatUsage = {
      modelName: 'gpt-4o-mini',
      inputTokens: 120,
      outputTokens: 18,
      totalTokens: 138,
    };

    const afterHeartbeat = reduceFleetGraphChatStreamEvent(
      createFleetGraphChatStreamState(),
      {
        event: 'heartbeat',
        data: { sentAt: '2026-05-26T12:00:00.000Z' },
      }
    );
    const afterFirstToken = reduceFleetGraphChatStreamEvent(afterHeartbeat, {
      event: 'token',
      data: { token: 'Week 12 ' },
    });
    const afterSecondToken = reduceFleetGraphChatStreamEvent(afterFirstToken, {
      event: 'token',
      data: { token: 'is at risk.' },
    });
    const finalState = reduceFleetGraphChatStreamEvent(afterSecondToken, {
      event: 'final',
      data: {
        response: 'Week 12 is at risk.',
        usage,
      },
    });

    expect(finalState).toEqual({
      status: 'completed',
      response: 'Week 12 is at risk.',
      usage,
      error: null,
      lastHeartbeatAt: '2026-05-26T12:00:00.000Z',
    });
  });
});
