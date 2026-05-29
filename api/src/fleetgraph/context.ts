import type { DocumentType } from '@ship/shared';
import type { QueryResult, QueryResultRow } from 'pg';

export type FleetGraphQueryClient = {
  query: <T extends QueryResultRow>(queryText: string, values: unknown[]) => Promise<QueryResult<T>>;
};

export type ShipDocumentContext = {
  id: string;
  workspaceId: string;
  documentType: DocumentType;
  title: string;
  content: Record<string, unknown>;
  parentId: string | null;
  properties: Record<string, unknown>;
  ticketNumber: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IssueContext = ShipDocumentContext & {
  documentType: 'issue';
  state: string | null;
  priority: string | null;
  assigneeUserId: string | null;
};

export type StandupContext = ShipDocumentContext & {
  documentType: 'standup';
  authorUserId: string | null;
};

export type SprintIterationContext = {
  id: string;
  sprintId: string;
  workspaceId: string;
  storyId: string | null;
  storyTitle: string;
  status: string;
  whatAttempted: string | null;
  blockersEncountered: string | null;
  authorUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountabilityDocumentStatus = {
  exists: boolean;
  documentIds: string[];
};

export type WeekAccountabilityContext = {
  weeklyPlan: AccountabilityDocumentStatus;
  weeklyRetro: AccountabilityDocumentStatus;
};

export type WeekContext = {
  week: ShipDocumentContext & { documentType: 'sprint' };
  ownerUserId: string | null;
  projectId: string | null;
  programId: string | null;
  issues: IssueContext[];
  standups: StandupContext[];
  sprintIterations: SprintIterationContext[];
  accountability: WeekAccountabilityContext;
};

export type ProjectContext = {
  project: ShipDocumentContext & { documentType: 'project' };
  ownerUserId: string | null;
  programId: string | null;
  activeIssues: IssueContext[];
  weeks: Array<ShipDocumentContext & { documentType: 'sprint' }>;
};

export type IssueContextResult = {
  issue: IssueContext;
  assigneeUserId: string | null;
  parentIssueId: string | null;
  weekId: string | null;
  projectId: string | null;
  programId: string | null;
  blockerStandups: StandupContext[];
};

export type PriorFindingContext = {
  id: string;
  workspaceId: string;
  scopedDocumentId: string;
  detectorType: string;
  severity: string;
  evidence: unknown;
  recipientUserId: string | null;
  lifecycleState: string;
  materialChangeKey: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
};

export type FleetGraphPersonInfo = {
  name: string;
  email: string | null;
};

export type OwnershipContextType = 'week' | 'project' | 'issue';

type DocumentRow = {
  id: string;
  workspace_id: string;
  document_type: DocumentType;
  title: string;
  content: Record<string, unknown> | null;
  parent_id: string | null;
  properties: Record<string, unknown> | null;
  ticket_number: number | null;
  created_at: Date;
  updated_at: Date;
};

type AssociationRow = {
  relationship_type: 'program' | 'project' | 'sprint' | 'parent';
  related_id: string;
};

type SprintIterationRow = {
  id: string;
  sprint_id: string;
  workspace_id: string;
  story_id: string | null;
  story_title: string;
  status: string;
  what_attempted: string | null;
  blockers_encountered: string | null;
  author_id: string;
  created_at: Date;
  updated_at: Date;
};

type AccountabilityRow = {
  id: string;
};

type PriorFindingRow = {
  id: string;
  workspace_id: string;
  scoped_document_id: string;
  detector_type: string;
  severity: string;
  evidence: unknown;
  recipient_user_id: string | null;
  lifecycle_state: string;
  material_change_key: string;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
};

export class FleetGraphContextNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FleetGraphContextNotFoundError';
  }
}

export async function buildWeekContext(
  client: FleetGraphQueryClient,
  workspaceId: string,
  weekDocId: string
): Promise<WeekContext> {
  const week = await loadDocument(client, workspaceId, weekDocId, 'sprint');
  const associations = await loadProgramProjectAssociations(client, workspaceId, weekDocId);
  const issues = await loadWeekIssues(client, workspaceId, weekDocId);
  const standups = await loadRecentStandups(client, workspaceId, weekDocId);
  const sprintIterations = await loadSprintIterations(client, workspaceId, weekDocId);
  const accountability = await loadWeekAccountability(client, workspaceId, weekDocId);

  return {
    week: { ...week, documentType: 'sprint' },
    ownerUserId: firstStringProperty(week.properties, ['owner_id', 'assignee_id', 'assignee_ids']),
    projectId: associations.projectId,
    programId: associations.programId,
    issues,
    standups,
    sprintIterations,
    accountability,
  };
}

