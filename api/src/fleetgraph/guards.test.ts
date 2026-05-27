import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import type { WeekContext } from './context.js';
import {
  acquireAdvisoryLock,
  checkSuppression,
  deriveAdvisoryLockKey,
  generateMaterialChangeKey,
  releaseAdvisoryLock,
  shouldRunDetector,
} from './guards.js';

type IdRow = {
  id: string;
};

type SuppressionInsertRow = {
  id: string;
  expires_at: Date;
};

type WeekContextScope = {
  workspaceId: string;
  weekId: string;
  ownerUserId: string;
  projectId: string | null;
  programId: string | null;
};

const staticWeekContextScope: WeekContextScope = {
  workspaceId: '20000000-0000-4000-8000-000000000001',
  weekId: '50000000-0000-4000-8000-000000000001',
  ownerUserId: '30000000-0000-4000-8000-000000000001',
  projectId: '70000000-0000-4000-8000-000000000001',
  programId: '80000000-0000-4000-8000-000000000001',
};

describe('FleetGraph guards', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const openMaterialChangeKey = `v1:open-${testRunId}`;
  let workspaceId = '';
  let ownerUserId = '';
  let weekId = '';
  let openFindingId = '';

  beforeAll(async () => {
    const workspaceResult = await pool.query<IdRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`FleetGraph Guards ${testRunId}`]
    );
    workspaceId = workspaceResult.rows[0]!.id;

    const ownerResult = await pool.query<IdRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'FleetGraph Guard Owner') RETURNING id`,
      [`fleetgraph-guard-owner-${testRunId}@test.local`]
    );
    ownerUserId = ownerResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspaceId, ownerUserId]
    );

    const weekResult = await pool.query<IdRow>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'FleetGraph Guard Week', 'workspace', $2, '{}'::jsonb)
       RETURNING id`,
      [workspaceId, ownerUserId]
    );
    weekId = weekResult.rows[0]!.id;

    const findingResult = await pool.query<IdRow>(
      `INSERT INTO fleetgraph_findings (
         workspace_id, scoped_document_id, detector_type, severity, evidence,
         recipient_user_id, lifecycle_state, material_change_key
       )
       VALUES (
         $1, $2, 'at_risk_week', 'high',
         '[{"sourceType":"issue","quote":"Still blocked."}]'::jsonb,
         $3, 'open', $4
       )
       RETURNING id`,
      [workspaceId, weekId, ownerUserId, openMaterialChangeKey]
    );
    openFindingId = findingResult.rows[0]!.id;
  });

  it('generates a stable material key for the same semantic Week state', () => {
    const canonicalContext = createWeekContext(
      'canonical',
      'Blocked by Vendor Response.',
      'FleetGraph Week',
      staticWeekContextScope
    );
    const noisyContext = createWeekContext(
      'permuted',
      ' blocked   by vendor response. ',
      'Renamed Week',
      staticWeekContextScope
    );

    const materialChangeKey = generateMaterialChangeKey(canonicalContext);

    expect(materialChangeKey).toMatch(/^v1:[a-f0-9]{64}$/);
    expect(generateMaterialChangeKey(noisyContext)).toBe(materialChangeKey);
  });

  it('changes the material key when blocker evidence changes', () => {
    const currentContext = createWeekContext(
      'canonical',
      'Blocked by Vendor Response.',
      'FleetGraph Week',
      staticWeekContextScope
    );
    const changedContext = createWeekContext(
      'canonical',
      'Blocked by security review.',
      'FleetGraph Week',
      staticWeekContextScope
    );

    expect(generateMaterialChangeKey(changedContext)).not.toBe(generateMaterialChangeKey(currentContext));
  });

  it('suppresses an unchanged open finding and bypasses suppression for a changed material key', async () => {
    await expect(checkSuppression(pool, workspaceId, weekId, openMaterialChangeKey)).resolves.toMatchObject({
      suppressed: true,
      reason: 'suppressed_open_finding',
      findingId: openFindingId,
      suppressionId: null,
      suppressionType: null,
      expiresAt: null,
      materialChangeKey: openMaterialChangeKey,
    });

    await expect(checkSuppression(pool, workspaceId, weekId, `v1:changed-${testRunId}`)).resolves.toEqual({
      suppressed: false,
      reason: 'not_suppressed',
      findingId: null,
      suppressionId: null,
      suppressionType: null,
      expiresAt: null,
      materialChangeKey: `v1:changed-${testRunId}`,
    });
  });

  it('honors suppression expiry windows for dismissals and snoozes', async () => {
    const dismissedKey = `v1:dismissed-${testRunId}`;
    const snoozedKey = `v1:snoozed-${testRunId}`;
    const expiredKey = `v1:expired-${testRunId}`;
    const dismissedFindingId = await insertFinding(workspaceId, weekId, ownerUserId, dismissedKey, 'dismissed');
    const snoozedFindingId = await insertFinding(workspaceId, weekId, ownerUserId, snoozedKey, 'snoozed');
    const expiredFindingId = await insertFinding(workspaceId, weekId, ownerUserId, expiredKey, 'dismissed');
    const dismissedSuppression = await insertSuppression(dismissedFindingId, 'dismissed', '1 hour');
    const snoozedSuppression = await insertSuppression(snoozedFindingId, 'snoozed', '1 hour');
    await insertSuppression(expiredFindingId, 'dismissed', '-1 hour');

    await expect(checkSuppression(pool, workspaceId, weekId, dismissedKey)).resolves.toMatchObject({
      suppressed: true,
      reason: 'suppressed_dismissed',
      findingId: dismissedFindingId,
      suppressionId: dismissedSuppression.id,
      suppressionType: 'dismissed',
      expiresAt: dismissedSuppression.expires_at,
      materialChangeKey: dismissedKey,
    });

    await expect(checkSuppression(pool, workspaceId, weekId, snoozedKey)).resolves.toMatchObject({
      suppressed: true,
      reason: 'suppressed_snoozed',
      findingId: snoozedFindingId,
      suppressionId: snoozedSuppression.id,
      suppressionType: 'snoozed',
      expiresAt: snoozedSuppression.expires_at,
      materialChangeKey: snoozedKey,
    });

    await expect(checkSuppression(pool, workspaceId, weekId, expiredKey)).resolves.toEqual({
      suppressed: false,
      reason: 'not_suppressed',
      findingId: null,
      suppressionId: null,
      suppressionType: null,
      expiresAt: null,
      materialChangeKey: expiredKey,
    });
  });

  it('combines material change and suppression into detector decisions', async () => {
    const scopedContext = createWeekContext(
      'canonical',
      'Blocked by procurement review.',
      'FleetGraph Guard Week',
      {
        workspaceId,
        weekId,
        ownerUserId,
        projectId: null,
        programId: null,
      }
    );
    const runnableKey = generateMaterialChangeKey(scopedContext);

    await expect(shouldRunDetector(pool, workspaceId, weekId, scopedContext)).resolves.toEqual({
      shouldRun: true,
      reason: `run_material_changed_no_suppression:${runnableKey}`,
      materialChangeKey: runnableKey,
    });

    const suppressedContext = createWeekContext(
      'canonical',
      'Blocked by procurement escalation.',
      'FleetGraph Guard Week',
      {
        workspaceId,
        weekId,
        ownerUserId,
        projectId: null,
        programId: null,
      }
    );
    const suppressedKey = generateMaterialChangeKey(suppressedContext);
    const suppressedFindingId = await insertFinding(workspaceId, weekId, ownerUserId, suppressedKey, 'open');

    await expect(shouldRunDetector(pool, workspaceId, weekId, suppressedContext)).resolves.toEqual({
      shouldRun: false,
      reason: `suppressed_open_finding:${suppressedFindingId}:${suppressedKey}`,
      materialChangeKey: suppressedKey,
    });
  });

  it('serializes scope processing with advisory locks and explicit release', async () => {
    const firstClient = await pool.connect();
    const secondClient = await pool.connect();
    const lockKey = deriveAdvisoryLockKey(workspaceId, weekId);

    try {
      await expect(acquireAdvisoryLock(firstClient, workspaceId, weekId)).resolves.toEqual({
        acquired: true,
        lockKey,
      });

      await expect(acquireAdvisoryLock(secondClient, workspaceId, weekId)).resolves.toEqual({
        acquired: false,
        lockKey,
      });

      await expect(releaseAdvisoryLock(firstClient, workspaceId, weekId)).resolves.toBe(true);
      await expect(acquireAdvisoryLock(secondClient, workspaceId, weekId)).resolves.toEqual({
        acquired: true,
        lockKey,
      });
      await expect(releaseAdvisoryLock(secondClient, workspaceId, weekId)).resolves.toBe(true);
    } finally {
      await firstClient.query('SELECT pg_advisory_unlock_all()');
      await secondClient.query('SELECT pg_advisory_unlock_all()');
      firstClient.release();
      secondClient.release();
    }
  });
});

