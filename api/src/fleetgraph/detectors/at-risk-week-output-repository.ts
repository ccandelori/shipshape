import type { QueryResultRow } from 'pg';
import type { FleetGraphQueryClient } from '../context.js';
import {
  autoExecuteIfAllowedInTransaction,
  persistPendingActionInTransaction,
} from '../policy.js';
import type {
  ActionCandidate,
  EvidenceItem,
  FleetGraphLifecycleState,
  FleetGraphSeverity,
} from '../types.js';

export type PersistedAtRiskWeekOutput = {
  findingId: string;
  actionCandidateId: string | null;
  lifecycleState: FleetGraphLifecycleState;
};

export type AtRiskWeekOutputPersistenceInput = {
  workspaceId: string;
  scopedDocId: string;
  runId: string;
  detectorType: 'at_risk_week';
  severity: FleetGraphSeverity;
  evidence: EvidenceItem[];
  recipientUserId: string | null;
  lifecycleState: 'open' | 'pending_review';
  materialChangeKey: string;
  actionCandidate: ActionCandidate | null;
};

export type AtRiskWeekOutputRepository = {
  persistOutput: (input: AtRiskWeekOutputPersistenceInput) => Promise<PersistedAtRiskWeekOutput>;
};

type InsertedIdRow = QueryResultRow & {
  id: string;
};

type AtRiskWeekPersistenceErrorInput = {
  workspaceId: string;
  scopedDocId: string;
  runId: string;
  message: string;
};

export class AtRiskWeekPersistenceError extends Error {
  readonly workspaceId: string;
  readonly scopedDocId: string;
  readonly runId: string;

  constructor(input: AtRiskWeekPersistenceErrorInput) {
    super([
      'At-risk Week output persistence failed',
      `workspaceId=${input.workspaceId}`,
      `scopedDocId=${input.scopedDocId}`,
      `runId=${input.runId}`,
      `errorMessage=${input.message}`,
    ].join(', '));
    this.name = 'AtRiskWeekPersistenceError';
    this.workspaceId = input.workspaceId;
    this.scopedDocId = input.scopedDocId;
    this.runId = input.runId;
  }
}

export function createPostgresAtRiskWeekOutputRepository(
  client: FleetGraphQueryClient
): AtRiskWeekOutputRepository {
  return {
    persistOutput: (input) => persistAtRiskWeekOutput(client, input),
  };
}

async function persistAtRiskWeekOutput(
  client: FleetGraphQueryClient,
  input: AtRiskWeekOutputPersistenceInput
): Promise<PersistedAtRiskWeekOutput> {
  try {
    await client.query<QueryResultRow>('BEGIN', []);
    const initialLifecycleState = input.actionCandidate === null ? input.lifecycleState : 'open';
    const findingId = await insertAtRiskWeekFinding(client, input, initialLifecycleState);
    const pendingAction = input.actionCandidate === null
      ? {
          actionCandidateId: null,
          lifecycleState: initialLifecycleState,
        }
      : await persistAtRiskWeekActionCandidate(client, findingId, input.actionCandidate, input);

    await client.query<QueryResultRow>('COMMIT', []);

    return {
      findingId,
      actionCandidateId: pendingAction.actionCandidateId,
      lifecycleState: pendingAction.lifecycleState,
    };
  } catch (error) {
    await rollbackAtRiskWeekOutput(client, input);
    throw new AtRiskWeekPersistenceError({
      workspaceId: input.workspaceId,
      scopedDocId: input.scopedDocId,
      runId: input.runId,
      message: errorMessage(error),
    });
  }
}

async function insertAtRiskWeekFinding(
  client: FleetGraphQueryClient,
  input: AtRiskWeekOutputPersistenceInput,
  lifecycleState: 'open' | 'pending_review'
): Promise<string> {
  const result = await client.query<InsertedIdRow>(
    `INSERT INTO fleetgraph_findings (
       workspace_id, scoped_document_id, detector_type, severity, evidence,
       recipient_user_id, lifecycle_state, material_change_key
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     RETURNING id`,
    [
      input.workspaceId,
      input.scopedDocId,
      input.detectorType,
      input.severity,
      JSON.stringify(input.evidence),
      input.recipientUserId,
      lifecycleState,
      input.materialChangeKey,
    ]
  );

  return requireInsertedId(result.rows[0], 'fleetgraph_findings', input);
}

async function persistAtRiskWeekActionCandidate(
  client: FleetGraphQueryClient,
  findingId: string,
  actionCandidate: ActionCandidate,
  input: AtRiskWeekOutputPersistenceInput
): Promise<Pick<PersistedAtRiskWeekOutput, 'actionCandidateId' | 'lifecycleState'>> {
  const actionCandidateId = await persistPendingActionInTransaction(
    client,
    {
      id: findingId,
      workspaceId: input.workspaceId,
      expectedLifecycleState: 'open',
    },
    actionCandidate
  );
  const execution = await autoExecuteIfAllowedInTransaction(
    client,
    {
      id: findingId,
      workspaceId: input.workspaceId,
      scopedDocumentId: input.scopedDocId,
      expectedLifecycleState: 'pending_review',
    },
    actionCandidate
  );

  return {
    actionCandidateId,
    lifecycleState: execution.lifecycleState,
  };
}

async function rollbackAtRiskWeekOutput(
  client: FleetGraphQueryClient,
  input: AtRiskWeekOutputPersistenceInput
): Promise<void> {
  try {
    await client.query<QueryResultRow>('ROLLBACK', []);
  } catch (error) {
    throw new AtRiskWeekPersistenceError({
      workspaceId: input.workspaceId,
      scopedDocId: input.scopedDocId,
      runId: input.runId,
      message: `Rollback failed after persistence error: ${errorMessage(error)}`,
    });
  }
}

function requireInsertedId(
  row: InsertedIdRow | undefined,
  tableName: string,
  input: AtRiskWeekOutputPersistenceInput
): string {
  if (!row) {
    throw new AtRiskWeekPersistenceError({
      workspaceId: input.workspaceId,
      scopedDocId: input.scopedDocId,
      runId: input.runId,
      message: `${tableName} insert returned no id`,
    });
  }

  return row.id;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
