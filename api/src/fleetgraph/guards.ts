import { createHash } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type { FleetGraphQueryClient, WeekContext } from './context.js';

const materialChangeKeyVersion = 'v1';
const advisoryLockSalt = 'fleetgraph-advisory-lock:v1';
const signedInt64Max = 9223372036854775807n;
const unsignedInt64Range = 18446744073709551616n;

export type SuppressionReason =
  | 'not_suppressed'
  | 'suppressed_open_finding'
  | 'suppressed_dismissed'
  | 'suppressed_snoozed';

export type UnsuppressedCheckResult = {
  suppressed: false;
  reason: 'not_suppressed';
  findingId: null;
  suppressionId: null;
  suppressionType: null;
  expiresAt: null;
  materialChangeKey: string;
};

export type OpenFindingSuppressionCheckResult = {
  suppressed: true;
  reason: 'suppressed_open_finding';
  findingId: string;
  suppressionId: null;
  suppressionType: null;
  expiresAt: null;
  materialChangeKey: string;
};

export type ActiveSuppressionCheckResult = {
  suppressed: true;
  reason: 'suppressed_dismissed' | 'suppressed_snoozed';
  findingId: string;
  suppressionId: string;
  suppressionType: 'dismissed' | 'snoozed';
  expiresAt: Date | null;
  materialChangeKey: string;
};

export type SuppressionCheckResult =
  | UnsuppressedCheckResult
  | OpenFindingSuppressionCheckResult
  | ActiveSuppressionCheckResult;

export type DetectorRunDecision = {
  shouldRun: boolean;
  reason: string;
  materialChangeKey: string;
};

export type AdvisoryLockResult = {
  acquired: boolean;
  lockKey: string;
};

type CanonicalWeekMaterial = {
  version: string;
  scope: {
    weekId: string;
    workspaceId: string;
    projectId: string | null;
    programId: string | null;
    ownerUserId: string | null;
  };
  issues: Array<{
    id: string;
    state: string | null;
    priority: string | null;
    assigneeUserId: string | null;
  }>;
  standups: Array<{
    id: string;
    createdAt: string;
    blockerText: string;
  }>;
  sprintIterations: Array<{
    id: string;
    storyId: string | null;
    status: string;
    blockersEncountered: string | null;
  }>;
  accountability: {
    weeklyPlan: {
      exists: boolean;
      documentIds: string[];
    };
    weeklyRetro: {
      exists: boolean;
      documentIds: string[];
    };
  };
};

type SuppressionRow = QueryResultRow & {
  finding_id: string;
  lifecycle_state: string;
  suppression_id: string | null;
  suppression_type: 'dismissed' | 'snoozed' | null;
  expires_at: Date | null;
};

type AdvisoryLockRow = QueryResultRow & {
  acquired: boolean;
};

type AdvisoryUnlockRow = QueryResultRow & {
  released: boolean;
};

export function generateMaterialChangeKey(context: WeekContext): string {
  const payload = canonicalizeWeekMaterial(context);
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  return `${materialChangeKeyVersion}:${digest}`;
}

export async function checkSuppression(
  client: FleetGraphQueryClient,
  workspaceId: string,
  scopedDocId: string,
  materialChangeKey: string
): Promise<SuppressionCheckResult> {
  const result = await client.query<SuppressionRow>(
    `SELECT f.id AS finding_id,
            f.lifecycle_state,
            s.id AS suppression_id,
            s.suppression_type,
            s.expires_at
     FROM fleetgraph_findings f
     LEFT JOIN fleetgraph_suppressions s ON s.finding_id = f.id
       AND (s.expires_at IS NULL OR s.expires_at > NOW())
     WHERE f.workspace_id = $1
       AND f.scoped_document_id = $2
       AND f.material_change_key = $3
       AND (
         f.lifecycle_state = 'open'
         OR s.id IS NOT NULL
       )
     ORDER BY
       CASE
         WHEN f.lifecycle_state = 'open' THEN 0
         WHEN s.suppression_type = 'snoozed' THEN 1
         WHEN s.suppression_type = 'dismissed' THEN 2
         ELSE 3
       END ASC,
       s.expires_at DESC NULLS FIRST,
       f.created_at DESC
     LIMIT 1`,
    [workspaceId, scopedDocId, materialChangeKey]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      suppressed: false,
      reason: 'not_suppressed',
      findingId: null,
      suppressionId: null,
      suppressionType: null,
      expiresAt: null,
      materialChangeKey,
    };
  }

  if (row.lifecycle_state === 'open') {
    return {
      suppressed: true,
      reason: 'suppressed_open_finding',
      findingId: row.finding_id,
      suppressionId: null,
      suppressionType: null,
      expiresAt: null,
      materialChangeKey,
    };
  }

  if (row.suppression_type === null || row.suppression_id === null) {
    throw new Error(
      `FleetGraph suppression row missing suppression data: workspaceId=${workspaceId}, scopedDocId=${scopedDocId}, materialChangeKey=${materialChangeKey}, findingId=${row.finding_id}`
    );
  }

  return {
    suppressed: true,
    reason: row.suppression_type === 'snoozed' ? 'suppressed_snoozed' : 'suppressed_dismissed',
    findingId: row.finding_id,
    suppressionId: row.suppression_id,
    suppressionType: row.suppression_type,
    expiresAt: row.expires_at,
    materialChangeKey,
  };
}