async function insertFinding(
  workspaceId: string,
  weekId: string,
  ownerUserId: string,
  materialChangeKey: string,
  lifecycleState: string
): Promise<string> {
  const result = await pool.query<IdRow>(
    `INSERT INTO fleetgraph_findings (
       workspace_id, scoped_document_id, detector_type, severity, evidence,
       recipient_user_id, lifecycle_state, material_change_key
     )
     VALUES (
       $1, $2, 'at_risk_week', 'medium',
       '[{"sourceType":"issue","quote":"Suppressed finding."}]'::jsonb,
       $3, $4, $5
     )
     RETURNING id`,
    [workspaceId, weekId, ownerUserId, lifecycleState, materialChangeKey]
  );

  return result.rows[0]!.id;
}

async function insertSuppression(
  findingId: string,
  suppressionType: 'dismissed' | 'snoozed',
  expiryOffset: string
): Promise<SuppressionInsertRow> {
  const result = await pool.query<SuppressionInsertRow>(
    `INSERT INTO fleetgraph_suppressions (finding_id, suppression_type, reason, expires_at)
     VALUES ($1, $2, 'User chose to quiet this finding', NOW() + $3::interval)
     RETURNING id, expires_at`,
    [findingId, suppressionType, expiryOffset]
  );

  return result.rows[0]!;
}

