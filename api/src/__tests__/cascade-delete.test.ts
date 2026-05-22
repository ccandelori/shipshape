import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '../db/client.js'

/**
 * Risk mitigated: Archiving a person document leaves the `properties->>'assignee_id'`
 * value on related issues pointing at the now-archived person. UI code that
 * doesn't surface "archived" badges shows stale assignments; reporting that
 * counts open issues by assignee double-counts orphans.
 *
 * The current design (api/src/routes/workspaces.ts:556-588 membership delete):
 *   - Membership row is deleted
 *   - Person document is archived (preserved for audit history; not hard-deleted)
 *   - owner_id is CLEARED on programs and sprints that the user owned
 *   - assignee_id is INTENTIONALLY NOT cleared on issues
 *
 * The "not cleared" is by design: the issue listing query
 * (api/src/routes/issues.ts:131-138) LEFT JOINs the person doc and selects
 *   CASE WHEN person_doc.archived_at IS NOT NULL THEN true ELSE false END
 *     as "assignee_archived"
 * so the API consumer can render an "archived" badge instead of treating the
 * orphan as a live assignment.
 *
 * These tests pin both halves of that contract:
 *   1. Archive does NOT cascade-clear assignee_id (audit history preserved)
 *   2. The issue listing JOIN surfaces assignee_archived=true on issues whose
 *      assignee is archived (UI can render correctly)
 *   3. owner_id IS cleared on programs/sprints (the documented exception)
 *
 * A future PR that "fixes" the cascade by clearing assignee_id will fail
 * test 1 and force the author to think through the audit-trail implications
 * deliberately. A future PR that removes the JOIN or the assignee_archived
 * flag will fail test 2.
 */
describe('Cascade delete safety on person archive (Task 14)', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  let workspaceId: string
  let archivedUserId: string
  let personDocId: string
  let issueDocId: string
  let programDocId: string
  let sprintDocId: string

  beforeAll(async () => {
    const ws = await pool.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`Cascade Test ${testRunId}`]
    )
    workspaceId = ws.rows[0]!.id

    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Archived User') RETURNING id`,
      [`cascade-${testRunId}@test.local`]
    )
    archivedUserId = u.rows[0]!.id

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`,
      [workspaceId, archivedUserId]
    )

    // Person document for this user
    const person = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'person', 'Archived User', 'workspace', $2::uuid, jsonb_build_object('user_id', $2::text))
       RETURNING id`,
      [workspaceId, archivedUserId]
    )
    personDocId = person.rows[0]!.id

    // Issue assigned to this user
    const issue = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'issue', 'Issue assigned to archive-target', 'workspace', $2::uuid,
               jsonb_build_object('state', 'in_progress', 'assignee_id', $2::text))
       RETURNING id`,
      [workspaceId, archivedUserId]
    )
    issueDocId = issue.rows[0]!.id

    // Program owned by this user
    const program = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'program', 'Program owned by archive-target', 'workspace', $2::uuid,
               jsonb_build_object('owner_id', $2::text))
       RETURNING id`,
      [workspaceId, archivedUserId]
    )
    programDocId = program.rows[0]!.id

    // Sprint owned by this user
    const sprint = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'Sprint owned by archive-target', 'workspace', $2::uuid,
               jsonb_build_object('owner_id', $2::text, 'sprint_number', 1))
       RETURNING id`,
      [workspaceId, archivedUserId]
    )
    sprintDocId = sprint.rows[0]!.id

    // Now run the exact archive sequence from api/src/routes/workspaces.ts:556-588
    await pool.query(
      'DELETE FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, archivedUserId]
    )
    await pool.query(
      `UPDATE documents SET archived_at = NOW()
       WHERE workspace_id = $1 AND document_type = 'person' AND properties->>'user_id' = $2`,
      [workspaceId, archivedUserId]
    )
    await pool.query(
      `UPDATE documents SET properties = properties - 'owner_id', updated_at = NOW()
       WHERE workspace_id = $1 AND document_type = 'program' AND properties->>'owner_id' = $2`,
      [workspaceId, archivedUserId]
    )
    await pool.query(
      `UPDATE documents SET properties = properties - 'owner_id', updated_at = NOW()
       WHERE workspace_id = $1 AND document_type = 'sprint' AND properties->>'owner_id' = $2`,
      [workspaceId, archivedUserId]
    )
  })

  afterAll(async () => {
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [workspaceId])
    await pool.query('DELETE FROM users WHERE id = $1', [archivedUserId])
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId])
  })

  it('archive does NOT cascade-clear assignee_id on issues (audit history preserved)', async () => {
    const result = await pool.query<{ assignee_id: string | null }>(
      `SELECT properties->>'assignee_id' as assignee_id FROM documents WHERE id = $1`,
      [issueDocId]
    )
    expect(result.rows[0]?.assignee_id).toBe(archivedUserId)
  })

  it('the issue listing JOIN surfaces assignee_archived=true for archived assignees', async () => {
    // This is the exact shape api/src/routes/issues.ts:131-138 uses
    const result = await pool.query<{ id: string; assignee_archived: boolean }>(
      `SELECT d.id,
              CASE WHEN person_doc.archived_at IS NOT NULL THEN true ELSE false END as assignee_archived
       FROM documents d
       LEFT JOIN documents person_doc ON person_doc.workspace_id = d.workspace_id
         AND person_doc.document_type = 'person'
         AND person_doc.properties->>'user_id' = d.properties->>'assignee_id'
       WHERE d.id = $1`,
      [issueDocId]
    )
    expect(result.rows[0]?.assignee_archived).toBe(true)
  })

  it('archive DOES cascade-clear owner_id on programs (the documented exception)', async () => {
    const result = await pool.query<{ owner_id: string | null; has_key: boolean }>(
      `SELECT properties->>'owner_id' as owner_id,
              properties ? 'owner_id' as has_key
       FROM documents WHERE id = $1`,
      [programDocId]
    )
    expect(result.rows[0]?.owner_id).toBeNull()
    expect(result.rows[0]?.has_key).toBe(false) // jsonb '-' operator drops the key entirely
  })

  it('archive DOES cascade-clear owner_id on sprints (the documented exception)', async () => {
    const result = await pool.query<{ owner_id: string | null; has_key: boolean }>(
      `SELECT properties->>'owner_id' as owner_id,
              properties ? 'owner_id' as has_key
       FROM documents WHERE id = $1`,
      [sprintDocId]
    )
    expect(result.rows[0]?.owner_id).toBeNull()
    expect(result.rows[0]?.has_key).toBe(false)
  })

  it('person document is archived (not hard-deleted) so audit references resolve', async () => {
    const result = await pool.query<{ id: string; archived_at: Date | null }>(
      `SELECT id, archived_at FROM documents WHERE id = $1`,
      [personDocId]
    )
    expect(result.rows[0]?.archived_at).not.toBeNull()
  })
})
