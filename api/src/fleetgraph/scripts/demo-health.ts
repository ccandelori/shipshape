import { pathToFileURL } from 'url';
import { pool } from '../../db/client.js';
import { shipCoreDemoIssueTitles } from '../../db/shipCoreDemoIssues.js';

type DemoHealthStatus = 'pass' | 'warn' | 'fail';
type DemoHealthMode = 'health' | 'reset';

export interface DemoHealthLink {
  label: string;
  url: string;
}

export interface DemoHealthCheck {
  status: DemoHealthStatus;
  name: string;
  detail: string;
}

export interface DemoHealthReport {
  mode: DemoHealthMode;
  resetActions: string[];
  demoLinks: DemoHealthLink[];
  checks: DemoHealthCheck[];
}

interface DemoHealthArgs {
  reset: boolean;
  appUrl: string | null;
}

interface TableAvailabilityRow {
  users_table: string | null;
  workspaces_table: string | null;
  documents_table: string | null;
  comments_table: string | null;
  findings_table: string | null;
  action_candidates_table: string | null;
  usage_table: string | null;
  finding_reads_table: string | null;
}

interface DemoUserRow {
  id: string;
  last_workspace_id: string | null;
}

interface DemoWorkspaceRow {
  id: string;
}

interface DemoDocumentRow {
  id: string;
  document_type: string;
  title: string;
}

interface DemoWeekOverviewRow {
  id: string;
  title: string;
  content_node_count: number;
}

interface DemoFindingRow {
  id: string;
  material_change_key: string;
  lifecycle_state: string;
  scoped_document_id: string;
  action_candidate_id: string | null;
  target_document_id: string | null;
}

interface DemoCountRow {
  count: string;
}

interface ResetActionRow {
  action: string;
  count: string;
}

const openFindingKey = 'seed:fleetgraph:open:inbox-visible:v1';
const pendingFindingKey = 'seed:fleetgraph:pending-review:trace-evidence:v1';
const demoFindingKeys = [openFindingKey, pendingFindingKey] as const;
const demoCommentBody = 'Please add the shared Langfuse trace URLs or note the credential blocker before the next FleetGraph review.';
const requiredDocumentTitles = [
  'FleetGraph - HITL Findings Inbox',
  'FleetGraph - Embedded Agent Chat',
  'FleetGraph - Trace Evidence Pipeline',
  'Capture Langfuse trace URLs for shared review',
  ...shipCoreDemoIssueTitles,
] as const;

export function parseDemoHealthArgs(args: string[]): DemoHealthArgs {
  let reset = false;
  let appUrl: string | null = null;
  let index = 0;

  while (index < args.length) {
    const arg = args[index]!;

    if (arg === '--') {
      index += 1;
      continue;
    }

    if (arg === '--reset') {
      if (reset) {
        throw new Error('FleetGraph demo health argument --reset was provided more than once');
      }
      reset = true;
      index += 1;
      continue;
    }

    if (arg === '--app-url') {
      const rawUrl = args[index + 1];
      if (!rawUrl) {
        throw new Error('FleetGraph demo health argument --app-url requires a URL value');
      }
      appUrl = normalizeAppUrl(rawUrl);
      index += 2;
      continue;
    }

    if (arg.startsWith('--app-url=')) {
      appUrl = normalizeAppUrl(arg.slice('--app-url='.length));
      index += 1;
      continue;
    }

    throw new Error(`Unknown FleetGraph demo health argument: ${arg}`);
  }

  return { reset, appUrl };
}

export function createDemoHealthExitCode(checks: readonly DemoHealthCheck[]): number {
  return checks.some((check) => check.status === 'fail') ? 1 : 0;
}

