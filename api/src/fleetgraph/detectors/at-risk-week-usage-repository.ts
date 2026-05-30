import type { QueryResultRow } from 'pg';
import type { FleetGraphQueryClient } from '../context.js';
import type { FleetGraphTrigger } from '../types.js';
import { AtRiskWeekPersistenceError } from './at-risk-week-output-repository.js';

export type AtRiskWeekUsageRecord = {
  runId: string;
  workspaceId: string;
  trigger: FleetGraphTrigger;
  detector: 'at_risk_week';
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  traceMetadata: object;
};

export type AtRiskWeekUsageRepository = {
  persistUsage: (record: AtRiskWeekUsageRecord) => Promise<void>;
};

export function createPostgresAtRiskWeekUsageRepository(
  client: FleetGraphQueryClient
): AtRiskWeekUsageRepository {
  return {
    persistUsage: (record) => persistAtRiskWeekUsage(client, record),
  };
}

async function persistAtRiskWeekUsage(
  client: FleetGraphQueryClient,
  record: AtRiskWeekUsageRecord
): Promise<void> {
  try {
    await client.query<QueryResultRow>(
      `INSERT INTO fleetgraph_usage (
         run_id, workspace_id, trigger, detector, model_name,
         input_tokens, output_tokens, estimated_cost_usd, trace_metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        record.runId,
        record.workspaceId,
        record.trigger,
        record.detector,
        record.modelName,
        record.inputTokens,
        record.outputTokens,
        record.estimatedCost,
        JSON.stringify(record.traceMetadata),
      ]
    );
  } catch (error) {
    throw new AtRiskWeekPersistenceError({
      workspaceId: record.workspaceId,
      scopedDocId: 'unknown',
      runId: record.runId,
      message: `Usage persistence failed: ${errorMessage(error)}`,
    });
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
