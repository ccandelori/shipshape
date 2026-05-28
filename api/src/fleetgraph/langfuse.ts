import type { RunnableConfig } from '@langchain/core/runnables';
import { CallbackHandler } from '@langfuse/langchain';
import { LangfuseSpanProcessor, type MaskFunction } from '@langfuse/otel';
import {
  propagateAttributes,
  startActiveObservation,
  type LangfuseObservation,
  type LangfuseSpanAttributes,
  type PropagateAttributesParams,
} from '@langfuse/tracing';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { randomUUID } from 'node:crypto';
import { FleetGraphConfigError, loadFleetGraphConfig, type FleetGraphConfig } from './config.js';

export type FleetGraphLangfuseRuntime = {
  startActiveObservation: typeof startActiveObservation;
  propagateAttributes: typeof propagateAttributes;
};

export type FleetGraphLangfuseRunnableConfig = Pick<
  RunnableConfig,
  'callbacks' | 'metadata' | 'runName' | 'tags'
>;

export type FleetGraphLangfuseObservationAttributes = LangfuseSpanAttributes;

export type FleetGraphLangfuseTraceInput = {
  traceName: string;
  sessionId: string;
  userId: string | null;
  tags: string[];
  metadata: Record<string, string>;
};

export type FleetGraphLangfuseCallbackInput = {
  runName: string;
  tags: string[];
  metadata: Record<string, unknown>;
  userId: string | null;
  sessionId: string | null;
};

export type FleetGraphPublicTracePolicy = {
  enabled: boolean;
  langfuseBaseUrl: string;
  langfuseProjectId: string | null;
  langfusePublicKey: string;
  langfuseSecretKey: string;
  publishTrace: FleetGraphPublicTracePublisher;
};

export type FleetGraphPublicTracePublishInput = {
  langfuseBaseUrl: string;
  langfusePublicKey: string;
  langfuseSecretKey: string;
  traceId: string;
  traceName: string;
};

export type FleetGraphPublicTracePublisher = (
  input: FleetGraphPublicTracePublishInput
) => Promise<void>;

export type FleetGraphPublicTraceIngestionInput = FleetGraphPublicTracePublishInput & {
  eventId: string;
  timestamp: string;
  fetchClient: typeof fetch;
};

export type FleetGraphTracePublicationMetadata = {
  tracePublic: boolean;
  traceId: string | null;
  traceUrl: string | null;
};

export type FleetGraphTracePublicationResult = {
  published: boolean;
  metadata: FleetGraphTracePublicationMetadata;
};

export type FleetGraphTracePublicationLogger = {
  info: (message: string, fields: Record<string, string | boolean | null>) => void;
};

type LangfuseIngestionResponse = {
  successes?: Array<{ id?: string; status?: number }>;
  errors?: Array<{ id?: string; status?: number; message?: string; error?: string }>;
};

export class FleetGraphPublicTracePublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FleetGraphPublicTracePublicationError';
  }
}

export const fleetGraphLangfuseRuntime: FleetGraphLangfuseRuntime = {
  startActiveObservation,
  propagateAttributes,
};

let fleetGraphLangfuseSdk: NodeSDK | null = null;

export function startFleetGraphLangfuseTracingFromEnvironment(): void {
  try {
    startFleetGraphLangfuseTracing(loadFleetGraphConfig());
  } catch (error) {
    if (error instanceof FleetGraphConfigError) {
      console.warn('fleetgraph.langfuse.tracing_not_configured', {
        errorMessage: error.message,
      });
      return;
    }

    throw error;
  }
}

export function startFleetGraphLangfuseTracing(config: FleetGraphConfig): void {
  if (fleetGraphLangfuseSdk !== null) {
    return;
  }

  const sdk = new NodeSDK({
    serviceName: 'ship-api',
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: config.langfusePublicKey,
        secretKey: config.langfuseSecretKey,
        baseUrl: config.langfuseBaseUrl,
        environment: config.langfuseTracingEnvironment ?? undefined,
        release: config.langfuseRelease ?? undefined,
        mask: maskFleetGraphLangfuseData,
      }),
    ],
  });

  sdk.start();
  fleetGraphLangfuseSdk = sdk;

  console.log('fleetgraph.langfuse.tracing_started', {
    baseUrl: config.langfuseBaseUrl,
    publicTraceExportEnabled: config.publicTraceExportEnabled,
    environment: config.langfuseTracingEnvironment ?? null,
    release: config.langfuseRelease ?? null,
  });
}

export async function shutdownFleetGraphLangfuseTracing(): Promise<void> {
  if (fleetGraphLangfuseSdk === null) {
    return;
  }

  const sdk = fleetGraphLangfuseSdk;
  fleetGraphLangfuseSdk = null;
  await sdk.shutdown();
}

export const maskFleetGraphLangfuseData: MaskFunction = ({ data }) => maskSensitiveLangfuseValue(data);

export function maskSensitiveLangfuseValue(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }

  return data
    .replace(/(pk-lf-[A-Za-z0-9_-]{8,})/g, 'pk-lf-[REDACTED]')
    .replace(/(sk-lf-[A-Za-z0-9_-]{8,})/g, 'sk-lf-[REDACTED]')
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, 'sk-[REDACTED]')
    .replace(/(lsv2_[A-Za-z0-9_-]{8,})/g, 'lsv2_[REDACTED]')
    .replace(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, '[REDACTED_EMAIL]');
}

export function createFleetGraphLangfuseRunnableConfig(
  input: FleetGraphLangfuseCallbackInput
): FleetGraphLangfuseRunnableConfig {
  return {
    runName: input.runName,
    tags: input.tags,
    metadata: input.metadata,
    callbacks: [
      new CallbackHandler({
        userId: input.userId ?? undefined,
        sessionId: input.sessionId ?? undefined,
        tags: input.tags,
        traceMetadata: input.metadata,
      }),
    ],
  };
}

