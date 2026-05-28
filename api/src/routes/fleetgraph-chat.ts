import { Router, type Request, type Response } from 'express';
import { pool } from '../db/client.js';
import {
  buildFleetGraphChatPrompt,
  buildFleetGraphChatSources,
  createFleetGraphChatTraceContext,
  createOpenAIFleetGraphChatModel,
  defaultFleetGraphChatContextBuilders,
  evaluateFleetGraphChatRateLimit,
  FLEETGRAPH_CHAT_SSE_HEADERS,
  FleetGraphChatRequestSchema,
  FleetGraphChatScopeNotFoundError,
  formatFleetGraphChatSseEvent,
  resolveFleetGraphChatScope,
  type FleetGraphChatContextBuilders,
  type FleetGraphChatModel,
  type FleetGraphChatModelMessage,
  type FleetGraphChatRateLimitDecision,
  type FleetGraphChatRateLimitState,
  type FleetGraphChatSseEvent,
} from '../fleetgraph/chat.js';
import { FleetGraphConfigError, loadFleetGraphConfig } from '../fleetgraph/config.js';
import type { FleetGraphQueryClient } from '../fleetgraph/context.js';
import {
  createDisabledFleetGraphPublicTracePolicy,
  createFleetGraphPublicTracePolicy,
  type FleetGraphPublicTracePolicy,
} from '../fleetgraph/langfuse.js';
import {
  runFleetGraphGraph,
  type FleetGraphGraphDependencies,
  type FleetGraphGraphInput,
  type FleetGraphGraphState,
} from '../fleetgraph/graph.js';
import { authMiddleware } from '../middleware/auth.js';

type FleetGraphChatRouterDependencies = {
  client: FleetGraphQueryClient;
  contextBuilders: FleetGraphChatContextBuilders;
  createModel: () => FleetGraphChatModel;
  getPublicTracePolicy?: () => FleetGraphPublicTracePolicy;
  runGraph?: (
    input: FleetGraphGraphInput,
    dependencies: FleetGraphGraphDependencies
  ) => Promise<FleetGraphGraphState>;
  now: () => Date;
  heartbeatIntervalMs: number;
};

type FleetGraphChatActorContext = {
  userId: string;
  workspaceId: string;
};

type FleetGraphChatActorContextResult = {
  success: true;
  data: FleetGraphChatActorContext;
} | {
  success: false;
  statusCode: number;
  error: string;
};

type FleetGraphChatDeniedRateLimitDecision = Extract<FleetGraphChatRateLimitDecision, { allowed: false }>;

type FleetGraphChatFlushableResponse = Response & {
  flush?: () => void;
};

const fleetGraphChatStreamErrorMessage = 'FleetGraph chat stream failed';
const defaultFleetGraphChatHeartbeatIntervalMs = 15_000;

