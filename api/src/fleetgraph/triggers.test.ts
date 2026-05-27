import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  createProactiveTriggerController,
  proactivePollIntervalMs,
  registerProactiveTriggerShutdownHandlers,
  type FleetGraphTriggerLockClient,
  type FleetGraphTriggerPool,
  type ProactiveScopeRunInput,
  type ProactiveTriggerSignal,
  type ProactiveTimer,
} from './triggers.js';

describe('FleetGraph proactive triggers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts one poll interval and clears it on shutdown', () => {
    const intervalToken = createTimerToken();
    const setIntervalSpy = vi.fn<(callback: () => void, delayMs: number) => ProactiveTimer>(() => intervalToken);
    const clearIntervalSpy = vi.fn<(timer: ProactiveTimer) => void>();
    const controller = createProactiveTriggerController({
      pool: createEmptyPool(),
      runScope: vi.fn(),
      timers: {
        setInterval: setIntervalSpy,
        clearInterval: clearIntervalSpy,
        setTimeout: vi.fn<(callback: () => void, delayMs: number) => ProactiveTimer>(),
        clearTimeout: vi.fn<(timer: ProactiveTimer) => void>(),
      },
      logger: createSilentLogger(),
      pollIntervalMs: proactivePollIntervalMs,
      mutationDebounceMs: 45_000,
      maxPendingMutationChecks: 10,
    });

    controller.startProactiveTriggers();
    controller.startProactiveTriggers();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), proactivePollIntervalMs);

    controller.shutdown();

    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalToken);
  });

  it('registers removable process shutdown handlers for proactive trigger timers', () => {
    const registeredListeners = new Map<ProactiveTriggerSignal, () => void>();
    const signalProcess = {
      prependOnceListener: vi.fn((signal: ProactiveTriggerSignal, listener: () => void): void => {
        registeredListeners.set(signal, listener);
      }),
      removeListener: vi.fn((signal: ProactiveTriggerSignal, listener: () => void): void => {
        if (registeredListeners.get(signal) === listener) {
          registeredListeners.delete(signal);
        }
      }),
    };
    const shutdown = vi.fn<() => void>();

    const registration = registerProactiveTriggerShutdownHandlers(signalProcess, shutdown);

    expect(signalProcess.prependOnceListener).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(signalProcess.prependOnceListener).toHaveBeenCalledWith('SIGINT', expect.any(Function));

    registeredListeners.get('SIGTERM')?.();
    expect(shutdown).toHaveBeenCalledTimes(1);

    registration.unregister();
    expect(registeredListeners.size).toBe(0);
  });

  it('runs the proactive runner once per active Week scope during poll checks', async () => {
    const runScope = vi.fn<(input: ProactiveScopeRunInput) => Promise<void>>().mockResolvedValue(undefined);
    const pool = createPoolWithActiveScopes([
      { workspace_id: 'workspace-a', scoped_document_id: 'week-a' },
      { workspace_id: 'workspace-b', scoped_document_id: 'week-b' },
    ]);
    const controller = createProactiveTriggerController({
      pool,
      runScope,
      timers: createNoopTimers(),
      logger: createSilentLogger(),
      pollIntervalMs: proactivePollIntervalMs,
      mutationDebounceMs: 45_000,
      maxPendingMutationChecks: 10,
    });

    await expect(controller.runProactiveCheck({ triggerSource: 'poll', scope: null })).resolves.toEqual({
      triggerSource: 'poll',
      scannedScopeCount: 2,
      processedScopeCount: 2,
      skippedScopeCount: 0,
    });

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("d.document_type = 'sprint'"), []);
    expect(runScope).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-a',
      scopedDocId: 'week-a',
      triggerSource: 'poll',
    }));
    expect(runScope).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-b',
      scopedDocId: 'week-b',
      triggerSource: 'poll',
    }));
  });

  it('skips locked scopes and releases acquired advisory locks', async () => {
    const firstClient = createLockClient([{ acquired: true }, { released: true }]);
    const secondClient = createLockClient([{ acquired: false }]);
    const pool = createPoolWithActiveScopesAndClients(
      [
        { workspace_id: 'workspace-a', scoped_document_id: 'week-a' },
        { workspace_id: 'workspace-b', scoped_document_id: 'week-b' },
      ],
      [firstClient.client, secondClient.client]
    );
    const runScope = vi.fn<(input: ProactiveScopeRunInput) => Promise<void>>().mockResolvedValue(undefined);
    const controller = createProactiveTriggerController({
      pool,
      runScope,
      timers: createNoopTimers(),
      logger: createSilentLogger(),
      pollIntervalMs: proactivePollIntervalMs,
      mutationDebounceMs: 45_000,
      maxPendingMutationChecks: 10,
    });

    await expect(controller.runProactiveCheck({ triggerSource: 'poll', scope: null })).resolves.toEqual({
      triggerSource: 'poll',
      scannedScopeCount: 2,
      processedScopeCount: 1,
      skippedScopeCount: 1,
    });

    expect(runScope).toHaveBeenCalledTimes(1);
    expect(runScope).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-a',
      scopedDocId: 'week-a',
      triggerSource: 'poll',
      client: firstClient.client,
    }));
    expect(firstClient.query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_lock'), expect.any(Array));
    expect(firstClient.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_unlock'), expect.any(Array));
    expect(secondClient.query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_lock'), expect.any(Array));
    expect(secondClient.query).not.toHaveBeenCalledWith(expect.stringContaining('pg_advisory_unlock'), expect.any(Array));
    expect(firstClient.release).toHaveBeenCalledTimes(1);
    expect(secondClient.release).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid mutation checks for the same Week scope', async () => {
    vi.useFakeTimers();
    const runScope = vi.fn<(input: ProactiveScopeRunInput) => Promise<void>>().mockResolvedValue(undefined);
    const controller = createProactiveTriggerController({
      pool: createPoolWithActiveScopes([{ workspace_id: 'workspace-a', scoped_document_id: 'week-a' }]),
      runScope,
      timers: {
        setInterval,
        clearInterval,
        setTimeout,
        clearTimeout,
      },
      logger: createSilentLogger(),
      pollIntervalMs: proactivePollIntervalMs,
      mutationDebounceMs: 45_000,
      maxPendingMutationChecks: 10,
    });

    expect(controller.enqueueMutationCheck('workspace-a', 'week-a')).toBe(true);
    expect(controller.enqueueMutationCheck('workspace-a', 'week-a')).toBe(true);
    expect(controller.pendingMutationCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(44_999);
    expect(runScope).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(runScope).toHaveBeenCalledTimes(1);
    expect(runScope).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-a',
      scopedDocId: 'week-a',
      triggerSource: 'mutation',
    }));
    expect(controller.pendingMutationCount()).toBe(0);
  });

  it('rejects new mutation scopes when the debounce queue is full', () => {
    const logger = createSilentLogger();
    const controller = createProactiveTriggerController({
      pool: createEmptyPool(),
      runScope: vi.fn(),
      timers: createNoopTimers(),
      logger,
      pollIntervalMs: proactivePollIntervalMs,
      mutationDebounceMs: 45_000,
      maxPendingMutationChecks: 1,
    });

    expect(controller.enqueueMutationCheck('workspace-a', 'week-a')).toBe(true);
    expect(controller.enqueueMutationCheck('workspace-a', 'week-b')).toBe(false);

    expect(logger.warn).toHaveBeenCalledWith('fleetgraph.proactive_trigger.mutation_queue_full', {
      workspaceId: 'workspace-a',
      scopedDocId: 'week-b',
      maxPendingMutationChecks: 1,
    });
    expect(controller.pendingMutationCount()).toBe(1);
  });
});