export function createFleetGraphLangfusePropagatedAttributes(
  input: FleetGraphLangfuseTraceInput
): PropagateAttributesParams {
  const params: PropagateAttributesParams = {
    traceName: truncateLangfuseAttributeValue(input.traceName),
    sessionId: truncateLangfuseAttributeValue(input.sessionId),
    tags: input.tags,
    metadata: sanitizeLangfuseMetadata(input.metadata),
    asBaggage: false,
  };

  if (input.userId !== null) {
    params.userId = truncateLangfuseAttributeValue(input.userId);
  }

  return params;
}

export function createFleetGraphPublicTracePolicy(config: FleetGraphConfig): FleetGraphPublicTracePolicy {
  return {
    enabled: config.publicTraceExportEnabled,
    langfuseBaseUrl: config.langfuseBaseUrl,
    langfuseProjectId: config.langfuseProjectId,
    langfusePublicKey: config.langfusePublicKey,
    langfuseSecretKey: config.langfuseSecretKey,
    publishTrace: async (input) => publishFleetGraphTraceViaLangfuseIngestion({
      ...input,
      eventId: `fleetgraph-public-trace-${input.traceId}-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      fetchClient: fetch,
    }),
  };
}

export function createDisabledFleetGraphPublicTracePolicy(): FleetGraphPublicTracePolicy {
  return {
    enabled: false,
    langfuseBaseUrl: '',
    langfuseProjectId: null,
    langfusePublicKey: '',
    langfuseSecretKey: '',
    publishTrace: async () => {},
  };
}

export async function publishFleetGraphTraceIfEnabled(input: {
  observation: LangfuseObservation;
  policy: FleetGraphPublicTracePolicy;
  traceName: string;
  tags: readonly string[];
  logger: FleetGraphTracePublicationLogger;
}): Promise<FleetGraphTracePublicationResult> {
  const traceId = typeof input.observation.traceId === 'string' ? input.observation.traceId : null;
  const traceUrl = createFleetGraphLangfuseTraceUrl({
    baseUrl: input.policy.langfuseBaseUrl,
    projectId: input.policy.langfuseProjectId,
    traceId,
  });
  const metadata: FleetGraphTracePublicationMetadata = {
    tracePublic: false,
    traceId,
    traceUrl,
  };

  if (!input.policy.enabled || !input.tags.includes('fleetgraph')) {
    return {
      published: false,
      metadata,
    };
  }

  input.observation.setTraceAsPublic();
  if (traceId === null) {
    throw new FleetGraphPublicTracePublicationError(
      `FleetGraph public trace export requires a trace id: traceName=${input.traceName}`
    );
  }

  await input.policy.publishTrace({
    langfuseBaseUrl: input.policy.langfuseBaseUrl,
    langfusePublicKey: input.policy.langfusePublicKey,
    langfuseSecretKey: input.policy.langfuseSecretKey,
    traceId,
    traceName: input.traceName,
  });

  input.logger.info('fleetgraph.langfuse.trace_public', {
    traceName: input.traceName,
    traceId,
    traceUrl,
  });

  return {
    published: true,
    metadata: {
      ...metadata,
      tracePublic: true,
    },
  };
}

export async function publishFleetGraphTraceViaLangfuseIngestion(
  input: FleetGraphPublicTraceIngestionInput
): Promise<void> {
  const url = `${input.langfuseBaseUrl.replace(/\/+$/u, '')}/api/public/ingestion`;
  const auth = Buffer.from(`${input.langfusePublicKey}:${input.langfuseSecretKey}`).toString('base64');
  const response = await input.fetchClient(url, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      batch: [{
        id: input.eventId,
        timestamp: input.timestamp,
        type: 'trace-create',
        body: {
          id: input.traceId,
          timestamp: input.timestamp,
          name: input.traceName,
          public: true,
        },
      }],
    }),
  });

  const responseBody = await readLangfuseIngestionResponse(response);
  const matchingSuccess = responseBody.successes?.find((success) => success.id === input.eventId);
  const matchingError = responseBody.errors?.find((error) => error.id === input.eventId);

  if (!response.ok || matchingError || !matchingSuccess) {
    throw new FleetGraphPublicTracePublicationError(
      `Langfuse public trace export failed: traceId=${input.traceId}, traceName=${input.traceName}, status=${response.status}, body=${JSON.stringify(responseBody)}`
    );
  }
}

async function readLangfuseIngestionResponse(response: Response): Promise<LangfuseIngestionResponse> {
  const rawBody = await response.text();

  try {
    return JSON.parse(rawBody) as LangfuseIngestionResponse;
  } catch {
    return {
      errors: [{
        status: response.status,
        message: rawBody,
      }],
    };
  }
}

export function createFleetGraphLangfuseTraceUrl(input: {
  baseUrl: string;
  projectId: string | null;
  traceId: string | null;
}): string | null {
  if (input.projectId === null || input.traceId === null) {
    return null;
  }

  const normalizedBaseUrl = input.baseUrl.replace(/\/+$/u, '');

  if (normalizedBaseUrl.length === 0) {
    return null;
  }

  return [
    normalizedBaseUrl,
    'project',
    encodeURIComponent(input.projectId),
    'traces',
    encodeURIComponent(input.traceId),
  ].join('/');
}

export function sanitizeLangfuseMetadata(metadata: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');

    if (safeKey.length === 0) {
      continue;
    }

    sanitized[safeKey] = truncateLangfuseAttributeValue(value);
  }

  return sanitized;
}

function truncateLangfuseAttributeValue(value: string): string {
  return value.length <= 200 ? value : value.slice(0, 200);
}