export function createFleetGraphChatRouter(dependencies: FleetGraphChatRouterDependencies): Router {
  const router = Router();
  let rateLimitState: FleetGraphChatRateLimitState = new Map();

  router.post('/chat', authMiddleware, async (req: Request, res: Response) => {
    const requestResult = FleetGraphChatRequestSchema.safeParse(req.body ?? {});

    if (!requestResult.success) {
      res.status(400).json({
        error: 'Invalid input',
        details: requestResult.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
      return;
    }

    const actorContext = getFleetGraphChatActorContext(req);

    if (!actorContext.success) {
      res.status(actorContext.statusCode).json({ error: actorContext.error });
      return;
    }

    const rateLimitEvaluation = evaluateFleetGraphChatRateLimit({
      state: rateLimitState,
      userId: actorContext.data.userId,
      nowMs: dependencies.now().getTime(),
    });
    rateLimitState = rateLimitEvaluation.state;

    if (!rateLimitEvaluation.decision.allowed) {
      respondFleetGraphChatRateLimited(res, rateLimitEvaluation.decision);
      return;
    }

    let promptMessages: FleetGraphChatModelMessage[];
    let promptSources: ReturnType<typeof buildFleetGraphChatSources>;
    let traceContext: ReturnType<typeof createFleetGraphChatTraceContext>;
    try {
      const scope = await resolveFleetGraphChatScope(
        dependencies.client,
        actorContext.data.workspaceId,
        requestResult.data
      );
      const prompt = await buildFleetGraphChatPrompt({
        client: dependencies.client,
        workspaceId: actorContext.data.workspaceId,
        request: requestResult.data,
        contextBuilders: dependencies.contextBuilders,
      });
      promptMessages = prompt.messages;
      promptSources = buildFleetGraphChatSources(prompt.loadedContext);
      traceContext = createFleetGraphChatTraceContext({
        userId: actorContext.data.userId,
        workspaceId: actorContext.data.workspaceId,
        scope,
        request: requestResult.data,
        publicTracePolicy: dependencies.getPublicTracePolicy?.() ?? createDisabledFleetGraphPublicTracePolicy(),
      });
    } catch (error) {
      respondFleetGraphChatPreStreamError(res, error);
      return;
    }

    let model: FleetGraphChatModel;
    try {
      model = dependencies.createModel();
    } catch (error) {
      respondFleetGraphChatPreStreamError(res, error);
      return;
    }

    const abortController = new AbortController();
    const abortOnClose = () => {
      if (res.headersSent && !res.writableEnded) {
        abortController.abort();
      }
    };
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    req.once('close', abortOnClose);
    res.once('close', abortOnClose);

    try {
      openFleetGraphChatSseResponse(res);
      await writeFleetGraphChatSseEvent({
        res,
        abortSignal: abortController.signal,
        event: {
          event: 'heartbeat',
          data: { sentAt: dependencies.now().toISOString() },
        },
      });
      heartbeatTimer = startFleetGraphChatHeartbeat({
        res,
        abortController,
        now: dependencies.now,
        heartbeatIntervalMs: dependencies.heartbeatIntervalMs,
      });

      const graphState = await (dependencies.runGraph ?? runFleetGraphGraph)({
        mode: 'ondemand_chat',
        chat: {
          model,
          messages: promptMessages,
          abortSignal: abortController.signal,
          traceContext,
          onToken: async (token) => {
            await writeFleetGraphChatSseEvent({
              res,
              abortSignal: abortController.signal,
              event: {
                event: 'token',
                data: { token },
              },
            });
          },
        },
      }, {});
      const completion = graphState.chat?.completion;

      if (completion === undefined) {
        throw new Error('FleetGraph chat graph completed without a chat completion');
      }

      if (!abortController.signal.aborted) {
        await writeFleetGraphChatSseEvent({
          res,
          abortSignal: abortController.signal,
          event: {
            event: 'final',
            data: {
              ...completion,
              sources: promptSources,
            },
          },
        });
      }
    } catch (error) {
      if (!abortController.signal.aborted && !res.writableEnded) {
        console.error(fleetGraphChatStreamErrorMessage, error);
        await writeFleetGraphChatSseEvent({
          res,
          abortSignal: abortController.signal,
          event: {
            event: 'error',
            data: { error: fleetGraphChatStreamErrorMessage },
          },
        });
      }
    } finally {
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
      }
      req.off('close', abortOnClose);
      res.off('close', abortOnClose);

      if (!abortController.signal.aborted && !res.writableEnded) {
        res.end();
      }
    }
  });

  return router;
}

function getFleetGraphChatActorContext(req: Request): FleetGraphChatActorContextResult {
  if (!req.userId) {
    return {
      success: false,
      statusCode: 401,
      error: 'No user found for authenticated request',
    };
  }

  if (!req.workspaceId) {
    return {
      success: false,
      statusCode: 401,
      error: 'No workspace found for authenticated request',
    };
  }

  return {
    success: true,
    data: {
      userId: req.userId,
      workspaceId: req.workspaceId,
    },
  };
}

function respondFleetGraphChatRateLimited(
  res: Response,
  decision: FleetGraphChatDeniedRateLimitDecision
): void {
  res.setHeader('Retry-After', decision.retryAfterSeconds.toString());
  res.status(429).json({
    error: 'FleetGraph chat rate limit exceeded',
    retry_after_seconds: decision.retryAfterSeconds,
    reset_at: new Date(decision.resetAtMs).toISOString(),
  });
}

function respondFleetGraphChatPreStreamError(res: Response, error: unknown): void {
  if (error instanceof FleetGraphChatScopeNotFoundError) {
    res.status(404).json({ error: 'FleetGraph chat document not found' });
    return;
  }

  if (error instanceof FleetGraphConfigError) {
    res.status(503).json({ error: 'FleetGraph chat is not configured' });
    return;
  }

  console.error('FleetGraph chat request failed before streaming', error);
  res.status(500).json({ error: 'FleetGraph chat request failed' });
}

function openFleetGraphChatSseResponse(res: Response): void {
  res.status(200);

  for (const [header, value] of Object.entries(FLEETGRAPH_CHAT_SSE_HEADERS)) {
    res.setHeader(header, value);
  }

  res.flushHeaders();
}

function startFleetGraphChatHeartbeat(input: {
  res: Response;
  abortController: AbortController;
  now: () => Date;
  heartbeatIntervalMs: number;
}): ReturnType<typeof setInterval> {
  return setInterval(() => {
    void writeFleetGraphChatSseEvent({
      res: input.res,
      abortSignal: input.abortController.signal,
      event: {
        event: 'heartbeat',
        data: { sentAt: input.now().toISOString() },
      },
    }).catch((error: unknown) => {
      if (!input.abortController.signal.aborted) {
        console.error('FleetGraph chat heartbeat failed', error);
        input.abortController.abort();
      }
    });
  }, input.heartbeatIntervalMs);
}

async function writeFleetGraphChatSseEvent(input: {
  res: Response;
  abortSignal: AbortSignal;
  event: FleetGraphChatSseEvent;
}): Promise<void> {
  if (input.abortSignal.aborted || input.res.writableEnded) {
    return;
  }

  const wroteImmediately = input.res.write(formatFleetGraphChatSseEvent(input.event));
  flushFleetGraphChatSseBody(input.res);

  if (wroteImmediately) {
    return;
  }

  await waitForFleetGraphChatDrain({
    res: input.res,
    abortSignal: input.abortSignal,
  });
}

function flushFleetGraphChatSseBody(res: Response): void {
  const flushableResponse = res as FleetGraphChatFlushableResponse;

  if (typeof flushableResponse.flush === 'function') {
    flushableResponse.flush();
  }
}

async function waitForFleetGraphChatDrain(input: {
  res: Response;
  abortSignal: AbortSignal;
}): Promise<void> {
  if (input.abortSignal.aborted) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      input.res.off('drain', onDrain);
      input.res.off('error', onError);
      input.abortSignal.removeEventListener('abort', onAbort);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      cleanup();
      resolve();
    };

    input.res.once('drain', onDrain);
    input.res.once('error', onError);
    input.abortSignal.addEventListener('abort', onAbort, { once: true });
  });
}

const fleetGraphChatRoutes = createFleetGraphChatRouter({
  client: pool,
  contextBuilders: defaultFleetGraphChatContextBuilders,
  createModel: () => createOpenAIFleetGraphChatModel(loadFleetGraphConfig()),
  getPublicTracePolicy: () => createFleetGraphPublicTracePolicy(loadFleetGraphConfig()),
  now: () => new Date(),
  heartbeatIntervalMs: defaultFleetGraphChatHeartbeatIntervalMs,
});

export default fleetGraphChatRoutes;
