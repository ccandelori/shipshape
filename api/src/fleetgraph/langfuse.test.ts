import { describe, expect, it } from 'vitest';
import {
  createFleetGraphLangfusePropagatedAttributes,
  maskSensitiveLangfuseValue,
  sanitizeLangfuseMetadata,
} from './langfuse.js';

describe('FleetGraph Langfuse helpers', () => {
  it('masks provider keys and email addresses before trace export', () => {
    expect(maskSensitiveLangfuseValue(
      'openai=sk-1234567890abcdef langfuse=sk-lf-1234567890abcdef user=person@example.com'
    )).toBe('openai=sk-[REDACTED] langfuse=sk-lf-[REDACTED] user=[REDACTED_EMAIL]');
  });

  it('sanitizes propagated metadata to Langfuse string constraints', () => {
    const longValue = 'x'.repeat(250);

    expect(sanitizeLangfuseMetadata({
      'workspace-id': 'workspace-123',
      release: longValue,
    })).toEqual({
      workspace_id: 'workspace-123',
      release: 'x'.repeat(200),
    });
  });

  it('builds non-baggage trace attributes for local FleetGraph observations', () => {
    expect(createFleetGraphLangfusePropagatedAttributes({
      traceName: 'fleetgraph.chat.response',
      sessionId: 'fleetgraph:chat:user-123:doc-123',
      userId: 'user-123',
      tags: ['fleetgraph', 'mode:ondemand'],
      metadata: {
        documentId: 'doc-123',
      },
    })).toEqual({
      traceName: 'fleetgraph.chat.response',
      sessionId: 'fleetgraph:chat:user-123:doc-123',
      userId: 'user-123',
      tags: ['fleetgraph', 'mode:ondemand'],
      metadata: {
        documentId: 'doc-123',
      },
      asBaggage: false,
    });
  });
});
