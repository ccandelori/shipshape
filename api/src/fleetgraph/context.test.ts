import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import {
  buildIssueContext,
  buildProjectContext,
  buildWeekContext,
  loadPriorFindings,
  resolveOwnership,
} from './context.js';

type IdRow = {
  id: string;
};

describe('FleetGraph context builders', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let workspaceId = '';
  let ownerUserId = '';
  let programId = '';
  let projectId = '';
  let weekId = '';
  let issueId = '';
  let parentIssueId = '';

  beforeAll(async () => {
    const workspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`FleetGraph Context ${testRunId}`]
    );
    workspaceId = workspaceResult.rows[0]!.id;

    const ownerResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Owner') RETURNING id`,
      [`fleetgraph-owner-${testRunId}@test.local`]
    );
    ownerUserId = ownerResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspaceId, ownerUserId]
    );

    const programResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'program', 'FleetGraph Program', 'workspace', $2, '{"color":"blue"}'::jsonb)
       RETURNING id`,
      [workspaceId, ownerUserId]
    );
    programId = programResult.rows[0]!.id;

    const projectResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'project', 'FleetGraph Project', 'workspace', $2::uuid,
               jsonb_build_object('owner_id', $2::text, 'color', 'green'))
       RETURNING id`,
      [workspaceId, ownerUserId]
    );
    projectId = projectResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'program')`,
      [projectId, programId]
    );

    const weekResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'FleetGraph Week 1', 'workspace', $2::uuid,
               jsonb_build_object('sprint_number', 1, 'owner_id', $2::text, 'assignee_ids', jsonb_build_array($2::text)))
       RETURNING id`,
      [workspaceId, ownerUserId]
    );
    weekId = weekResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'program'), ($1, $3, 'project')`,
      [weekId, programId, projectId]
    );

    const issueResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'issue', 'Blocked FleetGraph issue', 'workspace', $2::uuid,
               jsonb_build_object('state', 'in_progress', 'priority', 'high', 'assignee_id', $2::text))
       RETURNING id`,
      [workspaceId, ownerUserId]
    );
    issueId = issueResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'sprint'), ($1, $3, 'project'), ($1, $4, 'program')`,
      [issueId, weekId, projectId, programId]
    );

    const parentIssueResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'issue', 'Parent FleetGraph issue', 'workspace', $2::uuid,
               jsonb_build_object('state', 'todo', 'priority', 'medium'))
       RETURNING id`,
      [workspaceId, ownerUserId]
    );
    parentIssueId = parentIssueResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'parent')`,
      [issueId, parentIssueId]
    );

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, parent_id, visibility, created_by, properties, created_at)
       VALUES (
         $1, 'standup', 'Recent standup',
         '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Blocked by vendor response."}]}]}'::jsonb,
         $2, 'workspace', $3::uuid, jsonb_build_object('author_id', $3::text), NOW() - INTERVAL '2 days'
       )`,
      [workspaceId, weekId, ownerUserId]
    );

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, parent_id, visibility, created_by, properties, created_at)
       VALUES (
         $1, 'standup', 'Old standup',
         '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Old blocker."}]}]}'::jsonb,
         $2, 'workspace', $3::uuid, jsonb_build_object('author_id', $3::text), NOW() - INTERVAL '14 days'
       )`,
      [workspaceId, weekId, ownerUserId]
    );

    await pool.query(
      `INSERT INTO sprint_iterations (
         sprint_id, workspace_id, story_id, story_title, status,
         what_attempted, blockers_encountered, author_id
       )
       VALUES ($1, $2, 'FG-1', 'Build context', 'fail', 'Loaded issue graph', 'Missing standup evidence', $3)`,
      [weekId, workspaceId, ownerUserId]
    );

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, parent_id, visibility, created_by, properties)
       VALUES ($1, 'weekly_plan', 'Week plan', $2, 'workspace', $3::uuid,
               jsonb_build_object('person_id', $3::text, 'week_number', 1))`,
      [workspaceId, weekId, ownerUserId]
    );

    const retroResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'weekly_retro', 'Week retro', 'workspace', $2, '{"outcome":"learned"}'::jsonb)
       RETURNING id`,
      [workspaceId, ownerUserId]
    );

    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'sprint')`,
      [retroResult.rows[0]!.id, weekId]
    );

    await pool.query(
      `INSERT INTO fleetgraph_findings (
         workspace_id, scoped_document_id, detector_type, severity, evidence,
         recipient_user_id, lifecycle_state, material_change_key, created_at
       )
       VALUES (
         $1, $2, 'at_risk_week', 'high',
         '[{"sourceType":"issue","quote":"Blocked FleetGraph issue has not moved."}]'::jsonb,
         $3, 'open', $4, NOW() - INTERVAL '2 days'
       )`,
      [workspaceId, weekId, ownerUserId, `week-risk:${testRunId}`]
    );

    await pool.query(
      `INSERT INTO fleetgraph_findings (
         workspace_id, scoped_document_id, detector_type, severity, evidence,
         recipient_user_id, lifecycle_state, material_change_key, created_at
       )
       VALUES (
         $1, $2, 'at_risk_week', 'medium',
         '[{"sourceType":"issue","quote":"Old finding."}]'::jsonb,
         $3, 'expired', $4, NOW() - INTERVAL '40 days'
       )`,
      [workspaceId, weekId, ownerUserId, `old-week-risk:${testRunId}`]
    );
  });

  it('builds a Week context from associated Ship data', async () => {
    const context = await buildWeekContext(pool, workspaceId, weekId);

    expect(context.week.id).toBe(weekId);
    expect(context.ownerUserId).toBe(ownerUserId);
    expect(context.programId).toBe(programId);
    expect(context.projectId).toBe(projectId);
    expect(context.issues).toEqual([
      expect.objectContaining({
        id: issueId,
        state: 'in_progress',
        priority: 'high',
        assigneeUserId: ownerUserId,
      }),
    ]);
    expect(context.standups).toEqual([
      expect.objectContaining({
        title: 'Recent standup',
        authorUserId: ownerUserId,
      }),
    ]);
    expect(context.sprintIterations).toEqual([
      expect.objectContaining({
        storyId: 'FG-1',
        blockersEncountered: 'Missing standup evidence',
      }),
    ]);
    expect(context.accountability.weeklyPlan.exists).toBe(true);
    expect(context.accountability.weeklyRetro.exists).toBe(true);
  });

  it('builds project and issue contexts from the same association graph', async () => {
    const projectContext = await buildProjectContext(pool, workspaceId, projectId);
    const issueContext = await buildIssueContext(pool, workspaceId, issueId);

    expect(projectContext.project.id).toBe(projectId);
    expect(projectContext.ownerUserId).toBe(ownerUserId);
    expect(projectContext.programId).toBe(programId);
    expect(projectContext.activeIssues.map((issue) => issue.id)).toEqual([issueId]);
    expect(projectContext.weeks.map((week) => week.id)).toEqual([weekId]);

    expect(issueContext.issue.id).toBe(issueId);
    expect(issueContext.assigneeUserId).toBe(ownerUserId);
    expect(issueContext.parentIssueId).toBe(parentIssueId);
    expect(issueContext.weekId).toBe(weekId);
    expect(issueContext.projectId).toBe(projectId);
    expect(issueContext.programId).toBe(programId);
    expect(issueContext.blockerStandups).toEqual([
      expect.objectContaining({ title: 'Recent standup' }),
    ]);
  });

  it('loads recent prior findings and resolves ownership deterministically', async () => {
    const priorFindings = await loadPriorFindings(pool, workspaceId, weekId);

    expect(priorFindings).toEqual([
      expect.objectContaining({
        detectorType: 'at_risk_week',
        lifecycleState: 'open',
        materialChangeKey: `week-risk:${testRunId}`,
      }),
    ]);
    expect(await resolveOwnership(pool, workspaceId, 'week', weekId)).toBe(ownerUserId);
    expect(await resolveOwnership(pool, workspaceId, 'project', projectId)).toBe(ownerUserId);
    expect(await resolveOwnership(pool, workspaceId, 'issue', issueId)).toBe(ownerUserId);
  });
});
