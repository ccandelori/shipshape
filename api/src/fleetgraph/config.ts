export interface FleetGraphEnv {
  OPENAI_API_KEY?: string;
  LANGCHAIN_API_KEY?: string;
  LANGCHAIN_TRACING_V2?: string;
  LANGCHAIN_PROJECT?: string;
}

export interface FleetGraphConfig {
  openaiApiKey: string;
  langchainApiKey: string;
  langchainTracingV2: true;
  langchainProject: string;
}

export class FleetGraphConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FleetGraphConfigError';
  }
}

const REQUIRED_ENV_KEYS = [
  'OPENAI_API_KEY',
  'LANGCHAIN_API_KEY',
  'LANGCHAIN_TRACING_V2',
  'LANGCHAIN_PROJECT',
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
  const langchainApiKey = requireEnvValue(env, 'LANGCHAIN_API_KEY');
  const langchainTracing = requireEnvValue(env, 'LANGCHAIN_TRACING_V2');
  const langchainProject = requireEnvValue(env, 'LANGCHAIN_PROJECT');

  if (langchainTracing !== 'true') {
    throw new FleetGraphConfigError('FleetGraph configuration requires LANGCHAIN_TRACING_V2=true');
  }

  return {
    openaiApiKey,
    langchainApiKey,
    langchainTracingV2: true,
    langchainProject,
  };
}

export function loadFleetGraphConfig(): FleetGraphConfig {
  return parseFleetGraphConfig({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    LANGCHAIN_API_KEY: process.env.LANGCHAIN_API_KEY,
    LANGCHAIN_TRACING_V2: process.env.LANGCHAIN_TRACING_V2,
    LANGCHAIN_PROJECT: process.env.LANGCHAIN_PROJECT,
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
