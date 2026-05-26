import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { pool } from '../db/client.js';
import type {
  FleetGraphQueryClient,
  WeekContext,
} from '../fleetgraph/context.js';
import {
  type FleetGraphChatContextBuilders,
  type FleetGraphChatModel,
  type FleetGraphChatModelMessage,
} from '../fleetgraph/chat.js';
import { createFleetGraphChatRouter } from './fleetgraph-chat.js';

type IdRow = {
  id: string;
};

type ObservedModelCall = {
  messages: FleetGraphChatModelMessage[];
  abortSignal: AbortSignal;
};

describe('FleetGraph chat route SSE lifecycle', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sessionId = `fleetgraph-chat-${testRunId}`;
  let app: express.Express;
  let workspaceId = '';
  let otherWorkspaceId = '';
  let userId = '';
  let weekDocumentId = '';
  let otherWeekDocumentId = '';
  let modelFactoryCallCount = 0;
  const observedModelCalls: ObservedModelCall[] = [];

  beforeAll(async () => {
    const workspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`FleetGraph Chat ${testRunId}`]
    );
    workspaceId = workspaceResult.rows[0]!.id;

    const otherWorkspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`Other FleetGraph Chat ${testRunId}`]
    );
    otherWorkspaceId = otherWorkspaceResult.rows[0]!.id;

    const userResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Chat User')
       RETURNING id`,
      [`fleetgraph-chat-${testRunId}@test.local`]
    );
    userId = userResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [workspaceId, userId]
    );

    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at, last_activity, created_at)
       VALUES ($1, $2, $3, now() + interval '1 hour', now(), now())`,
      [sessionId, userId, workspaceId]
    );

    const documentResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'Chat Week', 'workspace', $2, '{}'::jsonb)
       RETURNING id`,
      [workspaceId, userId]
    );
    weekDocumentId = documentResult.rows[0]!.id;

    const otherDocumentResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'Other Chat Week', 'workspace', $2, '{}'::jsonb)
       RETURNING id`,
      [otherWorkspaceId, userId]
    );
    otherWeekDocumentId = otherDocumentResult.rows[0]!.id;

    app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/fleetgraph', createFleetGraphChatRouter({
      client: pool,
      contextBuilders: createContextBuilders(),
      createModel: () => {
        modelFactoryCallCount++;
        return createStreamingModel(observedModelCalls);
      },
      now: () => new Date('2026-05-26T12:00:00.000Z'),
      heartbeatIntervalMs: 60_000,
    }));
  });

  beforeEach(() => {
    modelFactoryCallCount = 0;
    observedModelCalls.length = 0;
  });

  afterAll(async () => {
    if (workspaceId) {
      await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    }

    if (otherWorkspaceId) {
      await pool.query('DELETE FROM workspaces WHERE id = $1', [otherWorkspaceId]);
    }

    if (userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });

  it('streams heartbeat, token, and final events with SSE headers', async () => {
    const response = await request(app)
      .post('/api/fleetgraph/chat')
      .set('Cookie', [`session_id=${sessionId}`])
      .send({
        documentId: weekDocumentId,
        documentType: 'sprint',
        question: 'What is blocked?',
        conversationHistory: [],
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache, no-transform');
    expect(response.headers.connection).toBe('keep-alive');
    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(response.text).toBe(
      'event: heartbeat\n' +
      'data: {"sentAt":"2026-05-26T12:00:00.000Z"}\n\n' +
      'event: token\n' +
      'data: {"token":"The "}\n\n' +
      'event: token\n' +
      'data: {"token":"answer"}\n\n' +
      'event: final\n' +
      'data: {"response":"The answer","usage":{"modelName":"test-chat-model","inputTokens":12,"outputTokens":4,"totalTokens":16}}\n\n'
    );
    expect(observedModelCalls).toHaveLength(1);
    expect(observedModelCalls[0]!.abortSignal.aborted).toBe(false);
    expect(observedModelCalls[0]!.messages.at(-1)?.content).toContain('What is blocked?');
    expect(observedModelCalls[0]!.messages.at(-1)?.content).toContain('Procurement is blocked');
  });

  it('rejects cross-workspace document ids before constructing a model stream', async () => {
    const response = await request(app)
      .post('/api/fleetgraph/chat')
      .set('Cookie', [`session_id=${sessionId}`])
      .send({
        documentId: otherWeekDocumentId,
        documentType: 'sprint',
        question: 'Can I read the other workspace?',
        conversationHistory: [],
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'FleetGraph chat document not found' });
    expect(modelFactoryCallCount).toBe(0);
    expect(observedModelCalls).toHaveLength(0);
  });

  it('returns 429 for the eleventh request by the same user inside the rate-limit window', async () => {
    const rateLimitModelCalls: ObservedModelCall[] = [];
    const rateLimitedApp = express();
    rateLimitedApp.use(cookieParser());
    rateLimitedApp.use(express.json());
    rateLimitedApp.use('/api/fleetgraph', createFleetGraphChatRouter({
      client: pool,
      contextBuilders: createContextBuilders(),
      createModel: () => createStreamingModel(rateLimitModelCalls),
      now: () => new Date('2026-05-26T12:00:00.000Z'),
      heartbeatIntervalMs: 60_000,
    }));

    for (let requestIndex = 0; requestIndex < 10; requestIndex++) {
      const allowedResponse = await request(rateLimitedApp)
        .post('/api/fleetgraph/chat')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({
          documentId: weekDocumentId,
          documentType: 'sprint',
          question: `Allowed request ${requestIndex}`,
          conversationHistory: [],
        });

      expect(allowedResponse.status).toBe(200);
    }

    const deniedResponse = await request(rateLimitedApp)
      .post('/api/fleetgraph/chat')
      .set('Cookie', [`session_id=${sessionId}`])
      .send({
        documentId: weekDocumentId,
        documentType: 'sprint',
        question: 'Should be rate limited',
        conversationHistory: [],
      });

    expect(deniedResponse.status).toBe(429);
    expect(deniedResponse.headers['retry-after']).toBe('3600');
    expect(deniedResponse.body).toEqual({
      error: 'FleetGraph chat rate limit exceeded',
      retry_after_seconds: 3600,
      reset_at: '2026-05-26T13:00:00.000Z',
    });
    expect(rateLimitModelCalls).toHaveLength(10);
  });

  it('passes only the latest ten conversation messages to the model', async () => {
    const historyModelCalls: ObservedModelCall[] = [];
    const historyApp = express();
    historyApp.use(cookieParser());
    historyApp.use(express.json());
    historyApp.use('/api/fleetgraph', createFleetGraphChatRouter({
      client: pool,
      contextBuilders: createContextBuilders(),
      createModel: () => createStreamingModel(historyModelCalls),
      now: () => new Date('2026-05-26T12:00:00.000Z'),
      heartbeatIntervalMs: 60_000,
    }));
    const conversationHistory = Array.from({ length: 12 }, (_value, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `History message ${index}`,
    }));

    const response = await request(historyApp)
      .post('/api/fleetgraph/chat')
      .set('Cookie', [`session_id=${sessionId}`])
      .send({
        documentId: weekDocumentId,
        documentType: 'sprint',
        question: 'Use bounded history',
        conversationHistory,
      });

    expect(response.status).toBe(200);
    expect(historyModelCalls).toHaveLength(1);
    expect(historyModelCalls[0]!.messages.slice(1, -1)).toEqual(conversationHistory.slice(2));
    expect(historyModelCalls[0]!.messages.at(-1)?.content).toContain('Use bounded history');
  });
});

