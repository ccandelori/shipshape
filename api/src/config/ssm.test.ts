import { describe, expect, it, vi } from 'vitest';
import {
  buildProductionSecretParameterName,
  loadProductionSecretValues,
  productionSecretKeys,
  shouldSkipProductionSecretLoading,
} from './ssm.js';

describe('SSM production secret loading', () => {
  it('includes FleetGraph OpenAI and Langfuse keys in the production SSM contract', () => {
    expect(productionSecretKeys).toEqual([
      'DATABASE_URL',
      'SESSION_SECRET',
      'CORS_ORIGIN',
      'CDN_DOMAIN',
      'APP_BASE_URL',
      'OPENAI_API_KEY',
      'LANGFUSE_PUBLIC_KEY',
      'LANGFUSE_SECRET_KEY',
      'LANGFUSE_BASE_URL',
    ]);
    expect(buildProductionSecretParameterName('prod', 'LANGFUSE_BASE_URL')).toBe('/ship/prod/LANGFUSE_BASE_URL');
  });

  it('loads every required production secret from the environment-specific SSM path', async () => {
    const getSecret = vi.fn(async (name: string): Promise<string> => `value:${name}`);

    const values = await loadProductionSecretValues({
      environment: 'staging',
      getSecret,
    });

    expect(getSecret).toHaveBeenCalledTimes(productionSecretKeys.length);
    expect(getSecret).toHaveBeenCalledWith('/ship/staging/OPENAI_API_KEY');
    expect(getSecret).toHaveBeenCalledWith('/ship/staging/LANGFUSE_PUBLIC_KEY');
    expect(getSecret).toHaveBeenCalledWith('/ship/staging/LANGFUSE_SECRET_KEY');
    expect(getSecret).toHaveBeenCalledWith('/ship/staging/LANGFUSE_BASE_URL');
    expect(values.LANGFUSE_BASE_URL).toBe('value:/ship/staging/LANGFUSE_BASE_URL');
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
      LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
      LANGFUSE_SECRET_KEY: 'sk-lf-test',
      LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
    })).toBe(true);
  });
});