export async function buildProjectContext(
  client: FleetGraphQueryClient,
  workspaceId: string,
  projectDocId: string
): Promise<ProjectContext> {
  const project = await loadDocument(client, workspaceId, projectDocId, 'project');
  const associations = await loadProgramProjectAssociations(client, workspaceId, projectDocId);
  const activeIssues = await loadProjectActiveIssues(client, workspaceId, projectDocId);
  const weeks = await loadProjectWeeks(client, workspaceId, projectDocId);

  return {
    project: { ...project, documentType: 'project' },
    ownerUserId: stringProperty(project.properties, 'owner_id'),
    programId: associations.programId,
    activeIssues,
    weeks,
  };
}

export async function buildIssueContext(
  client: FleetGraphQueryClient,
  workspaceId: string,
  issueDocId: string
): Promise<IssueContextResult> {
  const issue = mapIssue(await loadDocument(client, workspaceId, issueDocId, 'issue'));
  const associations = await loadIssueAssociations(client, workspaceId, issueDocId);
  const blockerStandups = associations.weekId
    ? (await loadRecentStandups(client, workspaceId, associations.weekId)).filter((standup) => hasBlockerText(standup.content))
    : [];

  return {
    issue,
    assigneeUserId: issue.assigneeUserId,
    parentIssueId: associations.parentIssueId,
    weekId: associations.weekId,
    projectId: associations.projectId,
    programId: associations.programId,
    blockerStandups,
  };
}

export async function loadPriorFindings(
  client: FleetGraphQueryClient,
  workspaceId: string,
  scopedDocId: string
): Promise<PriorFindingContext[]> {
  const result = await client.query<PriorFindingRow>(
    `SELECT id, workspace_id, scoped_document_id, detector_type, severity, evidence,
            recipient_user_id, lifecycle_state, material_change_key, created_at, updated_at, expires_at
     FROM fleetgraph_findings
     WHERE workspace_id = $1
       AND scoped_document_id = $2
       AND created_at >= NOW() - INTERVAL '30 days'
     ORDER BY created_at DESC`,
    [workspaceId, scopedDocId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    scopedDocumentId: row.scoped_document_id,
    detectorType: row.detector_type,
    severity: row.severity,
    evidence: row.evidence,
    recipientUserId: row.recipient_user_id,
    lifecycleState: row.lifecycle_state,
    materialChangeKey: row.material_change_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  }));
}

export async function resolveOwnership(
  client: FleetGraphQueryClient,
  workspaceId: string,
  contextType: OwnershipContextType,
  contextId: string
): Promise<string | null> {
  if (contextType === 'week') {
    const week = await loadDocument(client, workspaceId, contextId, 'sprint');
    return firstStringProperty(week.properties, ['owner_id', 'assignee_id', 'assignee_ids']);
  }

  if (contextType === 'project') {
    const project = await loadDocument(client, workspaceId, contextId, 'project');
    return stringProperty(project.properties, 'owner_id');
  }

  const issueContext = await buildIssueContext(client, workspaceId, contextId);
  if (issueContext.assigneeUserId) {
    return issueContext.assigneeUserId;
  }

  if (issueContext.weekId) {
    const weekOwnerId = await resolveOwnership(client, workspaceId, 'week', issueContext.weekId);
    if (weekOwnerId) {
      return weekOwnerId;
    }
  }

  if (issueContext.projectId) {
    return resolveOwnership(client, workspaceId, 'project', issueContext.projectId);
  }

  return null;
}

async function loadDocument(
  client: FleetGraphQueryClient,
  workspaceId: string,
  documentId: string,
  documentType: DocumentType
): Promise<ShipDocumentContext> {
  const result = await client.query<DocumentRow>(
    `SELECT id, workspace_id, document_type::text as document_type, title, content, parent_id,
            properties, ticket_number, created_at, updated_at
     FROM documents
     WHERE workspace_id = $1
       AND id = $2
       AND document_type = $3
       AND deleted_at IS NULL`,
    [workspaceId, documentId, documentType]
  );

  const row = result.rows[0];
  if (!row) {
    throw new FleetGraphContextNotFoundError(
      `Document not found for FleetGraph context: workspaceId=${workspaceId}, documentId=${documentId}, documentType=${documentType}`
    );
  }

  return mapDocument(row);
}

