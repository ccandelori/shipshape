import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFleetGraphAvailable, loadFleetGraphConfig, parseFleetGraphConfig } from './config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('FleetGraph config', () => {
  it('parses a valid environment into typed FleetGraph config', () => {
    const config = parseFleetGraphConfig({
      OPENAI_API_KEY: 'sk-test-openai',
      LANGCHAIN_API_KEY: 'lsv2_test_langchain',
      LANGCHAIN_TRACING_V2: 'true',
      LANGCHAIN_PROJECT: 'ship-fleetgraph-test',
    });

    expect(config).toEqual({
      openaiApiKey: 'sk-test-openai',
      langchainApiKey: 'lsv2_test_langchain',
      langchainTracingV2: true,
      langchainProject: 'ship-fleetgraph-test',
    });
  });

  it('throws a clear error listing every missing required environment variable', () => {
    expect(() => parseFleetGraphConfig({})).toThrow(
      'FleetGraph configuration is missing required environment variables: OPENAI_API_KEY, LANGCHAIN_API_KEY, LANGCHAIN_TRACING_V2, LANGCHAIN_PROJECT'
    );
  });

  it('rejects FleetGraph config when LangSmith tracing is not explicitly enabled', () => {
    expect(() => parseFleetGraphConfig({
      OPENAI_API_KEY: 'sk-test-openai',
      LANGCHAIN_API_KEY: 'lsv2_test_langchain',
      LANGCHAIN_TRACING_V2: 'false',
      LANGCHAIN_PROJECT: 'ship-fleetgraph-test',
    })).toThrow('FleetGraph configuration requires LANGCHAIN_TRACING_V2=true');
  });

  it('loads FleetGraph config from process environment', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
    vi.stubEnv('LANGCHAIN_API_KEY', 'lsv2_test_langchain');
    vi.stubEnv('LANGCHAIN_TRACING_V2', 'true');
    vi.stubEnv('LANGCHAIN_PROJECT', 'ship-fleetgraph-test');

    expect(loadFleetGraphConfig()).toEqual({
      openaiApiKey: 'sk-test-openai',
      langchainApiKey: 'lsv2_test_langchain',
      langchainTracingV2: true,
      langchainProject: 'ship-fleetgraph-test',
    });
  });

  it('reports FleetGraph as available only when config is valid', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
    vi.stubEnv('LANGCHAIN_API_KEY', 'lsv2_test_langchain');
    vi.stubEnv('LANGCHAIN_TRACING_V2', 'true');
    vi.stubEnv('LANGCHAIN_PROJECT', 'ship-fleetgraph-test');

    expect(isFleetGraphAvailable()).toBe(true);

    vi.stubEnv('LANGCHAIN_PROJECT', '');

    expect(isFleetGraphAvailable()).toBe(false);
  });
});