export async function shouldRunDetector(
  client: FleetGraphQueryClient,
  workspaceId: string,
  scopedDocId: string,
  context: WeekContext
): Promise<DetectorRunDecision> {
  const materialChangeKey = generateMaterialChangeKey(context);
  const suppression = await checkSuppression(client, workspaceId, scopedDocId, materialChangeKey);

  if (!suppression.suppressed) {
    return {
      shouldRun: true,
      reason: `run_material_changed_no_suppression:${materialChangeKey}`,
      materialChangeKey,
    };
  }

  return {
    shouldRun: false,
    reason: formatSuppressionReason(suppression),
    materialChangeKey,
  };
}

export function deriveAdvisoryLockKey(workspaceId: string, scopedId: string): string {
  const digest = createHash('sha256').update(`${advisoryLockSalt}:${workspaceId}:${scopedId}`).digest();
  const unsignedKey = digest.readBigUInt64BE(0);
  const signedKey = unsignedKey > signedInt64Max ? unsignedKey - unsignedInt64Range : unsignedKey;

  return signedKey.toString();
}

export async function acquireAdvisoryLock(
  client: FleetGraphQueryClient,
  workspaceId: string,
  scopedId: string
): Promise<AdvisoryLockResult> {
  const lockKey = deriveAdvisoryLockKey(workspaceId, scopedId);
  const result = await client.query<AdvisoryLockRow>(
    `SELECT pg_try_advisory_lock($1::bigint) AS acquired`,
    [lockKey]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`FleetGraph advisory lock query returned no row: workspaceId=${workspaceId}, scopedId=${scopedId}`);
  }

  return {
    acquired: row.acquired,
    lockKey,
  };
}

export async function releaseAdvisoryLock(
  client: FleetGraphQueryClient,
  workspaceId: string,
  scopedId: string
): Promise<boolean> {
  const lockKey = deriveAdvisoryLockKey(workspaceId, scopedId);
  const result = await client.query<AdvisoryUnlockRow>(
    `SELECT pg_advisory_unlock($1::bigint) AS released`,
    [lockKey]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`FleetGraph advisory unlock query returned no row: workspaceId=${workspaceId}, scopedId=${scopedId}`);
  }

  return row.released;
}

function canonicalizeWeekMaterial(context: WeekContext): CanonicalWeekMaterial {
  return {
    version: materialChangeKeyVersion,
    scope: {
      weekId: context.week.id,
      workspaceId: context.week.workspaceId,
      projectId: context.projectId,
      programId: context.programId,
      ownerUserId: context.ownerUserId,
    },
    issues: context.issues
      .map((issue) => ({
        id: issue.id,
        state: normalizeText(issue.state),
        priority: normalizeText(issue.priority),
        assigneeUserId: issue.assigneeUserId,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    standups: context.standups
      .map((standup) => ({
        id: standup.id,
        createdAt: normalizeDate(standup.createdAt),
        blockerText: extractNormalizedText(standup.content),
      }))
      .sort((left, right) => `${left.createdAt}:${left.id}`.localeCompare(`${right.createdAt}:${right.id}`)),
    sprintIterations: context.sprintIterations
      .map((iteration) => ({
        id: iteration.id,
        storyId: normalizeText(iteration.storyId),
        status: normalizeText(iteration.status) ?? '',
        blockersEncountered: normalizeText(iteration.blockersEncountered),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    accountability: {
      weeklyPlan: {
        exists: context.accountability.weeklyPlan.exists,
        documentIds: [...context.accountability.weeklyPlan.documentIds].sort(),
      },
      weeklyRetro: {
        exists: context.accountability.weeklyRetro.exists,
        documentIds: [...context.accountability.weeklyRetro.documentIds].sort(),
      },
    },
  };
}

function formatSuppressionReason(suppression: SuppressionCheckResult): string {
  if (suppression.reason === 'not_suppressed') {
    throw new Error(
      `Cannot format suppression reason for unsuppressed material key: materialChangeKey=${suppression.materialChangeKey}`
    );
  }

  if (suppression.reason === 'suppressed_open_finding') {
    return `suppressed_open_finding:${suppression.findingId}:${suppression.materialChangeKey}`;
  }

  const expiry = suppression.expiresAt ? suppression.expiresAt.toISOString() : 'indefinite';
  if (suppression.reason === 'suppressed_snoozed') {
    return `suppressed_snoozed_until:${expiry}:${suppression.suppressionId}:${suppression.materialChangeKey}`;
  }

  if (suppression.reason === 'suppressed_dismissed') {
    return `suppressed_dismissed_until:${expiry}:${suppression.suppressionId}:${suppression.materialChangeKey}`;
  }

  throw new Error(`Unsupported FleetGraph suppression reason: reason=${suppression.reason}`);
}

function normalizeDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function extractNormalizedText(value: unknown): string {
  const text = extractText(value);
  return normalizeText(text) ?? '';
}

function extractText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractText(item)).join(' ');
  }

  if (value !== null && typeof value === 'object') {
    return Object.values(value).map((item) => extractText(item)).join(' ');
  }

  return '';
}