async function loadProgramProjectAssociations(
  client: FleetGraphQueryClient,
  workspaceId: string,
  documentId: string
): Promise<{ programId: string | null; projectId: string | null }> {
  const result = await client.query<AssociationRow>(
    `SELECT da.relationship_type::text as relationship_type, da.related_id
     FROM document_associations da
     JOIN documents related ON related.id = da.related_id
       AND related.workspace_id = $1
     WHERE da.document_id = $2
       AND da.relationship_type IN ('program', 'project')
     ORDER BY da.relationship_type`,
    [workspaceId, documentId]
  );

  return result.rows.reduce(
    (accumulator, row) => ({
      programId: row.relationship_type === 'program' ? row.related_id : accumulator.programId,
      projectId: row.relationship_type === 'project' ? row.related_id : accumulator.projectId,
    }),
    { programId: null, projectId: null } as { programId: string | null; projectId: string | null }
  );
}

async function loadIssueAssociations(
  client: FleetGraphQueryClient,
  workspaceId: string,
  issueDocId: string
): Promise<{
  programId: string | null;
  projectId: string | null;
  weekId: string | null;
  parentIssueId: string | null;
}> {
  const result = await client.query<AssociationRow>(
    `SELECT da.relationship_type::text as relationship_type, da.related_id
     FROM document_associations da
     JOIN documents related ON related.id = da.related_id
       AND related.workspace_id = $1
     WHERE da.document_id = $2
       AND da.relationship_type IN ('program', 'project', 'sprint', 'parent')
     ORDER BY da.relationship_type`,
    [workspaceId, issueDocId]
  );

  return result.rows.reduce(
    (accumulator, row) => ({
      programId: row.relationship_type === 'program' ? row.related_id : accumulator.programId,
      projectId: row.relationship_type === 'project' ? row.related_id : accumulator.projectId,
      weekId: row.relationship_type === 'sprint' ? row.related_id : accumulator.weekId,
      parentIssueId: row.relationship_type === 'parent' ? row.related_id : accumulator.parentIssueId,
    }),
    {
      programId: null,
      projectId: null,
      weekId: null,
      parentIssueId: null,
    } as {
      programId: string | null;
      projectId: string | null;
      weekId: string | null;
      parentIssueId: string | null;
    }
  );
}

async function loadProjectActiveIssues(
  client: FleetGraphQueryClient,
  workspaceId: string,
  projectDocId: string
): Promise<IssueContext[]> {
  const result = await client.query<DocumentRow>(
    `SELECT d.id, d.workspace_id, d.document_type::text as document_type, d.title, d.content,
            d.parent_id, d.properties, d.ticket_number, d.created_at, d.updated_at
     FROM documents d
     JOIN document_associations da ON da.document_id = d.id
       AND da.related_id = $2
       AND da.relationship_type = 'project'
     WHERE d.workspace_id = $1
       AND d.document_type = 'issue'
       AND COALESCE(d.properties->>'state', '') NOT IN ('done', 'cancelled')
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
     ORDER BY d.created_at ASC`,
    [workspaceId, projectDocId]
  );

  return result.rows.map((row) => mapIssue(mapDocument(row)));
}

async function loadProjectWeeks(
  client: FleetGraphQueryClient,
  workspaceId: string,
  projectDocId: string
): Promise<Array<ShipDocumentContext & { documentType: 'sprint' }>> {
  const result = await client.query<DocumentRow>(
    `SELECT d.id, d.workspace_id, d.document_type::text as document_type, d.title, d.content,
            d.parent_id, d.properties, d.ticket_number, d.created_at, d.updated_at
     FROM documents d
     JOIN document_associations da ON da.document_id = d.id
       AND da.related_id = $2
       AND da.relationship_type = 'project'
     WHERE d.workspace_id = $1
       AND d.document_type = 'sprint'
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
     ORDER BY (d.properties->>'sprint_number')::int ASC, d.created_at ASC`,
    [workspaceId, projectDocId]
  );

  return result.rows.map((row) => ({ ...mapDocument(row), documentType: 'sprint' }));
}

async function loadWeekIssues(
  client: FleetGraphQueryClient,
  workspaceId: string,
  weekDocId: string
): Promise<IssueContext[]> {
  const result = await client.query<DocumentRow>(
    `SELECT d.id, d.workspace_id, d.document_type::text as document_type, d.title, d.content,
            d.parent_id, d.properties, d.ticket_number, d.created_at, d.updated_at
     FROM documents d
     JOIN document_associations da ON da.document_id = d.id
       AND da.related_id = $2
       AND da.relationship_type = 'sprint'
     WHERE d.workspace_id = $1
       AND d.document_type = 'issue'
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
     ORDER BY d.created_at ASC`,
    [workspaceId, weekDocId]
  );

  return result.rows.map((row) => {
    return mapIssue(mapDocument(row));
  });
}

