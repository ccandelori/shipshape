import type { QueryResult, QueryResultRow } from 'pg';
import { broadcastToUser } from '../collaboration/index.js';
import { pool } from '../db/client.js';
import type { FleetGraphQueryClient } from './context.js';
import { acquireAdvisoryLock, releaseAdvisoryLock } from './guards.js';
import { createProductionAtRiskWeekScopeRunner } from './proactive-runner.js';

export const proactivePollIntervalMs = 180_000;
export const mutationDebounceMs = 45_000;
export const maxPendingMutationChecks = 1_000;

export type ProactiveTimer = ReturnType<typeof setTimeout>;

export type ProactiveTriggerSource = 'poll' | 'mutation';

export type ProactiveWeekScope = {
  workspaceId: string;
  scopedDocId: string;
};

export type ProactiveScopeRunInput = ProactiveWeekScope & {
  triggerSource: ProactiveTriggerSource;
  client: FleetGraphQueryClient;
};

export type ProactiveScopeRunner = (input: ProactiveScopeRunInput) => Promise<void>;

export type ProactiveRunRequest = {
  triggerSource: ProactiveTriggerSource;
  scope: ProactiveWeekScope | null;
};

export type ProactiveRunSummary = {
  triggerSource: ProactiveTriggerSource;
  scannedScopeCount: number;
  processedScopeCount: number;
  skippedScopeCount: number;
};

export type FleetGraphTriggerQueryClient = {
  query: (queryText: string, values: unknown[]) => Promise<QueryResult<QueryResultRow>>;
};

export type FleetGraphTriggerLockClient = FleetGraphQueryClient & {
  release: () => void;
};

export type FleetGraphTriggerPool = FleetGraphTriggerQueryClient & {
  connect: () => Promise<FleetGraphTriggerLockClient>;
};

export type FleetGraphTriggerTimers = {
  setInterval: (callback: () => void, delayMs: number) => ProactiveTimer;
  clearInterval: (timer: ProactiveTimer) => void;
  setTimeout: (callback: () => void, delayMs: number) => ProactiveTimer;
  clearTimeout: (timer: ProactiveTimer) => void;
};

export type FleetGraphTriggerLogFields = Record<string, string | number | boolean | null>;

export type FleetGraphTriggerLogger = {
  info: (message: string, fields: FleetGraphTriggerLogFields) => void;
  warn: (message: string, fields: FleetGraphTriggerLogFields) => void;
  error: (message: string, fields: FleetGraphTriggerLogFields) => void;
};

export type ProactiveTriggerSignal = 'SIGTERM' | 'SIGINT';

export type ProactiveTriggerSignalProcess = {
  prependOnceListener: (signal: ProactiveTriggerSignal, listener: () => void) => void;
  removeListener: (signal: ProactiveTriggerSignal, listener: () => void) => void;
};

export type ProactiveTriggerShutdownRegistration = {
  unregister: () => void;
};

type UnrefTimer = {
  unref: () => void;
};

export type ProactiveTriggerControllerOptions = {
  pool: FleetGraphTriggerPool;
  runScope: ProactiveScopeRunner;
  timers: FleetGraphTriggerTimers;
  logger: FleetGraphTriggerLogger;
  pollIntervalMs: number;
  mutationDebounceMs: number;
  maxPendingMutationChecks: number;
};

export type ProactiveTriggerController = {
  startProactiveTriggers: () => void;
  runProactiveCheck: (request: ProactiveRunRequest) => Promise<ProactiveRunSummary>;
  enqueueMutationCheck: (workspaceId: string, scopedDocId: string) => boolean;
  shutdown: () => void;
  pendingMutationCount: () => number;
};

