import { z } from 'zod';

export type FleetGraphTraceMatrixCase = {
  id: string;
  name: string;
  traceUrl: string;
};

export type FleetGraphNodeTelemetryObservation = {
  id: string;
  traceId: string;
  parentObservationId: string | null;
  type: string;
  name: string;
  public: boolean;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  totalCost: number | null;
  traceNode: string | null;
  branchPath: string | null;
  guardDecision: string | null;
  preFilterShouldReason: boolean | null;
  lifecycleState: string | null;
  modelName: string | null;
};

export type FleetGraphNodeTelemetryCase = FleetGraphTraceMatrixCase & {
  traceId: string;
  observations: FleetGraphNodeTelemetryObservation[];
};

export type FleetGraphNodeTelemetryReport = {
  generatedAt: string;
  sourceReport: string;
  cases: FleetGraphNodeTelemetryCase[];
};

type FleetGraphObservationMetadata = {
  traceNode: string | null;
  branchPath: string | null;
  guardDecision: string | null;
  preFilterShouldReason: boolean | null;
  lifecycleState: string | null;
  modelName: string | null;
  detectorType: string | null;
  personResolution: string | null;
};

const langfuseObservationSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  startTime: z.string().optional(),
  sessionId: z.string().optional(),
  parentObservationId: z.string().nullable(),
  type: z.string(),
  name: z.string(),
  public: z.boolean().optional(),
  latency: z.number().nullable().optional(),
  inputUsage: z.number().nullable().optional(),
  outputUsage: z.number().nullable().optional(),
  totalUsage: z.number().nullable().optional(),
  totalCost: z.union([z.number(), z.string()]).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const langfuseObservationsResponseSchema = z.object({
  data: z.array(langfuseObservationSchema),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const fleetGraphObservationNamePrefix = 'fleetgraph.';
const fleetGraphTraceNodeOrder = [
  'run',
  'scope',
  'context',
  'guard',
  'preFilter',
  'reason',
  'policy',
  'output',
  'chat',
] as const;

export type LangfuseObservationApiRow = z.infer<typeof langfuseObservationSchema>;

export function parseLangfuseObservationsResponse(input: unknown): LangfuseObservationApiRow[] {
  return langfuseObservationsResponseSchema.parse(input).data;
}

export function buildFleetGraphNodeTelemetryCase(input: {
  traceCase: FleetGraphTraceMatrixCase;
  observations: LangfuseObservationApiRow[];
}): FleetGraphNodeTelemetryCase {
  const traceId = extractTraceIdFromLangfuseTraceUrl(input.traceCase.traceUrl);

  return {
    ...input.traceCase,
    traceId,
    observations: input.observations
      .map(toFleetGraphNodeTelemetryObservationOrNull)
      .filter(isFleetGraphNodeTelemetryObservation)
      .sort(compareFleetGraphNodeTelemetryObservation),
  };
}

export function extractTraceIdFromLangfuseTraceUrl(traceUrl: string): string {
  const url = new URL(traceUrl);
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const tracesIndex = segments.indexOf('traces');
  const traceId = tracesIndex === -1 ? null : segments[tracesIndex + 1] ?? null;

  if (traceId === null || traceId.length === 0) {
    throw new Error(`Langfuse trace URL does not contain a trace id: traceUrl=${traceUrl}`);
  }

  return decodeURIComponent(traceId);
}

export function formatFleetGraphNodeTelemetryMarkdown(
  report: FleetGraphNodeTelemetryReport
): string {
  const lines: string[] = [
    '# FleetGraph Node Telemetry',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    `Source report: \`${report.sourceReport}\``,
    '',
    'Langfuse exposes public sharing at the trace level. Each row below gives the public trace URL plus the concrete observation id for the graph node or model observation inside that trace.',
    '',
  ];

  for (const telemetryCase of report.cases) {
    lines.push(
      `## ${telemetryCase.id} - ${telemetryCase.name}`,
      '',
      `Trace: [${telemetryCase.traceId}](${telemetryCase.traceUrl})`,
      '',
      '| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |',
      '|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|'
    );

    for (const observation of telemetryCase.observations) {
      lines.push(formatFleetGraphNodeTelemetryObservationRow(observation));
    }

    if (telemetryCase.observations.length === 0) {
      lines.push('| No FleetGraph observations returned by Langfuse API | — | — | — | — | — | — | — | — | — | — | — | — |');
    }

    lines.push('');
  }

  return lines.join('\n');
}

function formatFleetGraphNodeTelemetryObservationRow(
  observation: FleetGraphNodeTelemetryObservation
): string {
  return [
    observation.name,
    observation.type,
    inlineCode(observation.id),
    nullableInlineCode(observation.parentObservationId),
    nullableInlineCode(observation.traceNode),
    nullableInlineCode(observation.branchPath),
    nullableInlineCode(observation.guardDecision),
    formatNullableBoolean(observation.preFilterShouldReason),
    nullableInlineCode(observation.lifecycleState),
    String(observation.totalTokens ?? 0),
    formatNullableNumber(observation.totalCost),
    formatNullableNumber(observation.latencyMs),
    observation.public ? 'yes' : 'trace-public',
  ].map(escapeMarkdownTableCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |');
}

function toFleetGraphNodeTelemetryObservationOrNull(
  observation: LangfuseObservationApiRow
): FleetGraphNodeTelemetryObservation | null {
  const metadata = normalizeFleetGraphObservationMetadata(observation.metadata ?? {});

  if (!isFleetGraphTelemetryObservation(observation.name, metadata)) {
    return null;
  }

  return {
    id: observation.id,
    traceId: observation.traceId,
    parentObservationId: observation.parentObservationId,
    type: observation.type,
    name: observation.name,
    public: observation.public ?? false,
    latencyMs: millisecondsFromSeconds(observation.latency ?? null),
    inputTokens: nullableNumber(observation.inputUsage ?? null),
    outputTokens: nullableNumber(observation.outputUsage ?? null),
    totalTokens: nullableNumber(observation.totalUsage ?? null),
    totalCost: nullableNumber(observation.totalCost ?? null),
    traceNode: metadata.traceNode,
    branchPath: metadata.branchPath,
    guardDecision: metadata.guardDecision,
    preFilterShouldReason: metadata.preFilterShouldReason,
    lifecycleState: metadata.lifecycleState,
    modelName: metadata.modelName,
  };
}

function isFleetGraphNodeTelemetryObservation(
  observation: FleetGraphNodeTelemetryObservation | null
): observation is FleetGraphNodeTelemetryObservation {
  return observation !== null;
}

function compareFleetGraphNodeTelemetryObservation(
  left: FleetGraphNodeTelemetryObservation,
  right: FleetGraphNodeTelemetryObservation
): number {
  return traceNodeRank(left.traceNode, left.name) - traceNodeRank(right.traceNode, right.name)
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id);
}

function traceNodeRank(traceNode: string | null, name: string): number {
  const node = traceNode ?? inferTraceNodeFromName(name);
  const index = fleetGraphTraceNodeOrder.findIndex((orderedNode) => orderedNode === node);
  return index === -1 ? fleetGraphTraceNodeOrder.length : index;
}

function inferTraceNodeFromName(name: string): string {
  const suffix = name.split('.').at(-1);
  return suffix ?? name;
}

function isFleetGraphObservationName(name: string): boolean {
  return name.startsWith(fleetGraphObservationNamePrefix);
}

function isFleetGraphTelemetryObservation(
  name: string,
  metadata: FleetGraphObservationMetadata
): boolean {
  return isFleetGraphObservationName(name) || hasFleetGraphTelemetryMetadata(metadata);
}

function normalizeFleetGraphObservationMetadata(
  metadata: Record<string, unknown>
): FleetGraphObservationMetadata {
  return {
    traceNode: nullableString(metadata.traceNode),
    branchPath: nullableString(metadata.branchPath),
    guardDecision: nullableString(metadata.guardDecision),
    preFilterShouldReason: nullableBoolean(metadata.preFilterShouldReason),
    lifecycleState: nullableString(metadata.lifecycleState),
    modelName: nullableString(metadata.modelName),
    detectorType: nullableString(metadata.detectorType),
    personResolution: nullableString(metadata.personResolution),
  };
}

function hasFleetGraphTelemetryMetadata(metadata: FleetGraphObservationMetadata): boolean {
  return metadata.traceNode !== null
    || metadata.detectorType === 'at_risk_week'
    || metadata.personResolution === 'applied';
}

function millisecondsFromSeconds(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Number((value * 1_000).toFixed(3));
}

function nullableNumber(value: number | string | null): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function inlineCode(value: string): string {
  return `\`${value}\``;
}

function nullableInlineCode(value: string | null): string {
  return value === null ? '—' : inlineCode(value);
}

function formatNullableBoolean(value: boolean | null): string {
  if (value === null) {
    return '—';
  }

  return value ? 'yes' : 'no';
}

function formatNullableNumber(value: number | null): string {
  if (value === null) {
    return '—';
  }

  return String(value);
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}