type ActiveScopeRow = QueryResultRow & {
  workspace_id: string;
  scoped_document_id: string;
};

function createEmptyPool() {
  return createPoolWithActiveScopes([]);
}

function createPoolWithActiveScopes(activeScopes: ActiveScopeRow[]) {
  const clients = activeScopes.map(() => createLockClient([{ acquired: true }, { released: true }]).client);
  return createPoolWithActiveScopesAndClients(activeScopes, clients);
}

function createPoolWithActiveScopesAndClients(
  activeScopes: ActiveScopeRow[],
  clients: FleetGraphTriggerLockClient[]
): FleetGraphTriggerPool {
  return {
    query: vi.fn(async (): Promise<QueryResult<QueryResultRow>> => ({
      rows: activeScopes,
      rowCount: activeScopes.length,
      command: '',
      oid: 0,
      fields: [],
    })),
    connect: vi.fn(async () => {
      const client = clients.shift();
      if (!client) {
        throw new Error('No test lock client available');
      }
      return client;
    }),
  };
}

function createLockClient(rows: QueryResultRow[]) {
  const query = vi.fn(async (_queryText: string, _values: unknown[]): Promise<QueryResult<QueryResultRow>> => {
    const row = rows.shift();
    return {
      rows: row ? [row] : [],
      rowCount: row ? 1 : 0,
      command: '',
      oid: 0,
      fields: [],
    };
  });
  const release = vi.fn<() => void>();
  const client: FleetGraphTriggerLockClient = {
    query: async <T extends QueryResultRow>(queryText: string, values: unknown[]): Promise<QueryResult<T>> => {
      const result = await query(queryText, values);
      return result as QueryResult<T>;
    },
    release,
  };

  return {
    client,
    query,
    release,
  };
}

function createNoopTimers() {
  return {
    setInterval: vi.fn<(callback: () => void, delayMs: number) => ProactiveTimer>(() => createTimerToken()),
    clearInterval: vi.fn<(timer: ProactiveTimer) => void>(),
    setTimeout: vi.fn<(callback: () => void, delayMs: number) => ProactiveTimer>(() => createTimerToken()),
    clearTimeout: vi.fn<(timer: ProactiveTimer) => void>(),
  };
}

function createTimerToken(): ProactiveTimer {
  const timer = setTimeout(() => {}, 1_000_000);
  clearTimeout(timer);
  return timer;
}

function createSilentLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