export function createProactiveTriggerController(options: ProactiveTriggerControllerOptions): ProactiveTriggerController {
  let pollTimer: ProactiveTimer | null = null;
  const pendingMutationTimers = new Map<string, ProactiveTimer>();

  function startProactiveTriggers(): void {
    if (pollTimer !== null) {
      return;
    }

    pollTimer = options.timers.setInterval(() => {
      void runProactiveCheck({ triggerSource: 'poll', scope: null }).catch((error: unknown) => {
        options.logger.error('fleetgraph.proactive_trigger.poll_failed', {
          errorMessage: errorMessage(error),
        });
      });
    }, options.pollIntervalMs);
  }

  async function runProactiveCheck(request: ProactiveRunRequest): Promise<ProactiveRunSummary> {
    const scopes = await loadProactiveScopes(options.pool, request.scope);
    let processedScopeCount = 0;
    let skippedScopeCount = 0;

    for (const scope of scopes) {
      const processed = await runScopeWithAdvisoryLock(scope, request.triggerSource);
      if (processed) {
        processedScopeCount += 1;
      } else {
        skippedScopeCount += 1;
      }
    }

    return {
      triggerSource: request.triggerSource,
      scannedScopeCount: scopes.length,
      processedScopeCount,
      skippedScopeCount,
    };
  }

  async function runScopeWithAdvisoryLock(
    scope: ProactiveWeekScope,
    triggerSource: ProactiveTriggerSource
  ): Promise<boolean> {
    const client = await options.pool.connect();
    let lockAcquired = false;

    try {
      const lock = await acquireAdvisoryLock(client, scope.workspaceId, scope.scopedDocId);
      if (!lock.acquired) {
        options.logger.info('fleetgraph.proactive_trigger.scope_locked', {
          workspaceId: scope.workspaceId,
          scopedDocId: scope.scopedDocId,
          triggerSource,
          lockKey: lock.lockKey,
        });
        return false;
      }

      lockAcquired = true;
      await options.runScope({
        workspaceId: scope.workspaceId,
        scopedDocId: scope.scopedDocId,
        triggerSource,
        client,
      });
      options.logger.info('fleetgraph.proactive_trigger.scope_processed', {
        workspaceId: scope.workspaceId,
        scopedDocId: scope.scopedDocId,
        triggerSource,
        lockKey: lock.lockKey,
      });
      return true;
    } catch (error: unknown) {
      options.logger.error('fleetgraph.proactive_trigger.scope_failed', {
        workspaceId: scope.workspaceId,
        scopedDocId: scope.scopedDocId,
        triggerSource,
        errorMessage: errorMessage(error),
      });
      return false;
    } finally {
      if (lockAcquired) {
        try {
          const released = await releaseAdvisoryLock(client, scope.workspaceId, scope.scopedDocId);
          if (!released) {
            options.logger.warn('fleetgraph.proactive_trigger.lock_release_missed', {
              workspaceId: scope.workspaceId,
              scopedDocId: scope.scopedDocId,
              triggerSource,
            });
          }
        } catch (error: unknown) {
          options.logger.error('fleetgraph.proactive_trigger.lock_release_failed', {
            workspaceId: scope.workspaceId,
            scopedDocId: scope.scopedDocId,
            triggerSource,
            errorMessage: errorMessage(error),
          });
        }
      }
      client.release();
    }
  }

  function enqueueMutationCheck(workspaceId: string, scopedDocId: string): boolean {
    const mutationKey = createMutationKey(workspaceId, scopedDocId);
    const existingTimer = pendingMutationTimers.get(mutationKey);
    if (existingTimer) {
      options.timers.clearTimeout(existingTimer);
    }

    if (!existingTimer && pendingMutationTimers.size >= options.maxPendingMutationChecks) {
      options.logger.warn('fleetgraph.proactive_trigger.mutation_queue_full', {
        workspaceId,
        scopedDocId,
        maxPendingMutationChecks: options.maxPendingMutationChecks,
      });
      return false;
    }

    const timer = options.timers.setTimeout(() => {
      pendingMutationTimers.delete(mutationKey);
      void runProactiveCheck({
        triggerSource: 'mutation',
        scope: { workspaceId, scopedDocId },
      }).catch((error: unknown) => {
        options.logger.error('fleetgraph.proactive_trigger.mutation_failed', {
          workspaceId,
          scopedDocId,
          errorMessage: errorMessage(error),
        });
      });
    }, options.mutationDebounceMs);

    pendingMutationTimers.set(mutationKey, timer);
    return true;
  }

  function shutdown(): void {
    if (pollTimer !== null) {
      options.timers.clearInterval(pollTimer);
      pollTimer = null;
    }

    for (const timer of pendingMutationTimers.values()) {
      options.timers.clearTimeout(timer);
    }
    pendingMutationTimers.clear();
  }

  function pendingMutationCount(): number {
    return pendingMutationTimers.size;
  }

  return {
    startProactiveTriggers,
    runProactiveCheck,
    enqueueMutationCheck,
    shutdown,
    pendingMutationCount,
  };
}

let defaultController: ProactiveTriggerController | null = null;

export function startProactiveTriggers(): void {
  getDefaultController().startProactiveTriggers();
}

export function runProactiveCheck(): Promise<ProactiveRunSummary> {
  return getDefaultController().runProactiveCheck({ triggerSource: 'poll', scope: null });
}

