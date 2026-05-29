import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { QueryResultRow } from 'pg';
import { pool } from '../../db/client.js';
import {
  buildFleetGraphChatPrompt,
  buildFleetGraphChatSources,
  createFleetGraphChatTraceContext,
  createOpenAIFleetGraphChatModel,
  defaultFleetGraphChatContextBuilders,
  resolveFleetGraphChatScope,
  type FleetGraphChatDocumentType,
  type FleetGraphChatRequest,
  type FleetGraphChatSource,
  type FleetGraphChatUsage,
} from '../chat.js';
import { loadFleetGraphConfig, type FleetGraphConfig } from '../config.js';
import {
  createFleetGraphLangfuseTraceUrl,
  createFleetGraphPublicTracePolicy,
  publishFleetGraphTraceViaLangfuseIngestion,
  shutdownFleetGraphLangfuseTracing,
  startFleetGraphLangfuseTracing,
} from '../langfuse.js';
import { runFleetGraphGraph } from '../graph.js';
import {
  parseLangfuseObservationsResponse,
  type LangfuseObservationApiRow,
} from '../telemetry.js';

type CaptureChatTraceOptions = {
  documentId: string;
  documentType: FleetGraphChatDocumentType;
  userEmail: string;
  question: string;
  expectedName: string;
};

type ActorAndDocumentScope = {
  userId: string;
  workspaceId: string;
};

type CaptureChatTraceReport = {
  generatedAt: string;
  traceUrl: string;
  traceId: string;
  documentId: string;
  documentType: FleetGraphChatDocumentType;
  userEmail: string;
  question: string;
  expectedName: string;
  response: string;
  usage: FleetGraphChatUsage;
  sources: FleetGraphChatSource[];
  personNameVerified: boolean;
  tracePublic: boolean;
};

type UserDocumentScopeRow = QueryResultRow & {
  user_id: string;
  workspace_id: string;
};

type LangfuseTraceResponse = {
  id: string;
  public: boolean;
  output?: {
    response?: string;
  };
  metadata?: Record<string, unknown>;
};

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '../../../..');
const reportDir = path.join(repoRoot, 'docs/evals');
const reportJsonPath = path.join(reportDir, 'fleetgraph-chat-person-resolution.json');
const reportMarkdownPath = path.join(reportDir, 'fleetgraph-chat-person-resolution.md');

async function main(): Promise<void> {
  const options = parseCaptureChatTraceArgs(process.argv);
  const config = loadFleetGraphConfig();
  validateCaptureConfig(config);

  startFleetGraphLangfuseTracing(config);

  try {
    const actor = await resolveActorAndDocumentScope(options);
    const request: FleetGraphChatRequest = {
      documentId: options.documentId,
      documentType: options.documentType,
      question: options.question,
      conversationHistory: [],
    };
    const scope = await resolveFleetGraphChatScope(pool, actor.workspaceId, request);
    const prompt = await buildFleetGraphChatPrompt({
      client: pool,
      workspaceId: actor.workspaceId,
      request,
      contextBuilders: defaultFleetGraphChatContextBuilders,
    });
    const sources = buildFleetGraphChatSources(prompt.loadedContext);
    const traceContext = createFleetGraphChatTraceContext({
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      scope,
      request,
      publicTracePolicy: createFleetGraphPublicTracePolicy(config),
    });
    const startedAt = new Date();
    const graphState = await runFleetGraphGraph({
      mode: 'ondemand_chat',
      chat: {
        model: createOpenAIFleetGraphChatModel(config),
        messages: prompt.messages,
        abortSignal: new AbortController().signal,
        traceContext,
        onToken: () => undefined,
      },
    }, {});
    const completion = graphState.chat?.completion;

    if (completion === undefined) {
      throw new Error('FleetGraph chat trace capture completed without a chat completion');
    }

    await shutdownFleetGraphLangfuseTracing();
    await sleep(1_000);

    const traceObservation = await findCapturedChatObservation({
      config,
      sessionId: traceContext.sessionId,
      documentId: options.documentId,
      startedAt,
    });
    await ensureTracePublic({
      config,
      traceId: traceObservation.traceId,
      traceName: 'fleetgraph.chat.response',
    });
    const trace = await fetchLangfuseTraceWithRetry(config, traceObservation.traceId);
    const traceUrl = createFleetGraphLangfuseTraceUrl({
      baseUrl: config.langfuseBaseUrl,
      projectId: config.langfuseProjectId,
      traceId: traceObservation.traceId,
    });

    if (traceUrl === null) {
      throw new Error(`Captured chat trace is missing trace URL: traceId=${traceObservation.traceId}`);
    }

    const personNameVerified = completion.response.includes(options.expectedName);

    if (!personNameVerified) {
      throw new Error(
        `Captured chat response did not include expected name: expectedName=${options.expectedName}, response=${completion.response}`
      );
    }

    const report: CaptureChatTraceReport = {
      generatedAt: new Date().toISOString(),
      traceUrl,
      traceId: traceObservation.traceId,
      documentId: options.documentId,
      documentType: options.documentType,
      userEmail: options.userEmail,
      question: options.question,
      expectedName: options.expectedName,
      response: completion.response,
      usage: completion.usage,
      sources,
      personNameVerified,
      tracePublic: trace.public,
    };

    await mkdir(reportDir, { recursive: true });
    await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(reportMarkdownPath, `${formatCaptureChatTraceMarkdown(report)}\n`);

    console.log(`FleetGraph chat person-resolution trace: ${traceUrl}`);
    console.log(`Response: ${completion.response}`);
    console.log(`Report written to ${reportMarkdownPath}`);
  } finally {
    await shutdownFleetGraphLangfuseTracing();
    await pool.end();
  }
}

