import { beforeAll, describe, expect, it } from 'vitest'
import { pool } from '../db/client.js'

const fleetGraphTables = [
  'fleetgraph_findings',
  'fleetgraph_action_candidates',
  'fleetgraph_approvals',
  'fleetgraph_suppressions',
  'fleetgraph_action_executions',
  'fleetgraph_inbox_reads',
  'fleetgraph_finding_reads',
  'fleetgraph_usage',
] as const

type FleetGraphTable = typeof fleetGraphTables[number]

const expectedColumns: Record<FleetGraphTable, readonly string[]> = {
  fleetgraph_findings: [
    'id',
    'workspace_id',
    'scoped_document_id',
    'detector_type',
    'severity',
    'evidence',
    'recipient_user_id',
    'lifecycle_state',
    'material_change_key',
    'created_at',
    'updated_at',
    'expires_at',
  ],
  fleetgraph_action_candidates: [
    'id',
    'finding_id',
    'target_document_id',
    'owner_user_id',
    'role_reason',
    'urgency',
    'evidence',
    'recommended_action',
    'approval_level',
    'reversibility',
  ],
  fleetgraph_approvals: [
    'id',
    'finding_id',
    'action_candidate_id',
    'actor_user_id',
    'decision',
    'edited_action',
    'reason',
    'created_at',
  ],
  fleetgraph_suppressions: [
    'id',
    'finding_id',
    'suppression_type',
    'reason',
    'expires_at',
    'created_at',
  ],
  fleetgraph_action_executions: [
    'id',
    'finding_id',
    'action_candidate_id',
    'actor_user_id',
    'idempotency_key',
    'result',
    'created_at',
  ],
  fleetgraph_inbox_reads: [
    'workspace_id',
    'user_id',
    'last_opened_at',
    'created_at',
    'updated_at',
  ],
  fleetgraph_finding_reads: [
    'finding_id',
    'workspace_id',
    'user_id',
    'read_at',
    'created_at',
    'updated_at',
  ],
  fleetgraph_usage: [
    'id',
    'run_id',
    'workspace_id',
    'trigger',
    'detector',
    'model_name',
    'input_tokens',
    'output_tokens',
    'estimated_cost_usd',
    'trace_metadata',
    'created_at',
  ],
}

const expectedIndexes = [
  'idx_fleetgraph_findings_workspace_id',
  'idx_fleetgraph_findings_lifecycle_state',
  'idx_fleetgraph_findings_material_change_key',
  'idx_fleetgraph_findings_expires_at',
  'idx_fleetgraph_suppressions_expires_at',
  'idx_fleetgraph_action_executions_idempotency_key',
  'idx_fleetgraph_inbox_reads_user_id',
  'idx_fleetgraph_finding_reads_workspace_user',
  'idx_fleetgraph_usage_workspace_id',
] as const

const expectedCheckConstraints = [
  'fleetgraph_findings_detector_type_check',
  'fleetgraph_findings_severity_check',
  'fleetgraph_findings_lifecycle_state_check',
  'fleetgraph_action_candidates_urgency_check',
  'fleetgraph_action_candidates_approval_level_check',
  'fleetgraph_action_candidates_reversibility_check',
  'fleetgraph_approvals_decision_check',
  'fleetgraph_approvals_rejected_reason_check',
  'fleetgraph_suppressions_suppression_type_check',
  'fleetgraph_action_executions_idempotency_key_not_blank_check',
  'fleetgraph_action_executions_result_object_check',
  'fleetgraph_usage_trigger_check',
] as const

type ColumnRow = {
  table_name: FleetGraphTable
  column_name: string
}

type IndexRow = {
  indexname: string
}

type ConstraintRow = {
  conname: string
}

type IdRow = {
  id: string
}

type CountRow = {
  count: string
}

type TimestampRow = {
  created_at: Date
  updated_at: Date
}

