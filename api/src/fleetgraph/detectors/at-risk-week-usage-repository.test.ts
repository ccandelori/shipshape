import { describe, expect, it, vi } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import type { FleetGraphQueryClient } from '../context.js';
import { AtRiskWeekPersistenceError } from './at-risk-week-output-repository.js';
import { createPostgresAtRiskWeekUsageRepository } from './at-risk-week-usage-repository.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '33333333-3333-4333-8333-333333333333';

describe('Postgres at-risk Week usage repository', () => {
  it('persists usage records through the repository port', async () => {
    const client = createClient([createQueryResult([])]);
    const repository = createPostgresAtRiskWeekUsageRepository(client);

    await repository.persistUsage({
      runId,
      workspaceId,
      trigger: 'proactive',
      detector: 'at_risk_week',
      modelName: 'gpt-4o-mini',
      inputTokens: 850,
      outputTokens: 172,
      estimatedCost: 0.000231,
      traceMetadata: {
        traceNode: 'run',
        branchPath: 'output',
      },
    });

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO fleetgraph_usage'), [
      runId,
      workspaceId,
      'proactive',
      'at_risk_week',
      'gpt-4o-mini',
      850,
      172,
      0.000231,
      JSON.stringify({
        traceNode: 'run',
        branchPath: 'output',
      }),
    ]);
  });

  it('raises the shared persistence error with run context when usage insert fails', async () => {
    const client = createClient([new Error('usage exploded')]);
    const repository = createPostgresAtRiskWeekUsageRepository(client);

    await expect(repository.persistUsage({
      runId,
      workspaceId,
      trigger: 'proactive',
      detector: 'at_risk_week',
      modelName: 'gpt-4o-mini',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      traceMetadata: {},
    })).rejects.toThrow(AtRiskWeekPersistenceError);
  });
});

function createClient(results: Array<QueryResult<QueryResultRow> | Error>): FleetGraphQueryClient {
  const query = vi.fn(async <T extends QueryResultRow>(): Promise<QueryResult<T>> => {
    const nextResult = results.shift();

    if (nextResult instanceof Error) {
      throw nextResult;
    }

    if (nextResult === undefined) {
      throw new Error('Unexpected query');
    }

    return nextResult as QueryResult<T>;
  });

  return {
    query: query as unknown as FleetGraphQueryClient['query'],
  };
}

function createQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  };
}
