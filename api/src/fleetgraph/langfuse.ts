import type { RunnableConfig } from '@langchain/core/runnables';
import { CallbackHandler } from '@langfuse/langchain';
import { LangfuseSpanProcessor, type MaskFunction } from '@langfuse/otel';
import {
  propagateAttributes,
  startActiveObservation,
  type LangfuseSpanAttributes,
  type PropagateAttributesParams,
} from '@langfuse/tracing';
import { NodeSDK } from '@opentelemetry/sdk-node';
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