describe('FleetGraph outcome persistence migration', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const materialChangeKey = `week-risk:${testRunId}`
  let workspaceId = ''
  let userId = ''
  let scopedDocumentId = ''
  let targetDocumentId = ''

  beforeAll(async () => {
    const workspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`FleetGraph Migration ${testRunId}`]
    )
    workspaceId = workspaceResult.rows[0]!.id

    const userResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Owner') RETURNING id`,
      [`fleetgraph-${testRunId}@test.local`]
    )
    userId = userResult.rows[0]!.id

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspaceId, userId]
    )

    const scopedDocumentResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'FleetGraph Week', 'workspace', $2::uuid,
               jsonb_build_object('owner_id', $2::text, 'sprint_number', 1))
       RETURNING id`,
      [workspaceId, userId]
    )
    scopedDocumentId = scopedDocumentResult.rows[0]!.id

    const targetDocumentResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'issue', 'Blocked issue', 'workspace', $2::uuid,
               jsonb_build_object('state', 'in_progress', 'assignee_id', $2::text))
       RETURNING id`,
      [workspaceId, userId]
    )
    targetDocumentId = targetDocumentResult.rows[0]!.id
  })

  it('creates outcome tables with expected columns, checks, and indexes', async () => {
    const columnsResult = await pool.query<ColumnRow>(
      `SELECT table_name::text AS table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [fleetGraphTables]
    )
    const columnsByTable = new Map<FleetGraphTable, Set<string>>()
    for (const row of columnsResult.rows) {
      const columns = columnsByTable.get(row.table_name) ?? new Set<string>()
      columns.add(row.column_name)
      columnsByTable.set(row.table_name, columns)
    }

    for (const tableName of fleetGraphTables) {
      expect(columnsByTable.has(tableName), `${tableName} must exist`).toBe(true)
      const tableColumns = columnsByTable.get(tableName) ?? new Set<string>()
      for (const columnName of expectedColumns[tableName]) {
        expect(tableColumns.has(columnName), `${tableName}.${columnName} must exist`).toBe(true)
      }
    }

    const indexesResult = await pool.query<IndexRow>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = ANY($1::text[])`,
      [fleetGraphTables]
    )
    const indexNames = new Set(indexesResult.rows.map((row) => row.indexname))
    for (const indexName of expectedIndexes) {
      expect(indexNames.has(indexName), `${indexName} must exist`).toBe(true)
    }

    const constraintsResult = await pool.query<ConstraintRow>(
      `SELECT c.conname
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = ANY($1::text[])
         AND c.contype = 'c'`,
      [fleetGraphTables]
    )
    const constraintNames = new Set(constraintsResult.rows.map((row) => row.conname))
    for (const constraintName of expectedCheckConstraints) {
      expect(constraintNames.has(constraintName), `${constraintName} must exist`).toBe(true)
    }
  })

  it('persists FleetGraph outcomes and cascades them when the workspace is deleted', async () => {
    const findingResult = await pool.query<IdRow>(
      `INSERT INTO fleetgraph_findings (
         workspace_id, scoped_document_id, detector_type, severity, evidence,
         recipient_user_id, lifecycle_state, material_change_key, expires_at
       )
       VALUES (
         $1, $2, 'at_risk_week', 'high',
         '[{"sourceType":"issue","quote":"Issue has been blocked for two days."}]'::jsonb,
         $3, 'pending_review', $4, NOW() + INTERVAL '7 days'
       )
       RETURNING id`,
      [workspaceId, scopedDocumentId, userId, materialChangeKey]
    )
    const findingId = findingResult.rows[0]!.id

    const actionCandidateResult = await pool.query<IdRow>(
      `INSERT INTO fleetgraph_action_candidates (
         finding_id, target_document_id, owner_user_id, role_reason, urgency, evidence,
         recommended_action, approval_level, reversibility
       )
       VALUES (
         $1, $2, $3, 'Week owner is accountable for blocked delivery work.', 'high',
         '[{"sourceType":"issue","quote":"Blocked issue needs owner follow-up."}]'::jsonb,
         'Ask the owner for blocker status and next step.',
         'approval_required', 'reversible'
       )
       RETURNING id`,
      [findingId, targetDocumentId, userId]
    )
    const actionCandidateId = actionCandidateResult.rows[0]!.id

    await pool.query(
      `INSERT INTO fleetgraph_approvals (
         finding_id, action_candidate_id, actor_user_id, decision, edited_action
       )
       VALUES ($1, $2, $3, 'edited', 'Please post a blocker update before standup.')`,
      [findingId, actionCandidateId, userId]
    )

    await pool.query(
      `INSERT INTO fleetgraph_suppressions (finding_id, suppression_type, reason, expires_at)
       VALUES ($1, 'snoozed', 'Owner already acknowledged the blocker.', NOW() + INTERVAL '1 day')`,
      [findingId]
    )

    await pool.query(
      `INSERT INTO fleetgraph_usage (
         run_id, workspace_id, trigger, detector, model_name,
         input_tokens, output_tokens, estimated_cost_usd
       )
       VALUES ($1, $2, 'proactive', 'at_risk_week', 'gpt-4.1-mini', 1200, 240, 0.0100)`,
      [`fleetgraph-${testRunId}`, workspaceId]
    )

    await pool.query(
      `INSERT INTO fleetgraph_inbox_reads (workspace_id, user_id, last_opened_at)
       VALUES ($1, $2, NOW())`,
      [workspaceId, userId]
    )

    await pool.query(
      `INSERT INTO fleetgraph_finding_reads (finding_id, workspace_id, user_id)
       VALUES ($1, $2, $3)`,
      [findingId, workspaceId, userId]
    )

    const queryResult = await pool.query<TimestampRow>(
      `SELECT created_at, updated_at
       FROM fleetgraph_findings
       WHERE workspace_id = $1
         AND lifecycle_state = 'pending_review'
         AND material_change_key = $2`,
      [workspaceId, materialChangeKey]
    )
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0]!.updated_at.getTime()).toBeGreaterThanOrEqual(
      queryResult.rows[0]!.created_at.getTime()
    )

    await pool.query('SELECT pg_sleep(0.01)')
    await pool.query(
      `UPDATE fleetgraph_findings SET lifecycle_state = 'open' WHERE id = $1`,
      [findingId]
    )
    const updatedTimestampResult = await pool.query<TimestampRow>(
      `SELECT created_at, updated_at FROM fleetgraph_findings WHERE id = $1`,
      [findingId]
    )
    expect(updatedTimestampResult.rows[0]!.updated_at.getTime()).toBeGreaterThan(
      queryResult.rows[0]!.updated_at.getTime()
    )

    await expect(pool.query(
      `INSERT INTO fleetgraph_findings (
         workspace_id, scoped_document_id, detector_type, severity, evidence,
         recipient_user_id, lifecycle_state, material_change_key
       )
       VALUES ($1, $2, 'at_risk_week', 'high', '[]'::jsonb, $3, 'waiting', $4)`,
      [workspaceId, scopedDocumentId, userId, `${materialChangeKey}:invalid`]
    )).rejects.toThrow()

    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId])

    for (const tableName of fleetGraphTables) {
      const countResult = await pool.query<CountRow>(
        `SELECT COUNT(*)::text AS count FROM ${tableName}`,
        []
      )
      expect(countResult.rows[0]!.count, `${tableName} should cascade through workspace deletion`).toBe('0')
    }

    await pool.query('DELETE FROM users WHERE id = $1', [userId])
  })
})
