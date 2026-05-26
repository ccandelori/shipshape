import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/client.js';
import {
  passthroughAtRiskWeekTraceRunner,
} from './detectors/at-risk-week.js';
import {
  fleetGraphDemoScenarioNames,
  runFleetGraphDemoScenario,
  type FleetGraphDemoScenarioResult,
} from './demo-scenarios.js';

type IdRow = {
  id: string;
};

type CountRow = {
  count: string;
};

type UsageRow = {
  run_id: string;
  trigger: string;
  detector: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: string;
  trace_metadata: {
    branchPath?: string;
    findingId?: string | null;
    actionCandidateId?: string | null;
  };
};

describe('FleetGraph deterministic demo scenarios', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const requestedAt = '2026-05-26T05:00:00.000Z';
  const completedAt = '2026-05-26T05:03:00.000Z';
  let workspaceId = '';
  let ownerUserId = '';
  let scopedDocId = '';

  beforeAll(async () => {
    const workspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`FleetGraph Demo ${testRunId}`]
    );
    workspaceId = workspaceResult.rows[0]!.id;

    const ownerResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Demo Owner') RETURNING id`,
      [`fleetgraph-demo-${testRunId}@test.local`]
    );
    ownerUserId = ownerResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspaceId, ownerUserId]
    );

    const weekResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'FleetGraph Demo Week', 'workspace', $2::uuid,
               jsonb_build_object('owner_id', $2::text))
       RETURNING id`,
      [workspaceId, ownerUserId]
    );
    scopedDocId = weekResult.rows[0]!.id;
  });

  afterAll(async () => {
    if (workspaceId) {
      await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    }

    if (ownerUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [ownerUserId]);
    }
  });

  it('runs quiet and finding paths with stable branch and usage evidence', async () => {
    const client = await pool.connect();
    const broadcastToUser = vi.fn();
    const quietRunId = '55555555-5555-4555-8555-555555555555';
    const findingRunId = '66666666-6666-4666-8666-666666666666';

    try {
      const quietResult = await runFleetGraphDemoScenario({
        scenarioName: 'quiet_prefilter',
        client,
        workspaceId,
        scopedDocId,
        ownerUserId,
        runId: quietRunId,
        requestedAt,
        completedAt,
        traceRunner: passthroughAtRiskWeekTraceRunner,
        broadcastToUser,
      });
      const findingResult = await runFleetGraphDemoScenario({
        scenarioName: 'finding_pending_action',
        client,
        workspaceId,
        scopedDocId,
        ownerUserId,
        runId: findingRunId,
        requestedAt,
        completedAt,
        traceRunner: passthroughAtRiskWeekTraceRunner,
        broadcastToUser,
      });

      expect(fleetGraphDemoScenarioNames).toEqual(['quiet_prefilter', 'finding_pending_action']);
      expect(quietResult).toMatchObject<FleetGraphDemoScenarioResult>({
        scenarioName: 'quiet_prefilter',
        runId: quietRunId,
        status: 'exited',
        branchPath: 'prefilter-exit',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        findingId: null,
        actionCandidateId: null,
      });
      expect(findingResult).toMatchObject<FleetGraphDemoScenarioResult>({
        scenarioName: 'finding_pending_action',
        runId: findingRunId,
        status: 'completed',
        branchPath: 'output',
        inputTokens: 850,
        outputTokens: 172,
        estimatedCost: 0.000231,
        findingId: expect.any(String),
        actionCandidateId: expect.any(String),
      });
      expect(broadcastToUser).toHaveBeenCalledTimes(1);

      const findingCount = await pool.query<CountRow>(
        `SELECT COUNT(*)::text AS count
         FROM fleetgraph_findings
         WHERE workspace_id = $1
           AND material_change_key LIKE 'v1:demo:%'`,
        [workspaceId]
      );
      expect(findingCount.rows[0]!.count).toBe('1');

      const usageResult = await pool.query<UsageRow>(
        `SELECT run_id, trigger, detector, model_name, input_tokens, output_tokens,
                estimated_cost_usd::text, trace_metadata
         FROM fleetgraph_usage
         WHERE workspace_id = $1
           AND run_id = ANY($2::text[])
         ORDER BY run_id ASC`,
        [workspaceId, [quietRunId, findingRunId]]
      );
      expect(usageResult.rows).toEqual([
        {
          run_id: quietRunId,
          trigger: 'proactive',
          detector: 'at_risk_week',
          model_name: 'gpt-4o-mini',
          input_tokens: 0,
          output_tokens: 0,
          estimated_cost_usd: '0.000000',
          trace_metadata: expect.objectContaining({
            branchPath: 'prefilter-exit',
            findingId: null,
            actionCandidateId: null,
          }),
        },
        {
          run_id: findingRunId,
          trigger: 'proactive',
          detector: 'at_risk_week',
          model_name: 'gpt-4o-mini',
          input_tokens: 850,
          output_tokens: 172,
          estimated_cost_usd: '0.000231',
          trace_metadata: expect.objectContaining({
            branchPath: 'output',
            findingId: findingResult.findingId,
            actionCandidateId: findingResult.actionCandidateId,
          }),
        },
      ]);
    } finally {
      client.release();
    }
  });
});