export function enqueueMutationCheck(workspaceId: string, scopedDocId: string): boolean {
  return getDefaultController().enqueueMutationCheck(workspaceId, scopedDocId);
}

export function shutdown(): void {
  getDefaultController().shutdown();
}

export function registerProactiveTriggerShutdownHandlers(
  signalProcess: ProactiveTriggerSignalProcess,
  triggerShutdown: () => void
): ProactiveTriggerShutdownRegistration {
  const registeredListeners = new Map<ProactiveTriggerSignal, () => void>();

  for (const signal of proactiveTriggerShutdownSignals) {
    const listener = (): void => {
      triggerShutdown();
    };
    registeredListeners.set(signal, listener);
    signalProcess.prependOnceListener(signal, listener);
  }

  return {
    unregister: () => {
      for (const [signal, listener] of registeredListeners) {
        signalProcess.removeListener(signal, listener);
      }
      registeredListeners.clear();
    },
  };
}

const proactiveTriggerShutdownSignals: ProactiveTriggerSignal[] = ['SIGTERM', 'SIGINT'];

function getDefaultController(): ProactiveTriggerController {
  if (defaultController === null) {
    defaultController = createProactiveTriggerController({
      pool,
      runScope: createProductionAtRiskWeekScopeRunner(consoleLogger, broadcastToUser),
      timers: createProductionTimers(),
      logger: consoleLogger,
      pollIntervalMs: proactivePollIntervalMs,
      mutationDebounceMs,
      maxPendingMutationChecks,
    });
  }

  return defaultController;
}

async function loadProactiveScopes(
  queryClient: FleetGraphTriggerQueryClient,
  requestedScope: ProactiveWeekScope | null
): Promise<ProactiveWeekScope[]> {
  if (requestedScope) {
    const result = await queryClient.query(
      `${activeWeekScopeSelectSql}
       AND d.workspace_id = $1
       AND d.id = $2
       ORDER BY d.workspace_id ASC, d.created_at ASC, d.id ASC`,
      [requestedScope.workspaceId, requestedScope.scopedDocId]
    );
    return result.rows.map(mapScopeRow);
  }

  const result = await queryClient.query(
    `${activeWeekScopeSelectSql}
     ORDER BY d.workspace_id ASC, d.created_at ASC, d.id ASC`,
    []
  );
  return result.rows.map(mapScopeRow);
}

const activeWeekScopeSelectSql = `
  SELECT d.workspace_id,
         d.id AS scoped_document_id
  FROM documents d
  JOIN workspaces w ON w.id = d.workspace_id
  WHERE d.document_type = 'sprint'
    AND d.archived_at IS NULL
    AND d.deleted_at IS NULL
    AND w.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM fleetgraph_findings f
      WHERE f.workspace_id = d.workspace_id
        AND f.scoped_document_id = d.id
        AND f.lifecycle_state = 'pending_review'
    )`;

function mapScopeRow(row: QueryResultRow): ProactiveWeekScope {
  if (typeof row.workspace_id !== 'string' || typeof row.scoped_document_id !== 'string') {
    throw new Error('FleetGraph proactive scope query returned invalid row shape');
  }

  return {
    workspaceId: row.workspace_id,
    scopedDocId: row.scoped_document_id,
  };
}

const consoleLogger: FleetGraphTriggerLogger = {
  info: (message, fields) => {
    console.info(message, fields);
  },
  warn: (message, fields) => {
    console.warn(message, fields);
  },
  error: (message, fields) => {
    console.error(message, fields);
  },
};

function createMutationKey(workspaceId: string, scopedDocId: string): string {
  return `${workspaceId}:${scopedDocId}`;
}

function createProductionTimers(): FleetGraphTriggerTimers {
  return {
    setInterval: (callback, delayMs) => {
      const timer = setInterval(callback, delayMs);
      unrefTimer(timer);
      return timer;
    },
    clearInterval,
    setTimeout: (callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      unrefTimer(timer);
      return timer;
    },
    clearTimeout,
  };
}

function unrefTimer(timer: ProactiveTimer): void {
  if (isUnrefTimer(timer)) {
    timer.unref();
  }
}

function isUnrefTimer(timer: ProactiveTimer): timer is ProactiveTimer & UnrefTimer {
  if (typeof timer !== 'object' || timer === null) {
    return false;
  }

  const candidate = timer as { unref?: unknown };
  return typeof candidate.unref === 'function';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