export function formatDemoHealthReport(report: DemoHealthReport): string {
  const lines = [
    report.mode === 'reset' ? 'FleetGraph demo reset' : 'FleetGraph demo health',
    '',
    ...report.checks.map((check) => `[${check.status.toUpperCase()}] ${check.name} - ${check.detail}`),
  ];

  lines.push('', 'Demo accounts:', '- Dev User: dev@ship.local / admin123', '- Henry Patel: henry.patel@ship.local / admin123');

  if (report.demoLinks.length > 0) {
    lines.push('', 'Demo links:', ...report.demoLinks.map((link) => `- ${link.label}: ${link.url}`));
  }

  if (report.resetActions.length > 0) {
    lines.push('', 'Reset actions:', ...report.resetActions.map((action) => `- ${action}`));
  }

  return lines.join('\n');
}

async function createDemoHealthReport(args: DemoHealthArgs): Promise<DemoHealthReport> {
  const demoLinks: DemoHealthLink[] = [];
  const checks: DemoHealthCheck[] = [
    ...createEnvironmentChecks(process.env),
  ];
  if (args.appUrl) {
    checks.push(await checkAppHealth(args.appUrl));
    checks.push(createAppDatabasePairingCheck(process.env, args.appUrl));
    demoLinks.push(createDemoLink('App', args.appUrl));
  }

  const tableReport = await checkRequiredTables();
  checks.push(...tableReport.checks);

  const resetActions = args.reset && tableReport.ready
    ? await resetFleetGraphDemoState()
    : [];

  if (args.reset && !tableReport.ready) {
    checks.push({
      status: 'fail',
      name: 'Demo reset',
      detail: 'Required FleetGraph tables are missing; run database migrations before reset.',
    });
  }

  if (tableReport.ready) {
    const seedReport = await checkSeededDemoState();
    checks.push(...seedReport.checks);

    if (args.appUrl && seedReport.workspaceId) {
      demoLinks.push(...await createDemoDocumentLinks(args.appUrl, seedReport.workspaceId));
    }
  }

  return {
    mode: args.reset ? 'reset' : 'health',
    resetActions,
    demoLinks,
    checks,
  };
}

function normalizeAppUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();

  if (trimmed.length === 0) {
    throw new Error('FleetGraph demo health argument --app-url cannot be empty');
  }

  const parsed = new URL(trimmed);
  return parsed.toString().replace(/\/+$/, '');
}

function createEnvironmentChecks(env: NodeJS.ProcessEnv): DemoHealthCheck[] {
  return [
    createEnvironmentCheck(env, 'DATABASE_URL', 'Database URL'),
    createEnvironmentCheck(env, 'OPENAI_API_KEY', 'OpenAI key'),
    createEnvironmentCheck(env, 'LANGFUSE_PUBLIC_KEY', 'Langfuse public key'),
    createEnvironmentCheck(env, 'LANGFUSE_SECRET_KEY', 'Langfuse secret key'),
    createEnvironmentCheck(env, 'LANGFUSE_BASE_URL', 'Langfuse base URL'),
  ];
}

function createEnvironmentCheck(
  env: NodeJS.ProcessEnv,
  key: string,
  name: string
): DemoHealthCheck {
  const value = env[key];

  if (value && value.trim().length > 0) {
    return {
      status: 'pass',
      name,
      detail: `${key} is set`,
    };
  }

  return {
    status: key === 'DATABASE_URL' ? 'fail' : 'warn',
    name,
    detail: `${key} is not set`,
  };
}

export function createAppDatabasePairingCheck(
  env: NodeJS.ProcessEnv,
  appUrl: string
): DemoHealthCheck {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    return {
      status: 'fail',
      name: 'App and database pairing',
      detail: 'DATABASE_URL is missing; document links cannot be trusted.',
    };
  }

  const databaseHost = new URL(databaseUrl).hostname;
  const appHost = new URL(appUrl).hostname;
  const databaseIsLocal = isLocalHost(databaseHost);
  const appIsLocal = isLocalHost(appHost);
  const productionServerWithLocalDatabase = env.NODE_ENV === 'production' && databaseIsLocal && !appIsLocal;

  if (productionServerWithLocalDatabase) {
    return {
      status: 'pass',
      name: 'App and database pairing',
      detail: `DATABASE_URL host ${databaseHost} is local to the production app host ${appHost}`,
    };
  }

  if (databaseIsLocal !== appIsLocal) {
    return {
      status: 'fail',
      name: 'App and database pairing',
      detail: `DATABASE_URL host ${databaseHost} and app host ${appHost} appear to be different environments; document links use database IDs and may not exist in that app.`,
    };
  }

  return {
    status: 'pass',
    name: 'App and database pairing',
    detail: `DATABASE_URL host ${databaseHost} matches app host class ${appIsLocal ? 'local' : 'remote'}`,
  };
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

