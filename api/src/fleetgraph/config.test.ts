import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFleetGraphAvailable, loadFleetGraphConfig, parseFleetGraphConfig } from './config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('FleetGraph config', () => {
  it('parses a valid environment into typed FleetGraph config', () => {
    const config = parseFleetGraphConfig({
      OPENAI_API_KEY: 'sk-test-openai',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
      LANGFUSE_SECRET_KEY: 'sk-lf-test',
      LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
      LANGFUSE_TRACING_ENVIRONMENT: 'test',
      LANGFUSE_RELEASE: 'fleetgraph-test',
    });

    expect(config).toEqual({
      openaiApiKey: 'sk-test-openai',
      langfusePublicKey: 'pk-lf-test',
      langfuseSecretKey: 'sk-lf-test',
      langfuseBaseUrl: 'https://cloud.langfuse.com',
      langfuseTracingEnvironment: 'test',
      langfuseRelease: 'fleetgraph-test',
    });
  });

  it('throws a clear error listing every missing required environment variable', () => {
    expect(() => parseFleetGraphConfig({})).toThrow(
      'FleetGraph configuration is missing required environment variables: OPENAI_API_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL'
    );
  });

  it('normalizes optional Langfuse deployment fields to null when omitted', () => {
    expect(parseFleetGraphConfig({
      OPENAI_API_KEY: 'sk-test-openai',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
      LANGFUSE_SECRET_KEY: 'sk-lf-test',
      LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
    })).toMatchObject({
      langfuseTracingEnvironment: null,
      langfuseRelease: null,
    });
  });

  it('loads FleetGraph config from process environment', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://cloud.langfuse.com');
    vi.stubEnv('LANGFUSE_TRACING_ENVIRONMENT', 'local');
    vi.stubEnv('LANGFUSE_RELEASE', 'dev-build');

    expect(loadFleetGraphConfig()).toEqual({
      openaiApiKey: 'sk-test-openai',
      langfusePublicKey: 'pk-lf-test',
      langfuseSecretKey: 'sk-lf-test',
      langfuseBaseUrl: 'https://cloud.langfuse.com',
      langfuseTracingEnvironment: 'local',
      langfuseRelease: 'dev-build',
    });
  });

  it('reports FleetGraph as available only when config is valid', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://cloud.langfuse.com');

    expect(isFleetGraphAvailable()).toBe(true);

    vi.stubEnv('LANGFUSE_BASE_URL', '');

    expect(isFleetGraphAvailable()).toBe(false);
  });
});
