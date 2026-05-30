import { describe, expect, it, vi } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import type { FleetGraphQueryClient } from '../context.js';
import {
  createPostgresAtRiskWeekOutputRepository,
  AtRiskWeekPersistenceError,
} from './at-risk-week-output-repository.js';
import type { ActionCandidate, EvidenceItem } from '../types.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const scopedDocId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const ownerUserId = '77777777-7777-4777-8777-777777777777';

describe('Postgres at-risk Week output repository', () => {
  it('persists a notify-only finding through the repository port', async () => {
    const client = createClient([
      createQueryResult([]),
      createQueryResult([{ id: 'finding-1' }]),
      createQueryResult([]),
    ]);
    const repository = createPostgresAtRiskWeekOutputRepository(client);

    const result = await repository.persistOutput({
      workspaceId,
      scopedDocId,
      runId,
      detectorType: 'at_risk_week',
      severity: 'high',
      evidence: [createEvidenceItem()],
      recipientUserId: ownerUserId,
      lifecycleState: 'open',
      materialChangeKey: 'v1:blocked',
      actionCandidate: null,
    });

    expect(result).toEqual({
      findingId: 'finding-1',
      actionCandidateId: null,
      lifecycleState: 'open',
    });
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN', []);
    expect(client.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO fleetgraph_findings'), [
      workspaceId,
      scopedDocId,
      'at_risk_week',
      'high',
      JSON.stringify([createEvidenceItem()]),
      ownerUserId,
      'open',
      'v1:blocked',
    ]);
    expect(client.query).toHaveBeenNthCalledWith(3, 'COMMIT', []);
  });

  it('rolls back and raises a contextual persistence error when the insert fails', async () => {
    const client = createClient([
      createQueryResult([]),
      new Error('insert exploded'),
      createQueryResult([]),
    ]);
    const repository = createPostgresAtRiskWeekOutputRepository(client);

    await expect(repository.persistOutput({
      workspaceId,
      scopedDocId,
      runId,
      detectorType: 'at_risk_week',
      severity: 'high',
      evidence: [createEvidenceItem()],
      recipientUserId: ownerUserId,
      lifecycleState: 'open',
      materialChangeKey: 'v1:blocked',
      actionCandidate: null,
    })).rejects.toThrow(AtRiskWeekPersistenceError);

    expect(client.query).toHaveBeenNthCalledWith(3, 'ROLLBACK', []);
  });
});

function createEvidenceItem(): EvidenceItem {
  return {
    sourceType: 'issue',
    sourceDocumentId: scopedDocId,
    quote: 'The launch blocker is still waiting on external review.',
    observedAt: '2026-05-26T05:00:00.000Z',
  };
}

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