function createWeekContext(
  order: 'canonical' | 'permuted',
  blockerText: string,
  weekTitle: string,
  scope: WeekContextScope
): WeekContext {
  const issues = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      workspaceId: scope.workspaceId,
      documentType: 'issue' as const,
      title: 'Blocked API integration',
      content: {},
      parentId: null,
      properties: { state: 'in_progress', priority: 'high', assignee_id: scope.ownerUserId },
      ticketNumber: 101,
      createdAt: new Date('2026-05-20T10:00:00.000Z'),
      updatedAt: new Date('2026-05-21T10:00:00.000Z'),
      state: 'in_progress',
      priority: 'high',
      assigneeUserId: scope.ownerUserId,
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      workspaceId: scope.workspaceId,
      documentType: 'issue' as const,
      title: 'Ready UI polish',
      content: {},
      parentId: null,
      properties: { state: 'todo', priority: 'medium' },
      ticketNumber: 102,
      createdAt: new Date('2026-05-20T11:00:00.000Z'),
      updatedAt: new Date('2026-05-21T11:00:00.000Z'),
      state: 'todo',
      priority: 'medium',
      assigneeUserId: null,
    },
  ];

  const standups = [
    {
      id: '40000000-0000-4000-8000-000000000001',
      workspaceId: scope.workspaceId,
      documentType: 'standup' as const,
      title: 'Monday standup',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: blockerText }] }],
      },
      parentId: scope.weekId,
      properties: { author_id: scope.ownerUserId },
      ticketNumber: null,
      createdAt: new Date('2026-05-25T15:00:00.000Z'),
      updatedAt: new Date('2026-05-25T15:30:00.000Z'),
      authorUserId: scope.ownerUserId,
    },
    {
      id: '40000000-0000-4000-8000-000000000002',
      workspaceId: scope.workspaceId,
      documentType: 'standup' as const,
      title: 'Tuesday standup',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No new blockers.' }] }],
      },
      parentId: scope.weekId,
      properties: { author_id: scope.ownerUserId },
      ticketNumber: null,
      createdAt: new Date('2026-05-26T15:00:00.000Z'),
      updatedAt: new Date('2026-05-26T15:30:00.000Z'),
      authorUserId: scope.ownerUserId,
    },
  ];

  const sprintIterations = [
    {
      id: '60000000-0000-4000-8000-000000000001',
      sprintId: scope.weekId,
      workspaceId: scope.workspaceId,
      storyId: 'FG-1',
      storyTitle: 'Build guard rails',
      status: 'fail',
      whatAttempted: 'Wired context',
      blockersEncountered: blockerText,
      authorUserId: scope.ownerUserId,
      createdAt: new Date('2026-05-25T20:00:00.000Z'),
      updatedAt: new Date('2026-05-25T20:15:00.000Z'),
    },
  ];

  return {
    week: {
      id: scope.weekId,
      workspaceId: scope.workspaceId,
      documentType: 'sprint',
      title: weekTitle,
      content: {},
      parentId: null,
      properties: { owner_id: scope.ownerUserId },
      ticketNumber: null,
      createdAt: new Date('2026-05-20T09:00:00.000Z'),
      updatedAt: new Date('2026-05-26T09:00:00.000Z'),
    },
    ownerUserId: scope.ownerUserId,
    projectId: scope.projectId,
    programId: scope.programId,
    issues: order === 'canonical' ? issues : [...issues].reverse(),
    standups: order === 'canonical' ? standups : [...standups].reverse(),
    sprintIterations: order === 'canonical' ? sprintIterations : [...sprintIterations].reverse(),
    accountability: {
      weeklyPlan: { exists: true, documentIds: ['90000000-0000-4000-8000-000000000001'] },
      weeklyRetro: { exists: false, documentIds: [] },
    },
  };
}
