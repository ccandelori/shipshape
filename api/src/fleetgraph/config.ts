export interface FleetGraphEnv {
  OPENAI_API_KEY?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_BASE_URL?: string;
  LANGFUSE_TRACING_ENVIRONMENT?: string;
  LANGFUSE_RELEASE?: string;
}

export interface FleetGraphConfig {
  openaiApiKey: string;
  langfusePublicKey: string;
  langfuseSecretKey: string;
  langfuseBaseUrl: string;
  langfuseTracingEnvironment: string | null;
  langfuseRelease: string | null;
}

export class FleetGraphConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FleetGraphConfigError';
  }
}

const REQUIRED_ENV_KEYS = [
  'OPENAI_API_KEY',
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
] as const;

type RequiredEnvKey = typeof REQUIRED_ENV_KEYS[number];

function findMissingEnvKeys(env: FleetGraphEnv): RequiredEnvKey[] {
  return REQUIRED_ENV_KEYS.filter((key) => {
    const value = env[key];
    return !value || value.trim().length === 0;
  });
}

function requireEnvValue(env: FleetGraphEnv, key: RequiredEnvKey): string {
  const value = env[key];

  if (!value || value.trim().length === 0) {
    throw new FleetGraphConfigError(`FleetGraph configuration is missing required environment variable: ${key}`);
  }

  return value;
}

export function parseFleetGraphConfig(env: FleetGraphEnv): FleetGraphConfig {
  const missingKeys = findMissingEnvKeys(env);

  if (missingKeys.length > 0) {
    throw new FleetGraphConfigError(
      `FleetGraph configuration is missing required environment variables: ${missingKeys.join(', ')}`
    );
  }

  const openaiApiKey = requireEnvValue(env, 'OPENAI_API_KEY');
  const langfusePublicKey = requireEnvValue(env, 'LANGFUSE_PUBLIC_KEY');
  const langfuseSecretKey = requireEnvValue(env, 'LANGFUSE_SECRET_KEY');
  const langfuseBaseUrl = requireEnvValue(env, 'LANGFUSE_BASE_URL');

  return {
    openaiApiKey,
    langfusePublicKey,
    langfuseSecretKey,
    langfuseBaseUrl,
    langfuseTracingEnvironment: optionalEnvValue(env.LANGFUSE_TRACING_ENVIRONMENT),
    langfuseRelease: optionalEnvValue(env.LANGFUSE_RELEASE),
  };
}

export function loadFleetGraphConfig(): FleetGraphConfig {
  return parseFleetGraphConfig({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    LANGFUSE_TRACING_ENVIRONMENT: process.env.LANGFUSE_TRACING_ENVIRONMENT,
    LANGFUSE_RELEASE: process.env.LANGFUSE_RELEASE,
  });
}

export function isFleetGraphAvailable(): boolean {
  try {
    loadFleetGraphConfig();
    return true;
  } catch (error) {
    if (error instanceof FleetGraphConfigError) {
      return false;
    }

    throw error;
  }
}

function optionalEnvValue(value: string | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  return value;
}