async function checkRequiredTables(): Promise<{
  checks: DemoHealthCheck[];
  ready: boolean;
}> {
  const result = await pool.query<TableAvailabilityRow>(
    `SELECT
       to_regclass('public.users')::text AS users_table,
       to_regclass('public.workspaces')::text AS workspaces_table,
       to_regclass('public.documents')::text AS documents_table,
       to_regclass('public.comments')::text AS comments_table,
       to_regclass('public.fleetgraph_findings')::text AS findings_table,
       to_regclass('public.fleetgraph_action_candidates')::text AS action_candidates_table,
       to_regclass('public.fleetgraph_usage')::text AS usage_table,
       to_regclass('public.fleetgraph_finding_reads')::text AS finding_reads_table`
  );
  const row = result.rows[0]!;
  const missing = Object.entries(row)
    .filter((entry) => entry[1] === null)
    .map((entry) => entry[0].replace('_table', ''));

  if (missing.length === 0) {
    return {
      ready: true,
      checks: [{
        status: 'pass',
        name: 'Database tables',
        detail: 'Core Ship and FleetGraph tables are present',
      }],
    };
  }

  return {
    ready: false,
    checks: [{
      status: 'fail',
      name: 'Database tables',
      detail: `Missing tables: ${missing.join(', ')}`,
    }],
  };
}