function parseCaptureChatTraceArgs(argv: string[]): CaptureChatTraceOptions {
  const args = argv.slice(2).filter((arg) => arg !== '--');
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];

    if (key === undefined || !key.startsWith('--')) {
      throw new Error(`Unexpected argument: ${key ?? ''}`);
    }

    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`);
    }

    values.set(key, value);
    index += 1;
  }

  return {
    documentId: requireCliValue(values, '--document-id'),
    documentType: parseDocumentType(requireCliValue(values, '--document-type')),
    userEmail: requireCliValue(values, '--user-email'),
    question: requireCliValue(values, '--question'),
    expectedName: requireCliValue(values, '--expected-name'),
  };
}

function validateCaptureConfig(config: FleetGraphConfig): void {
  if (!config.publicTraceExportEnabled) {
    throw new Error('Chat trace capture requires FLEETGRAPH_PUBLIC_TRACE_EXPORT=true');
  }

  if (config.langfuseProjectId === null) {
    throw new Error('Chat trace capture requires LANGFUSE_PROJECT_ID');
  }
}

async function resolveActorAndDocumentScope(
  options: CaptureChatTraceOptions
): Promise<ActorAndDocumentScope> {
  const result = await pool.query<UserDocumentScopeRow>(
    `SELECT u.id AS user_id, d.workspace_id
     FROM users u
     JOIN workspace_memberships wm ON wm.user_id = u.id
     JOIN documents d ON d.workspace_id = wm.workspace_id
     WHERE u.email = $1
       AND d.id = $2
       AND d.document_type = $3
       AND d.deleted_at IS NULL
     LIMIT 1`,
    [options.userEmail, options.documentId, options.documentType]
  );
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(
      `Could not resolve chat actor/document scope: userEmail=${options.userEmail}, documentId=${options.documentId}, documentType=${options.documentType}`
    );
  }

  return {
    userId: row.user_id,
    workspaceId: row.workspace_id,
  };
}

async function findCapturedChatObservation(input: {
  config: FleetGraphConfig;
  sessionId: string;
  documentId: string;
  startedAt: Date;
}): Promise<LangfuseObservationApiRow> {
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const matching = await findCapturedChatObservationOnce(input);

    if (matching !== null) {
      return matching;
    }

    await sleep(1_000);
  }

  throw new Error(
    `Could not find captured chat trace in Langfuse: sessionId=${input.sessionId}, documentId=${input.documentId}`
  );
}

async function findCapturedChatObservationOnce(input: {
  config: FleetGraphConfig;
  sessionId: string;
  documentId: string;
  startedAt: Date;
}): Promise<LangfuseObservationApiRow | null> {
  const url = new URL('/api/public/v2/observations', input.config.langfuseBaseUrl);
  url.searchParams.set('name', 'fleetgraph.chat.response');
  url.searchParams.set('fields', 'core,basic,metadata,usage,trace_context');
  url.searchParams.set('limit', '20');

  const response = await fetch(url, {
    headers: createLangfuseAuthHeaders(input.config),
  });
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Langfuse observations request failed: status=${response.status}, body=${raw}`);
  }

  const observations = parseLangfuseObservationsResponse(JSON.parse(raw));
  const matching = observations.find((observation) => (
    observation.sessionId === input.sessionId
    && observation.name === 'fleetgraph.chat.response'
    && observation.metadata?.documentId === input.documentId
    && observationStartedAfter(observation, input.startedAt)
  ));

  if (matching === undefined) {
    return null;
  }

  return matching;
}

