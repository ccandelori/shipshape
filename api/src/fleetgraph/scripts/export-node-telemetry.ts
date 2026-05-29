import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildFleetGraphNodeTelemetryCase,
  extractTraceIdFromLangfuseTraceUrl,
  formatFleetGraphNodeTelemetryMarkdown,
  parseLangfuseObservationsResponse,
  type FleetGraphNodeTelemetryReport,
  type FleetGraphTraceMatrixCase,
  type LangfuseObservationApiRow,
} from '../telemetry.js';

type DetectionQualityEvalReportFile = {
  cases: Array<{
    id: string;
    name: string;
    traceUrl: string | null;
  }>;
};

type LangfuseTelemetryConfig = {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
};

type PublicTraceVerificationFile = {
  traces: Array<{
    name: string;
    traceId: string;
    url: string;
  }>;
};

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '../../../..');
const reportDir = path.join(repoRoot, 'docs/evals');
const sourceReportPath = path.join(reportDir, 'fleetgraph-detection-quality-eval.json');
const publicTraceVerificationPath = path.join(reportDir, 'fleetgraph-public-trace-verification.json');
const outputMarkdownPath = path.join(reportDir, 'fleetgraph-node-telemetry.md');
const outputJsonPath = path.join(reportDir, 'fleetgraph-node-telemetry.json');

async function main(): Promise<void> {
  const config = loadLangfuseTelemetryConfigFromEnvironment(process.env);
  const sourceReport = await readDetectionQualityEvalReport(sourceReportPath);
  const publicTraceVerification = await readPublicTraceVerification(publicTraceVerificationPath);
  const traceCases = mergeTraceMatrixCases({
    detectionQualityCases: sourceReport.cases.flatMap(toTraceMatrixCase),
    publicTraceCases: publicTraceVerification.traces.map(toPublicTraceMatrixCase),
  });

  const cases = [];
  for (const traceCase of traceCases) {
    const traceId = extractTraceIdFromLangfuseTraceUrl(traceCase.traceUrl);
    const observations = await fetchLangfuseTraceObservations({
      config,
      traceId,
      now: new Date(),
    });

    cases.push(buildFleetGraphNodeTelemetryCase({
      traceCase,
      observations,
    }));
  }

  const report: FleetGraphNodeTelemetryReport = {
    generatedAt: new Date().toISOString(),
    sourceReport: [
      path.relative(repoRoot, sourceReportPath),
      path.relative(repoRoot, publicTraceVerificationPath),
    ].join(', '),
    cases,
  };

  await mkdir(reportDir, { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(outputMarkdownPath, `${formatFleetGraphNodeTelemetryMarkdown(report)}\n`);

  console.log(`FleetGraph node telemetry written to ${outputMarkdownPath}`);
  console.log(`FleetGraph node telemetry JSON written to ${outputJsonPath}`);
  console.log(`Traces exported: ${report.cases.length}`);
}

async function readDetectionQualityEvalReport(
  reportPath: string
): Promise<DetectionQualityEvalReportFile> {
  const raw = await readFile(reportPath, 'utf8');
  const parsed = JSON.parse(raw) as DetectionQualityEvalReportFile;

  if (!Array.isArray(parsed.cases)) {
    throw new Error(`Detection quality report is missing cases array: path=${reportPath}`);
  }

  return parsed;
}

async function readPublicTraceVerification(
  reportPath: string
): Promise<PublicTraceVerificationFile> {
  const raw = await readFile(reportPath, 'utf8');
  const parsed = JSON.parse(raw) as PublicTraceVerificationFile;

  if (!Array.isArray(parsed.traces)) {
    throw new Error(`Public trace verification report is missing traces array: path=${reportPath}`);
  }

  return parsed;
}

async function fetchLangfuseTraceObservations(input: {
  config: LangfuseTelemetryConfig;
  traceId: string;
  now: Date;
}): Promise<LangfuseObservationApiRow[]> {
  const url = new URL('/api/public/v2/observations', input.config.baseUrl);
  url.searchParams.set('traceId', input.traceId);
  url.searchParams.set('fields', 'core,basic,usage,metadata,metrics,trace_context');
  url.searchParams.set('limit', '1000');
  url.searchParams.set('fromStartTime', '2026-01-01T00:00:00.000Z');
  url.searchParams.set('toStartTime', new Date(input.now.getTime() + 24 * 60 * 60 * 1_000).toISOString());

  const response = await fetch(url, {
    headers: {
      authorization: `Basic ${Buffer.from(`${input.config.publicKey}:${input.config.secretKey}`).toString('base64')}`,
    },
  });
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Langfuse observations request failed: traceId=${input.traceId}, status=${response.status}, body=${raw}`
    );
  }

  return parseLangfuseObservationsResponse(JSON.parse(raw));
}

function loadLangfuseTelemetryConfigFromEnvironment(
  env: NodeJS.ProcessEnv
): LangfuseTelemetryConfig {
  return {
    baseUrl: requireEnvironmentValue(env, 'LANGFUSE_BASE_URL'),
    publicKey: requireEnvironmentValue(env, 'LANGFUSE_PUBLIC_KEY'),
    secretKey: requireEnvironmentValue(env, 'LANGFUSE_SECRET_KEY'),
  };
}

function requireEnvironmentValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value.trim();
}

function toTraceMatrixCase(result: {
  id: string;
  name: string;
  traceUrl: string | null;
}): FleetGraphTraceMatrixCase[] {
  if (result.traceUrl === null) {
    return [];
  }

  return [{
    id: result.id,
    name: result.name,
    traceUrl: result.traceUrl,
  }];
}

function toPublicTraceMatrixCase(result: {
  name: string;
  traceId: string;
  url: string;
}): FleetGraphTraceMatrixCase {
  return {
    id: `TRACE-${result.traceId.slice(0, 8)}`,
    name: result.name,
    traceUrl: result.url,
  };
}

function mergeTraceMatrixCases(input: {
  detectionQualityCases: FleetGraphTraceMatrixCase[];
  publicTraceCases: FleetGraphTraceMatrixCase[];
}): FleetGraphTraceMatrixCase[] {
  const casesByTraceId = new Map<string, FleetGraphTraceMatrixCase>();

  for (const traceCase of input.publicTraceCases) {
    casesByTraceId.set(extractTraceIdFromLangfuseTraceUrl(traceCase.traceUrl), traceCase);
  }

  for (const traceCase of input.detectionQualityCases) {
    casesByTraceId.set(extractTraceIdFromLangfuseTraceUrl(traceCase.traceUrl), traceCase);
  }

  return [...casesByTraceId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