async function loadRecentStandups(
  client: FleetGraphQueryClient,
  workspaceId: string,
  weekDocId: string
): Promise<StandupContext[]> {
  const result = await client.query<DocumentRow>(
    `SELECT id, workspace_id, document_type::text as document_type, title, content, parent_id,
            properties, ticket_number, created_at, updated_at
     FROM documents
     WHERE workspace_id = $1
       AND parent_id = $2
       AND document_type = 'standup'
       AND created_at >= NOW() - INTERVAL '7 days'
       AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [workspaceId, weekDocId]
  );

  return result.rows.map((row) => {
    const document = mapDocument(row);
    return {
      ...document,
      documentType: 'standup',
      authorUserId: stringProperty(document.properties, 'author_id'),
    };
  });
}

async function loadSprintIterations(
  client: FleetGraphQueryClient,
  workspaceId: string,
  weekDocId: string
): Promise<SprintIterationContext[]> {
  const result = await client.query<SprintIterationRow>(
    `SELECT id, sprint_id, workspace_id, story_id, story_title, status,
            what_attempted, blockers_encountered, author_id, created_at, updated_at
     FROM sprint_iterations
     WHERE workspace_id = $1
       AND sprint_id = $2
     ORDER BY created_at DESC`,
    [workspaceId, weekDocId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    sprintId: row.sprint_id,
    workspaceId: row.workspace_id,
    storyId: row.story_id,
    storyTitle: row.story_title,
    status: row.status,
    whatAttempted: row.what_attempted,
    blockersEncountered: row.blockers_encountered,
    authorUserId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function loadWeekAccountability(
  client: FleetGraphQueryClient,
  workspaceId: string,
  weekDocId: string
): Promise<WeekAccountabilityContext> {
  const weeklyPlan = await loadAccountabilityDocuments(client, workspaceId, weekDocId, 'weekly_plan');
  const weeklyRetro = await loadAccountabilityDocuments(client, workspaceId, weekDocId, 'weekly_retro');

  return {
    weeklyPlan,
    weeklyRetro,
  };
}

async function loadAccountabilityDocuments(
  client: FleetGraphQueryClient,
  workspaceId: string,
  weekDocId: string,
  documentType: 'weekly_plan' | 'weekly_retro'
): Promise<AccountabilityDocumentStatus> {
  const result = await client.query<AccountabilityRow>(
    `SELECT d.id
     FROM documents d
     WHERE d.workspace_id = $1
       AND d.document_type = $3
       AND d.deleted_at IS NULL
       AND (
         d.parent_id = $2
         OR EXISTS (
           SELECT 1
           FROM document_associations da
           WHERE da.document_id = d.id
             AND da.related_id = $2
             AND da.relationship_type = 'sprint'
         )
       )
     ORDER BY d.created_at DESC`,
    [workspaceId, weekDocId, documentType]
  );

  const documentIds = result.rows.map((row) => row.id);

  return {
    exists: documentIds.length > 0,
    documentIds,
  };
}

function mapDocument(row: DocumentRow): ShipDocumentContext {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    documentType: row.document_type,
    title: row.title,
    content: row.content ?? {},
    parentId: row.parent_id,
    properties: row.properties ?? {},
    ticketNumber: row.ticket_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapIssue(document: ShipDocumentContext): IssueContext {
  return {
    ...document,
    documentType: 'issue',
    state: stringProperty(document.properties, 'state'),
    priority: stringProperty(document.properties, 'priority'),
    assigneeUserId: stringProperty(document.properties, 'assignee_id'),
  };
}

function hasBlockerText(content: Record<string, unknown>): boolean {
  return extractText(content).toLowerCase().includes('block');
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

function firstStringProperty(properties: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (Array.isArray(value)) {
      const firstValue = value[0];
      if (typeof firstValue === 'string' && firstValue.length > 0) {
        return firstValue;
      }
    }
  }

  return null;
}

function stringProperty(properties: Record<string, unknown>, key: string): string | null {
  const value = properties[key];
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  return value;
}

export async function resolvePersonNames(
  client: FleetGraphQueryClient,
  userIds: readonly string[]
): Promise<Record<string, FleetGraphPersonInfo>> {
  const queryableUserIds = userIds.filter(isUuidString);
  if (queryableUserIds.length === 0) {
    return {};
  }

  const result = await client.query<{ id: string; name: string; email: string | null }>(
    `SELECT id::text AS id, name, email
     FROM users
     WHERE id = ANY($1::uuid[])`,
    [queryableUserIds]
  );

  const map: Record<string, FleetGraphPersonInfo> = {};
  for (const row of result.rows) {
    map[row.id] = {
      name: row.name,
      email: row.email,
    };
  }

  return map;
}

function isUuidString(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
