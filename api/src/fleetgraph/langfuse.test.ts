import { describe, expect, it, vi } from 'vitest';
import {
  createFleetGraphLangfuseTraceUrl,
  createFleetGraphPublicTracePolicy,
  createFleetGraphLangfusePropagatedAttributes,
  publishFleetGraphTraceViaLangfuseIngestion,
  publishFleetGraphTraceIfEnabled,
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

  it('builds Langfuse trace URLs when project and trace ids are available', () => {
    expect(createFleetGraphLangfuseTraceUrl({
      baseUrl: 'https://us.cloud.langfuse.com/',
      projectId: 'project-123',
      traceId: 'trace-456',
    })).toBe('https://us.cloud.langfuse.com/project/project-123/traces/trace-456');

    expect(createFleetGraphLangfuseTraceUrl({
      baseUrl: 'https://us.cloud.langfuse.com',
      projectId: null,
      traceId: 'trace-456',
    })).toBeNull();
  });

  it('publishes selected FleetGraph traces when public export is enabled', async () => {
    const observation = {
      traceId: 'trace-123',
      setTraceAsPublic: vi.fn(),
    };
    const logger = {
      info: vi.fn(),
    };
    const publishTrace = vi.fn().mockResolvedValue(undefined);

    const publication = await publishFleetGraphTraceIfEnabled({
      observation: observation as never,
      policy: {
        enabled: true,
        langfuseBaseUrl: 'https://us.cloud.langfuse.com',
        langfuseProjectId: 'project-123',
        langfusePublicKey: 'pk-lf-test',
        langfuseSecretKey: 'sk-lf-test',
        publishTrace,
      },
      traceName: 'fleetgraph.chat.response',
      tags: ['fleetgraph', 'mode:ondemand'],
      logger,
    });

    expect(observation.setTraceAsPublic).toHaveBeenCalledTimes(1);
    expect(publishTrace).toHaveBeenCalledWith({
      langfuseBaseUrl: 'https://us.cloud.langfuse.com',
      langfusePublicKey: 'pk-lf-test',
      langfuseSecretKey: 'sk-lf-test',
      traceId: 'trace-123',
      traceName: 'fleetgraph.chat.response',
    });
    expect(publication).toEqual({
      published: true,
      metadata: {
        tracePublic: true,
        traceId: 'trace-123',
        traceUrl: 'https://us.cloud.langfuse.com/project/project-123/traces/trace-123',
      },
    });
    expect(logger.info).toHaveBeenCalledWith('fleetgraph.langfuse.trace_public', {
      traceName: 'fleetgraph.chat.response',
      traceId: 'trace-123',
      traceUrl: 'https://us.cloud.langfuse.com/project/project-123/traces/trace-123',
    });
  });

  it('publishes public trace updates through Langfuse ingestion', async () => {
    const fetchClient = vi.fn().mockResolvedValue({
      ok: true,
      status: 207,
      text: async () => JSON.stringify({
        successes: [{ id: 'event-123', status: 201 }],
        errors: [],
      }),
    });

    await publishFleetGraphTraceViaLangfuseIngestion({
      langfuseBaseUrl: 'https://us.cloud.langfuse.com/',
      langfusePublicKey: 'pk-lf-test',
      langfuseSecretKey: 'sk-lf-test',
      traceId: 'trace-123',
      traceName: 'fleetgraph.chat.response',
      eventId: 'event-123',
      timestamp: '2026-05-28T19:30:00.000Z',
      fetchClient: fetchClient as never,
    });

    expect(fetchClient).toHaveBeenCalledWith(
      'https://us.cloud.langfuse.com/api/public/ingestion',
      {
        method: 'POST',
        headers: {
          authorization: 'Basic cGstbGYtdGVzdDpzay1sZi10ZXN0',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          batch: [{
            id: 'event-123',
            timestamp: '2026-05-28T19:30:00.000Z',
            type: 'trace-create',
            body: {
              id: 'trace-123',
              timestamp: '2026-05-28T19:30:00.000Z',
              name: 'fleetgraph.chat.response',
              public: true,
            },
          }],
        }),
      }
    );
  });

  it('does not publish traces when public export is disabled', async () => {
    const observation = {
      traceId: 'trace-123',
      setTraceAsPublic: vi.fn(),
    };
    const publishTrace = vi.fn();

    const publication = await publishFleetGraphTraceIfEnabled({
      observation: observation as never,
      policy: {
        enabled: false,
        langfuseBaseUrl: 'https://us.cloud.langfuse.com',
        langfuseProjectId: 'project-123',
        langfusePublicKey: 'pk-lf-test',
        langfuseSecretKey: 'sk-lf-test',
        publishTrace,
      },
      traceName: 'fleetgraph.chat.response',
      tags: ['fleetgraph', 'mode:ondemand'],
      logger: { info: vi.fn() },
    });

    expect(observation.setTraceAsPublic).not.toHaveBeenCalled();
    expect(publishTrace).not.toHaveBeenCalled();
    expect(publication.published).toBe(false);
    expect(publication.metadata).toEqual({
      tracePublic: false,
      traceId: 'trace-123',
      traceUrl: 'https://us.cloud.langfuse.com/project/project-123/traces/trace-123',
    });
  });
});