export async function checkAppHealth(appUrl: string): Promise<DemoHealthCheck> {
  const healthUrl = `${appUrl}/health`;

  try {
    const response = await fetchAppProbe(healthUrl, 'application/json');

    if (response.ok) {
      return {
        status: 'pass',
        name: 'App health',
        detail: `${healthUrl} returned HTTP ${response.status}`,
      };
    }

    if (response.status === 404) {
      const rootResponse = await fetchAppProbe(appUrl, 'text/html');

      if (rootResponse.ok) {
        return {
          status: 'pass',
          name: 'App health',
          detail: `${appUrl} returned HTTP ${rootResponse.status}; /health is not exposed on this app URL`,
        };
      }

      return {
        status: 'fail',
        name: 'App health',
        detail: `${healthUrl} returned HTTP ${response.status} and ${appUrl} returned HTTP ${rootResponse.status}`,
      };
    }

    return {
      status: 'fail',
      name: 'App health',
      detail: `${healthUrl} returned HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'fail',
      name: 'App health',
      detail: `${healthUrl} failed: ${message}`,
    };
  }
}

async function fetchAppProbe(url: string, accept: string): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(5_000),
    headers: {
      accept,
    },
  });
}

async function resetFleetGraphDemoState(): Promise<string[]> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const resetResult = await client.query<ResetActionRow>(
      `WITH demo_workspace AS (
         SELECT id
         FROM workspaces
         WHERE name = 'Ship Workspace'
         LIMIT 1
       ),
       demo_findings AS (
         SELECT id, material_change_key
         FROM fleetgraph_findings
         WHERE workspace_id IN (SELECT id FROM demo_workspace)
           AND material_change_key = ANY($1::text[])
       ),
       generated_findings AS (
         SELECT id
         FROM fleetgraph_findings
         WHERE workspace_id IN (SELECT id FROM demo_workspace)
           AND material_change_key <> ALL($1::text[])
       ),
       pending_finding AS (
         SELECT id
         FROM demo_findings
         WHERE material_change_key = $3
       ),
       pending_targets AS (
         SELECT target_document_id
         FROM fleetgraph_action_candidates
         WHERE finding_id IN (SELECT id FROM pending_finding)
       ),
       deleted_generated_findings AS (
         DELETE FROM fleetgraph_findings
         WHERE id IN (SELECT id FROM generated_findings)
         RETURNING id
       ),
       deleted_executions AS (
         DELETE FROM fleetgraph_action_executions
         WHERE finding_id IN (SELECT id FROM pending_finding)
         RETURNING id
       ),
       deleted_approvals AS (
         DELETE FROM fleetgraph_approvals
         WHERE finding_id IN (SELECT id FROM pending_finding)
         RETURNING id
       ),
       deleted_suppressions AS (
         DELETE FROM fleetgraph_suppressions
         WHERE finding_id IN (SELECT id FROM demo_findings)
         RETURNING id
       ),
       deleted_reads AS (
         DELETE FROM fleetgraph_finding_reads
         WHERE finding_id IN (SELECT id FROM demo_findings)
         RETURNING finding_id
       ),
       deleted_comments AS (
         DELETE FROM comments
         WHERE document_id IN (SELECT target_document_id FROM pending_targets)
           AND content = $4
         RETURNING id
       ),
       reset_open AS (
         UPDATE fleetgraph_findings
         SET lifecycle_state = 'open',
             expires_at = NULL
         WHERE material_change_key = $2
         RETURNING id
       ),
       reset_pending AS (
         UPDATE fleetgraph_findings
         SET lifecycle_state = 'pending_review',
             expires_at = NULL
         WHERE material_change_key = $3
         RETURNING id
       )
       SELECT 'approval rows cleared' AS action, COUNT(*)::text AS count FROM deleted_approvals
       UNION ALL
       SELECT 'execution rows cleared' AS action, COUNT(*)::text AS count FROM deleted_executions
       UNION ALL
       SELECT 'generated findings cleared' AS action, COUNT(*)::text AS count FROM deleted_generated_findings
       UNION ALL
       SELECT 'suppression rows cleared' AS action, COUNT(*)::text AS count FROM deleted_suppressions
       UNION ALL
       SELECT 'read receipts cleared' AS action, COUNT(*)::text AS count FROM deleted_reads
       UNION ALL
       SELECT 'demo comments cleared' AS action, COUNT(*)::text AS count FROM deleted_comments
       UNION ALL
       SELECT 'open finding restored' AS action, COUNT(*)::text AS count FROM reset_open
       UNION ALL
       SELECT 'pending-review finding restored' AS action, COUNT(*)::text AS count FROM reset_pending`,
      [demoFindingKeys, openFindingKey, pendingFindingKey, demoCommentBody]
    );
    await client.query('COMMIT');

    return resetResult.rows.map((row) => `${row.action}: ${row.count}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function checkSeededDemoState(): Promise<{
  checks: DemoHealthCheck[];
  workspaceId: string | null;
}> {
  const checks: DemoHealthCheck[] = [];
  const workspace = await loadDemoWorkspace();

  if (!workspace) {
    return {
      workspaceId: null,
      checks: [{
        status: 'fail',
        name: 'Demo workspace',
        detail: 'Ship Workspace is missing; run pnpm --filter api db:seed.',
      }],
    };
  }

  checks.push({
    status: 'pass',
    name: 'Demo workspace',
    detail: 'Ship Workspace exists',
  });
  checks.push(await checkDemoUser(workspace.id));
  checks.push(...await checkDemoDocuments(workspace.id));
  checks.push(await checkDemoWeekOverviewContent(workspace.id));
  checks.push(...await checkDemoFindings(workspace.id));
  checks.push(await checkUsageEvidence(workspace.id));

  return {
    workspaceId: workspace.id,
    checks,
  };
}

async function createDemoDocumentLinks(appUrl: string, workspaceId: string): Promise<DemoHealthLink[]> {
  const result = await pool.query<DemoFindingRow>(
    `SELECT
       finding.id,
       finding.material_change_key,
       finding.lifecycle_state,
       finding.scoped_document_id,
       action_candidate.id AS action_candidate_id,
       action_candidate.target_document_id
     FROM fleetgraph_findings finding
     LEFT JOIN fleetgraph_action_candidates action_candidate
       ON action_candidate.finding_id = finding.id
     WHERE finding.workspace_id = $1
       AND finding.material_change_key = $2`,
    [workspaceId, pendingFindingKey]
  );
  const finding = result.rows[0];

  if (!finding) {
    return [];
  }

  const meatyIssues = await pool.query<DemoDocumentRow>(
    `SELECT id, document_type, title
     FROM documents
     WHERE workspace_id = $1
       AND document_type = 'issue'
       AND title = ANY($2::text[])
     ORDER BY array_position($2::text[], title)`,
    [workspaceId, shipCoreDemoIssueTitles]
  );

  return [
    createDemoLink('Week chat document', createDocumentUrl(appUrl, finding.scoped_document_id)),
    ...(finding.target_document_id
      ? [createDemoLink('Issue with FleetGraph comment', createDocumentUrl(appUrl, finding.target_document_id))]
      : []),
    ...meatyIssues.rows.map((issue) => createDemoLink(
      `Meaty issue for chat: ${issue.title}`,
      createDocumentUrl(appUrl, issue.id)
    )),
  ];
}

function createDocumentUrl(appUrl: string, documentId: string): string {
  return `${appUrl}/documents/${documentId}`;
}

function createDemoLink(label: string, url: string): DemoHealthLink {
  return {
    label,
    url,
  };
}

async function loadDemoWorkspace(): Promise<DemoWorkspaceRow | null> {
  const result = await pool.query<DemoWorkspaceRow>(
    `SELECT id
     FROM workspaces
     WHERE name = 'Ship Workspace'
     LIMIT 1`
  );

  return result.rows[0] ?? null;
}

async function checkDemoUser(workspaceId: string): Promise<DemoHealthCheck> {
  const result = await pool.query<DemoUserRow>(
    `SELECT id, last_workspace_id
     FROM users
     WHERE email = 'dev@ship.local'
     LIMIT 1`
  );
  const user = result.rows[0];

  if (!user) {
    return {
      status: 'fail',
      name: 'Demo login',
      detail: 'dev@ship.local is missing; run pnpm --filter api db:seed.',
    };
  }

  if (user.last_workspace_id !== workspaceId) {
    return {
      status: 'warn',
      name: 'Demo login',
      detail: 'dev@ship.local exists but last_workspace_id does not point at Ship Workspace.',
    };
  }

  return {
    status: 'pass',
    name: 'Demo login',
    detail: 'dev@ship.local is present for Ship Workspace',
  };
}

async function checkDemoDocuments(workspaceId: string): Promise<DemoHealthCheck[]> {
  const result = await pool.query<DemoDocumentRow>(
    `SELECT id, document_type, title
     FROM documents
     WHERE workspace_id = $1
       AND title = ANY($2::text[])`,
    [workspaceId, requiredDocumentTitles]
  );
  const foundTitles = new Set(result.rows.map((row) => row.title));
  const missingTitles = requiredDocumentTitles.filter((title) => !foundTitles.has(title));

  if (missingTitles.length === 0) {
    return [{
      status: 'pass',
      name: 'Demo documents',
      detail: 'FleetGraph projects, trace issue, and meaty chat issues are present',
    }];
  }

  return [{
    status: 'fail',
    name: 'Demo documents',
    detail: `Missing documents: ${missingTitles.join(', ')}`,
  }];
}

async function checkDemoWeekOverviewContent(workspaceId: string): Promise<DemoHealthCheck> {
  const result = await pool.query<DemoWeekOverviewRow>(
    `SELECT
       doc.id,
       doc.title,
       CASE
         WHEN jsonb_typeof(doc.content) = 'object'
          AND jsonb_typeof(doc.content->'content') = 'array'
         THEN jsonb_array_length(doc.content->'content')
         ELSE 0
       END AS content_node_count
     FROM fleetgraph_findings finding
     INNER JOIN documents doc
       ON doc.id = finding.scoped_document_id
     WHERE finding.workspace_id = $1
       AND finding.material_change_key = $2
     LIMIT 1`,
    [workspaceId, pendingFindingKey]
  );
  const row = result.rows[0];

  if (!row) {
    return {
      status: 'fail',
      name: 'Week overview content',
      detail: 'Pending-review FleetGraph Week document is missing; run pnpm --filter api db:seed.',
    };
  }

  if (row.content_node_count <= 0) {
    return {
      status: 'fail',
      name: 'Week overview content',
      detail: `${row.title} has an empty Overview body; run migrations and seed before recording.`,
    };
  }

  return {
    status: 'pass',
    name: 'Week overview content',
    detail: `${row.title} has ${row.content_node_count} Overview body nodes for chat context`,
  };
}

async function checkDemoFindings(workspaceId: string): Promise<DemoHealthCheck[]> {
  const result = await pool.query<DemoFindingRow>(
    `SELECT
       finding.id,
       finding.material_change_key,
       finding.lifecycle_state,
       finding.scoped_document_id,
       action_candidate.id AS action_candidate_id,
       action_candidate.target_document_id
     FROM fleetgraph_findings finding
     LEFT JOIN fleetgraph_action_candidates action_candidate
       ON action_candidate.finding_id = finding.id
     WHERE finding.workspace_id = $1
       AND finding.material_change_key = ANY($2::text[])`,
    [workspaceId, demoFindingKeys]
  );
  const rowsByKey = new Map(result.rows.map((row) => [row.material_change_key, row]));
  const checks: DemoHealthCheck[] = [];

  checks.push(createFindingCheck(rowsByKey, openFindingKey, 'open', 'Open inbox finding'));
  checks.push(createFindingCheck(rowsByKey, pendingFindingKey, 'pending_review', 'Pending-review HITL finding'));

  const pendingFinding = rowsByKey.get(pendingFindingKey);
  if (pendingFinding?.action_candidate_id) {
    checks.push({
      status: 'pass',
      name: 'HITL action candidate',
      detail: 'Pending-review finding has a draft comment action candidate',
    });
  } else {
    checks.push({
      status: 'fail',
      name: 'HITL action candidate',
      detail: 'Pending-review finding has no action candidate; run pnpm --filter api db:seed.',
    });
  }

  return checks;
}

function createFindingCheck(
  rowsByKey: ReadonlyMap<string, DemoFindingRow>,
  materialChangeKey: string,
  expectedLifecycleState: string,
  name: string
): DemoHealthCheck {
  const finding = rowsByKey.get(materialChangeKey);

  if (!finding) {
    return {
      status: 'fail',
      name,
      detail: `Missing finding ${materialChangeKey}; run pnpm --filter api db:seed.`,
    };
  }

  if (finding.lifecycle_state !== expectedLifecycleState) {
    return {
      status: 'warn',
      name,
      detail: `Expected ${expectedLifecycleState}, found ${finding.lifecycle_state}; run this script with --reset before the demo.`,
    };
  }

  return {
    status: 'pass',
    name,
    detail: `${materialChangeKey} is ${expectedLifecycleState}`,
  };
}

async function checkUsageEvidence(workspaceId: string): Promise<DemoHealthCheck> {
  const result = await pool.query<DemoCountRow>(
    `SELECT COUNT(*)::text AS count
     FROM fleetgraph_usage
     WHERE workspace_id = $1
       AND run_id IN ('seed-fleetgraph-quiet-prefilter', 'seed-fleetgraph-pending-action')`,
    [workspaceId]
  );
  const count = Number.parseInt(result.rows[0]?.count ?? '0', 10);

  if (count >= 2) {
    return {
      status: 'pass',
      name: 'Seed trace evidence',
      detail: 'Quiet and finding usage seed rows are present',
    };
  }

  return {
    status: 'warn',
    name: 'Seed trace evidence',
    detail: 'Seed usage rows are incomplete; run pnpm --filter api db:seed if you need the local demo evidence rows.',
  };
}

async function main(): Promise<void> {
  try {
    const args = parseDemoHealthArgs(process.argv.slice(2));
    const report = await createDemoHealthReport(args);
    console.log(formatDemoHealthReport(report));
    process.exitCode = createDemoHealthExitCode(report.checks);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FleetGraph demo health failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