function observationStartedAfter(
  observation: LangfuseObservationApiRow,
  startedAt: Date
): boolean {
  if (observation.startTime === undefined) {
    return false;
  }

  const observedAtMs = Date.parse(observation.startTime);

  return Number.isFinite(observedAtMs) && observedAtMs >= startedAt.getTime() - 1_000;
}

async function ensureTracePublic(input: {
  config: FleetGraphConfig;
  traceId: string;
  traceName: string;
}): Promise<void> {
  await publishFleetGraphTraceViaLangfuseIngestion({
    langfuseBaseUrl: input.config.langfuseBaseUrl,
    langfusePublicKey: input.config.langfusePublicKey,
    langfuseSecretKey: input.config.langfuseSecretKey,
    traceId: input.traceId,
    traceName: input.traceName,
    eventId: `fleetgraph-chat-person-trace-${input.traceId}`,
    timestamp: new Date().toISOString(),
    fetchClient: fetch,
  });
}

async function fetchLangfuseTrace(
  config: FleetGraphConfig,
  traceId: string
): Promise<LangfuseTraceResponse> {
  const url = new URL(`/api/public/traces/${encodeURIComponent(traceId)}`, config.langfuseBaseUrl);
  const response = await fetch(url, {
    headers: createLangfuseAuthHeaders(config),
  });
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Langfuse trace request failed: traceId=${traceId}, status=${response.status}, body=${raw}`);
  }

  return JSON.parse(raw) as LangfuseTraceResponse;
}

async function fetchLangfuseTraceWithRetry(
  config: FleetGraphConfig,
  traceId: string
): Promise<LangfuseTraceResponse> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      return await fetchLangfuseTrace(config, traceId);
    } catch (error) {
      lastError = error;
      await sleep(1_000);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`Langfuse trace request failed after retries: traceId=${traceId}`);
}

function formatCaptureChatTraceMarkdown(report: CaptureChatTraceReport): string {
  return [
    '# FleetGraph Chat Person Resolution Trace',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    `Trace: [${report.traceId}](${report.traceUrl})`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| Document | \`${report.documentType}:${report.documentId}\` |`,
    `| User | \`${report.userEmail}\` |`,
    `| Question | ${escapeMarkdownTableCell(report.question)} |`,
    `| Expected name | ${escapeMarkdownTableCell(report.expectedName)} |`,
    `| Person name verified | ${report.personNameVerified ? 'yes' : 'no'} |`,
    `| Trace public | ${report.tracePublic ? 'yes' : 'no'} |`,
    `| Usage | ${report.usage.inputTokens} input / ${report.usage.outputTokens} output / ${report.usage.totalTokens} total |`,
    '',
    '## Response',
    '',
    report.response,
    '',
    '## Sources',
    '',
    ...report.sources.map((source) => `- ${source.kind}: ${source.documentType}:${source.documentId} - ${source.label}`),
  ].join('\n');
}

function createLangfuseAuthHeaders(config: FleetGraphConfig): Record<string, string> {
  return {
    authorization: `Basic ${Buffer.from(`${config.langfusePublicKey}:${config.langfuseSecretKey}`).toString('base64')}`,
  };
}

function requireCliValue(values: Map<string, string>, key: string): string {
  const value = values.get(key);

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required argument: ${key}`);
  }

  return value;
}

function parseDocumentType(value: string): FleetGraphChatDocumentType {
  if (value === 'sprint' || value === 'project' || value === 'issue') {
    return value;
  }

  throw new Error(`Unsupported document type: ${value}`);
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
