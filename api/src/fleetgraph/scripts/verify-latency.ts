import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { QueryResultRow } from 'pg';
import { pool } from '../../db/client.js';
import { buildWeekContext, type FleetGraphQueryClient } from '../context.js';
import {
  atRiskWeekLatencyTargetMs,
  createAtRiskWeekCheckpointer,
  passthroughAtRiskWeekTraceRunner,
  runAtRiskWeekGraph,
  type AtRiskWeekReasoningOutput,
  type AtRiskWeekStructuredReasoner,
} from '../detectors/at-risk-week.js';
import { shouldRunDetector } from '../guards.js';
import { createAtRiskWeekScopeRunner } from '../proactive-runner.js';
import {
  createProactiveTriggerController,
  maxPendingMutationChecks,
  mutationDebounceMs,
  proactivePollIntervalMs,
  type FleetGraphTriggerLogger,
  type FleetGraphTriggerTimers,
} from '../triggers.js';

type IdRow = QueryResultRow & {
  id: string;
};

type TicketRow = QueryResultRow & {
  ticket_number: number | string;
};

type ProofScope = {
  workspaceId: string;
  ownerUserId: string;
  programId: string;
  projectId: string;
  weekId: string;
};

type ProofMutation = {
  issueId: string;
  issueTitle: string;
  committedAtIso: string;
  committedAtMonotonicMs: number;
};

type FindingRow = QueryResultRow & {
  id: string;
  lifecycle_state: string;
  severity: string;
  material_change_key: string;
  created_at: Date;
};

type ProofResult = {
  runId: string;
  workspaceId: string;
  weekId: string;
  issueId: string;
  findingId: string;
  lifecycleState: string;
  severity: string;
  mutationDebounceMs: number;
  observedLatencyMs: number;
  targetLatencyMs: number;
  latencyTargetMet: boolean;
  mutationCommittedAt: string;
  findingCreatedAt: string;
  materialChangeKey: string;
};

const latencyPollIntervalMs = 1_000;
const proofModelName = 'fleetgraph-latency-proof-deterministic';
const proofConfig = {
  openaiApiKey: 'unused-latency-proof-openai-key',
  langchainApiKey: 'unused-latency-proof-langsmith-key',
  langchainTracingV2: true,
  langchainProject: 'fleetgraph-latency-proof',
} as const;

async function main(): Promise<void> {
  const runId = randomUUID();
  const scope = await createProofScope(runId);
  const mutation = await commitRiskMutation(scope, runId);
  const finding = await runMutationTriggerProof(scope, mutation, runId);
  const observedLatencyMs = Math.round(performance.now() - mutation.committedAtMonotonicMs);
  const result: ProofResult = {
    runId,
    workspaceId: scope.workspaceId,
    weekId: scope.weekId,
    issueId: mutation.issueId,
    findingId: finding.id,
    lifecycleState: finding.lifecycle_state,
    severity: finding.severity,
    mutationDebounceMs,
    observedLatencyMs,
    targetLatencyMs: atRiskWeekLatencyTargetMs,
    latencyTargetMet: observedLatencyMs <= atRiskWeekLatencyTargetMs,
    mutationCommittedAt: mutation.committedAtIso,
    findingCreatedAt: finding.created_at.toISOString(),
    materialChangeKey: finding.material_change_key,
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.latencyTargetMet) {
    throw new Error(
      `FleetGraph latency proof exceeded target: observedLatencyMs=${result.observedLatencyMs}, targetLatencyMs=${result.targetLatencyMs}, runId=${runId}`
    );
  }
}

