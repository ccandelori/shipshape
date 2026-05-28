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
      LANGFUSE_PROJECT_ID: 'project-test',
      LANGFUSE_TRACING_ENVIRONMENT: 'test',
      LANGFUSE_RELEASE: 'fleetgraph-test',
      FLEETGRAPH_PUBLIC_TRACE_EXPORT: 'true',
    });

    expect(config).toEqual({
      openaiApiKey: 'sk-test-openai',
      langfusePublicKey: 'pk-lf-test',
      langfuseSecretKey: 'sk-lf-test',
      langfuseBaseUrl: 'https://cloud.langfuse.com',
      langfuseProjectId: 'project-test',
      langfuseTracingEnvironment: 'test',
      langfuseRelease: 'fleetgraph-test',
      publicTraceExportEnabled: true,
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
      langfuseProjectId: null,
      langfuseTracingEnvironment: null,
      langfuseRelease: null,
      publicTraceExportEnabled: false,
    });
  });

  it('rejects misspelled public trace export values', () => {
    expect(() => parseFleetGraphConfig({
      OPENAI_API_KEY: 'sk-test-openai',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
      LANGFUSE_SECRET_KEY: 'sk-lf-test',
      LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
      FLEETGRAPH_PUBLIC_TRACE_EXPORT: 'yes',
    })).toThrow(
      'FleetGraph configuration environment variable must be "true" or "false": FLEETGRAPH_PUBLIC_TRACE_EXPORT'
    );
  });

  it('loads FleetGraph config from process environment', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://cloud.langfuse.com');
    vi.stubEnv('LANGFUSE_PROJECT_ID', 'project-dev');
    vi.stubEnv('LANGFUSE_TRACING_ENVIRONMENT', 'local');
    vi.stubEnv('LANGFUSE_RELEASE', 'dev-build');
    vi.stubEnv('FLEETGRAPH_PUBLIC_TRACE_EXPORT', 'true');

    expect(loadFleetGraphConfig()).toEqual({
      openaiApiKey: 'sk-test-openai',
      langfusePublicKey: 'pk-lf-test',
      langfuseSecretKey: 'sk-lf-test',
      langfuseBaseUrl: 'https://cloud.langfuse.com',
      langfuseProjectId: 'project-dev',
      langfuseTracingEnvironment: 'local',
      langfuseRelease: 'dev-build',
      publicTraceExportEnabled: true,
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