function createStreamingModel(observedModelCalls: ObservedModelCall[]): FleetGraphChatModel {
  return {
    modelName: 'test-chat-model',
    stream: async function* (
      messages: FleetGraphChatModelMessage[],
      abortSignal: AbortSignal
    ) {
      observedModelCalls.push({ messages, abortSignal });
      yield { token: 'The ', usage: null };
      yield { token: 'answer', usage: null };
      yield {
        token: '',
        usage: {
          modelName: 'test-chat-model',
          inputTokens: 12,
          outputTokens: 4,
          totalTokens: 16,
        },
      };
    },
  };
}

function createContextBuilders(): FleetGraphChatContextBuilders {
  return {
    buildWeekContext: async (
      _client: FleetGraphQueryClient,
      workspaceId: string,
      weekDocId: string
    ) => createWeekContext(workspaceId, weekDocId),
    buildProjectContext: async () => {
      throw new Error('Unexpected project context build in FleetGraph chat route test');
    },
    buildIssueContext: async () => {
      throw new Error('Unexpected issue context build in FleetGraph chat route test');
    },
  };
}

function createWeekContext(workspaceId: string, weekDocumentId: string): WeekContext {
  const createdAt = new Date('2026-05-26T12:00:00.000Z');

  return {
    week: {
      id: weekDocumentId,
      workspaceId,
      documentType: 'sprint',
      title: 'Chat Week',
      content: tipTapText('Chat week summary'),
      parentId: null,
      properties: {},
      ticketNumber: null,
      createdAt,
      updatedAt: createdAt,
    },
    ownerUserId: null,
    projectId: null,
    programId: null,
    issues: [{
      id: '550e8400-e29b-41d4-a716-446655440030',
      workspaceId,
      documentType: 'issue',
      title: 'Procurement blocker',
      content: tipTapText('Procurement is blocked by vendor approval'),
      parentId: null,
      properties: { state: 'blocked', priority: 'high' },
      ticketNumber: 42,
      createdAt,
      updatedAt: createdAt,
      state: 'blocked',
      priority: 'high',
      assigneeUserId: null,
    }],
    standups: [],
    sprintIterations: [],
    accountability: {
      weeklyPlan: { exists: false, documentIds: [] },
      weeklyRetro: { exists: false, documentIds: [] },
    },
  };
}

function tipTapText(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text }],
    }],
  };
}
