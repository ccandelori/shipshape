import { describe, expect, it, vi } from 'vitest';
import {
  buildProductionSecretParameterName,
  loadProductionSecretValues,
  productionSecretKeys,
  shouldSkipProductionSecretLoading,
} from './ssm.js';

describe('SSM production secret loading', () => {
  it('includes FleetGraph OpenAI and LangSmith keys in the production SSM contract', () => {
    expect(productionSecretKeys).toEqual([
      'DATABASE_URL',
      'SESSION_SECRET',
      'CORS_ORIGIN',
      'CDN_DOMAIN',
      'APP_BASE_URL',
      'OPENAI_API_KEY',
      'LANGCHAIN_API_KEY',
      'LANGCHAIN_TRACING_V2',
      'LANGCHAIN_PROJECT',
    ]);
    expect(buildProductionSecretParameterName('prod', 'LANGCHAIN_PROJECT')).toBe('/ship/prod/LANGCHAIN_PROJECT');
  });

  it('loads every required production secret from the environment-specific SSM path', async () => {
    const getSecret = vi.fn(async (name: string): Promise<string> => `value:${name}`);

    const values = await loadProductionSecretValues({
      environment: 'staging',
      getSecret,
    });

    expect(getSecret).toHaveBeenCalledTimes(productionSecretKeys.length);
    expect(getSecret).toHaveBeenCalledWith('/ship/staging/OPENAI_API_KEY');
    expect(getSecret).toHaveBeenCalledWith('/ship/staging/LANGCHAIN_API_KEY');
    expect(getSecret).toHaveBeenCalledWith('/ship/staging/LANGCHAIN_TRACING_V2');
    expect(getSecret).toHaveBeenCalledWith('/ship/staging/LANGCHAIN_PROJECT');
    expect(values.LANGCHAIN_TRACING_V2).toBe('value:/ship/staging/LANGCHAIN_TRACING_V2');
  });

  it('does not skip SSM loading when FleetGraph tracing keys are missing', () => {
    expect(shouldSkipProductionSecretLoading({
      DATABASE_URL: 'postgres://example',
      SESSION_SECRET: 'session-secret',
      CORS_ORIGIN: 'https://app.example.test',
      CDN_DOMAIN: 'cdn.example.test',
      APP_BASE_URL: 'https://app.example.test',
    })).toBe(false);
  });

  it('skips SSM loading only when core and FleetGraph secrets are already present', () => {
    expect(shouldSkipProductionSecretLoading({
      DATABASE_URL: 'postgres://example',
      SESSION_SECRET: 'session-secret',
      CORS_ORIGIN: 'https://app.example.test',
      CDN_DOMAIN: 'cdn.example.test',
      APP_BASE_URL: 'https://app.example.test',
      OPENAI_API_KEY: 'sk-test-openai',
      LANGCHAIN_API_KEY: 'lsv2_test_langchain',
      LANGCHAIN_TRACING_V2: 'true',
      LANGCHAIN_PROJECT: 'ship-fleetgraph-prod',
    })).toBe(true);
  });
});