async function createProofScope(runId: string): Promise<ProofScope> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const workspaceId = await requireId(
      client,
      'Ship Workspace',
      `SELECT id FROM workspaces WHERE name = $1`,
      ['Ship Workspace']
    );
    const ownerUserId = await requireId(
      client,
      'dev@ship.local user',
      `SELECT u.id
       FROM users u
       JOIN workspace_memberships wm ON wm.user_id = u.id
       WHERE lower(u.email) = lower($1)
         AND wm.workspace_id = $2`,
      ['dev@ship.local', workspaceId]
    );
    const programId = await requireId(
      client,
      'FleetGraph MVP program',
      `SELECT id
       FROM documents
       WHERE workspace_id = $1
         AND document_type = 'program'
         AND properties->>'prefix' = 'FG'`,
      [workspaceId]
    );
    const projectId = await requireId(
      client,
      'FleetGraph HITL Findings Inbox project',
      `SELECT d.id
       FROM documents d
       JOIN document_associations da ON da.document_id = d.id
        AND da.related_id = $2
        AND da.relationship_type = 'program'
       WHERE d.workspace_id = $1
         AND d.document_type = 'project'
         AND d.title = 'FleetGraph - HITL Findings Inbox'`,
      [workspaceId, programId]
    );
    const weekResult = await client.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by)
       VALUES ($1, 'sprint', $2, $3::jsonb, $4::jsonb, $5)
       RETURNING id`,
      [
        workspaceId,
        `FleetGraph Latency Proof ${runId}`,
        JSON.stringify(createTextDocument('FleetGraph latency proof scope.')),
        JSON.stringify({
          owner_id: ownerUserId,
          project_id: projectId,
          status: 'active',
          plan: 'Verify proactive FleetGraph detects a blocked high-priority issue within five minutes.',
          success_criteria: 'A finding appears in the inbox before the latency target expires.',
        }),
        ownerUserId,
      ]
    );
    const weekId = requireReturnedId(weekResult.rows[0], 'latency proof Week');

    await createAssociation(client, weekId, projectId, 'project');
    await createAssociation(client, weekId, programId, 'program');
    await client.query('COMMIT');

    return {
      workspaceId,
      ownerUserId,
      programId,
      projectId,
      weekId,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function commitRiskMutation(scope: ProofScope, runId: string): Promise<ProofMutation> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const ticketNumber = await nextProgramTicketNumber(scope.workspaceId, scope.programId);
    const issueTitle = `FleetGraph latency proof blocked issue ${runId}`;
    const issueResult = await client.query<IdRow>(
      `INSERT INTO documents (
         workspace_id, document_type, title, content, properties, ticket_number, created_by
       )
       VALUES ($1, 'issue', $2, $3::jsonb, $4::jsonb, $5, $6)
       RETURNING id`,
      [
        scope.workspaceId,
        issueTitle,
        JSON.stringify(createTextDocument('Blocked on proof owner confirmation; no recovery owner is named.')),
        JSON.stringify({
          state: 'blocked',
          priority: 'high',
          source: 'latency_proof',
          assignee_id: scope.ownerUserId,
          estimate: 1,
        }),
        ticketNumber,
        scope.ownerUserId,
      ]
    );
    const issueId = requireReturnedId(issueResult.rows[0], 'latency proof issue');

    await createAssociation(client, issueId, scope.programId, 'program');
    await createAssociation(client, issueId, scope.projectId, 'project');
    await createAssociation(client, issueId, scope.weekId, 'sprint');
    await client.query('COMMIT');

    return {
      issueId,
      issueTitle,
      committedAtIso: new Date().toISOString(),
      committedAtMonotonicMs: performance.now(),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runMutationTriggerProof(
  scope: ProofScope,
  mutation: ProofMutation,
  runId: string
): Promise<FindingRow> {
  const controller = createProactiveTriggerController({
    pool,
    runScope: createAtRiskWeekScopeRunner({
      loadConfig: () => proofConfig,
      runGraph: runAtRiskWeekGraph,
      buildWeekContext,
      shouldRunDetector,
      createReasoner: () => createProofReasoner(mutation, runId),
      createTraceRunner: () => passthroughAtRiskWeekTraceRunner,
      createCheckpointer: createAtRiskWeekCheckpointer,
      broadcastToUser: () => undefined,
      randomUUID: () => runId,
      now: () => new Date().toISOString(),
      traceClock: {
        now: () => ({
          iso: new Date().toISOString(),
          monotonicMs: performance.now(),
        }),
      },
      sleep: async (delayMs) => {
        await sleep(delayMs);
      },
      logger,
    }),
    timers,
    logger,
    pollIntervalMs: proactivePollIntervalMs,
    mutationDebounceMs,
    maxPendingMutationChecks,
  });

  try {
    if (!controller.enqueueMutationCheck(scope.workspaceId, scope.weekId)) {
      throw new Error(
        `FleetGraph latency proof could not enqueue mutation check: workspaceId=${scope.workspaceId}, weekId=${scope.weekId}, runId=${runId}`
      );
    }

    return await waitForFinding(scope.weekId, mutation.committedAtIso, runId);
  } finally {
    controller.shutdown();
  }
}

function createProofReasoner(mutation: ProofMutation, runId: string): AtRiskWeekStructuredReasoner {
  return {
    modelName: proofModelName,
    invoke: async () => ({
      reasoning: createProofReasoning(mutation, runId),
      modelUsage: {
        modelName: proofModelName,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      },
    }),
  };
}

function createProofReasoning(mutation: ProofMutation, runId: string): AtRiskWeekReasoningOutput {
  return {
    isAtRisk: true,
    severity: 'high',
    evidence: [{
      sourceType: 'issue',
      sourceDocumentId: mutation.issueId,
      quote: mutation.issueTitle,
      observedAt: mutation.committedAtIso,
    }],
    recommendedAction: {
      kind: 'draft_comment',
      title: 'Name the blocker owner',
      body: `Please name the owner and next recovery action for latency proof run ${runId}.`,
    },
    rationale: 'The proof issue is high priority, blocked, and has no recovery owner named in the Week context.',
  };
}

async function waitForFinding(
  scopedDocumentId: string,
  mutationCommittedAt: string,
  runId: string
): Promise<FindingRow> {
  const deadlineMs = performance.now() + atRiskWeekLatencyTargetMs;

  while (performance.now() <= deadlineMs) {
    const result = await pool.query<FindingRow>(
      `SELECT id, lifecycle_state, severity, material_change_key, created_at
       FROM fleetgraph_findings
       WHERE scoped_document_id = $1
         AND created_at >= $2::timestamptz
       ORDER BY created_at DESC
       LIMIT 1`,
      [scopedDocumentId, mutationCommittedAt]
    );
    const row = result.rows[0];

    if (row) {
      return row;
    }

    await sleep(latencyPollIntervalMs);
  }

  throw new Error(
    `FleetGraph latency proof timed out before finding appeared: scopedDocumentId=${scopedDocumentId}, runId=${runId}, targetLatencyMs=${atRiskWeekLatencyTargetMs}`
  );
}

async function requireId(
  client: FleetGraphQueryClient,
  label: string,
  queryText: string,
  values: unknown[]
): Promise<string> {
  const result = await client.query<IdRow>(queryText, values);
  return requireReturnedId(result.rows[0], label);
}

function requireReturnedId(row: IdRow | undefined, label: string): string {
  if (!row) {
    throw new Error(
      `FleetGraph latency proof required seeded record was not found: ${label}. Run the database seed script first.`
    );
  }

  return row.id;
}

async function nextProgramTicketNumber(workspaceId: string, programId: string): Promise<number> {
  const result = await pool.query<TicketRow>(
    `SELECT COALESCE(MAX(d.ticket_number), 0) + 1 AS ticket_number
     FROM documents d
     JOIN document_associations da ON da.document_id = d.id
      AND da.related_id = $2
      AND da.relationship_type = 'program'
     WHERE d.workspace_id = $1
       AND d.document_type = 'issue'`,
    [workspaceId, programId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new Error(
      `FleetGraph latency proof could not allocate ticket number: workspaceId=${workspaceId}, programId=${programId}`
    );
  }

  return Number(row.ticket_number);
}

async function createAssociation(
  client: FleetGraphQueryClient,
  documentId: string,
  relatedId: string,
  relationshipType: 'program' | 'project' | 'sprint'
): Promise<void> {
  await client.query(
    `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      documentId,
      relatedId,
      relationshipType,
      JSON.stringify({ created_via: 'fleetgraph_latency_proof' }),
    ]
  );
}

function createTextDocument(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text,
      }],
    }],
  };
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

const logger: FleetGraphTriggerLogger = {
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

const timers: FleetGraphTriggerTimers = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout,
};

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
