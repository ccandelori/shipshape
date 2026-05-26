/**
 * SSM Parameter Store - Application Configuration
 *
 * This file loads application configuration from AWS SSM Parameter Store.
 *
 * Secrets Storage:
 * ─────────────────
 * SSM Parameter Store (/ship/{env}/):
 *   - DATABASE_URL, SESSION_SECRET, CORS_ORIGIN
 *   - Application config that changes per environment
 *   - FleetGraph OpenAI and LangSmith runtime config
 *   - CAIA OAuth credentials (CAIA_ISSUER_URL, CAIA_CLIENT_ID, etc.)
 */
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export const productionSecretKeys = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'CORS_ORIGIN',
  'CDN_DOMAIN',
  'APP_BASE_URL',
  'OPENAI_API_KEY',
  'LANGCHAIN_API_KEY',
  'LANGCHAIN_TRACING_V2',
  'LANGCHAIN_PROJECT',
] as const;

export type ProductionSecretKey = typeof productionSecretKeys[number];

export type ProductionSecretValues = {
  [key in ProductionSecretKey]: string;
};

export type ProductionSecretEnv = Record<string, string | undefined>;

export type ProductionSecretLoader = (name: string) => Promise<string>;

export interface LoadProductionSecretValuesInput {
  environment: string;
  getSecret: ProductionSecretLoader;
}

// Lazy-initialized client to avoid keeping Node.js alive during import tests
let _client: SSMClient | null = null;

function getClient(): SSMClient {
  if (!_client) {
    _client = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  return _client;
}

export async function getSSMSecret(name: string): Promise<string> {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: true,
  });

  const response = await getClient().send(command);
  if (!response.Parameter?.Value) {
    throw new Error(`SSM parameter ${name} not found`);
  }
  return response.Parameter.Value;
}

export function buildProductionSecretParameterName(
  environment: string,
  key: ProductionSecretKey
): string {
  return `/ship/${environment}/${key}`;
}

export function shouldSkipProductionSecretLoading(env: ProductionSecretEnv): boolean {
  return productionSecretKeys.every((key) => hasSecretValue(env[key]));
}

export async function loadProductionSecretValues(
  input: LoadProductionSecretValuesInput
): Promise<ProductionSecretValues> {
  const values: Partial<Record<ProductionSecretKey, string>> = {};

  for (const key of productionSecretKeys) {
    values[key] = await input.getSecret(buildProductionSecretParameterName(input.environment, key));
  }

  return {
    DATABASE_URL: requireLoadedProductionSecret(values, 'DATABASE_URL'),
    SESSION_SECRET: requireLoadedProductionSecret(values, 'SESSION_SECRET'),
    CORS_ORIGIN: requireLoadedProductionSecret(values, 'CORS_ORIGIN'),
    CDN_DOMAIN: requireLoadedProductionSecret(values, 'CDN_DOMAIN'),
    APP_BASE_URL: requireLoadedProductionSecret(values, 'APP_BASE_URL'),
    OPENAI_API_KEY: requireLoadedProductionSecret(values, 'OPENAI_API_KEY'),
    LANGCHAIN_API_KEY: requireLoadedProductionSecret(values, 'LANGCHAIN_API_KEY'),
    LANGCHAIN_TRACING_V2: requireLoadedProductionSecret(values, 'LANGCHAIN_TRACING_V2'),
    LANGCHAIN_PROJECT: requireLoadedProductionSecret(values, 'LANGCHAIN_PROJECT'),
  };
}

export async function loadProductionSecrets(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    return; // Use .env files for local dev
  }

  if (shouldSkipProductionSecretLoading(process.env)) {
    console.log('Production secrets already set; skipping SSM secret loading');
    return;
  }

  const environment = process.env.ENVIRONMENT || 'prod';
  const basePath = `/ship/${environment}`;

  console.log(`Loading secrets from SSM path: ${basePath}`);

  const values = await loadProductionSecretValues({
    environment,
    getSecret: getSSMSecret,
  });

  for (const key of productionSecretKeys) {
    process.env[key] = values[key];
  }

  console.log('Secrets loaded from SSM Parameter Store');
  console.log(`CORS_ORIGIN: ${values.CORS_ORIGIN}`);
  console.log(`CDN_DOMAIN: ${values.CDN_DOMAIN}`);
  console.log(`APP_BASE_URL: ${values.APP_BASE_URL}`);
  console.log(`LANGCHAIN_TRACING_V2: ${values.LANGCHAIN_TRACING_V2}`);
  console.log(`LANGCHAIN_PROJECT: ${values.LANGCHAIN_PROJECT}`);
}

function hasSecretValue(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function requireLoadedProductionSecret(
  values: Partial<Record<ProductionSecretKey, string>>,
  key: ProductionSecretKey
): string {
  const value = values[key];

  if (value === undefined || value.trim().length === 0) {
    throw new Error(`SSM parameter /ship/{env}/${key} returned an empty value`);
  }

  return value;
}
