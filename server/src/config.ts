import type { LogLevel } from './logger.js';

/**
 * Only providers that are actually implemented are accepted — offering `openai` here while
 * `createAiProvider` ignores it would silently run the wrong vendor.
 */
export type AiProviderName = 'gemini' | 'fake';

export type Config = {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  mongodbUri: string;
  aiProvider: AiProviderName;
  /** null only for the offline `fake` provider. */
  aiApiKey: string | null;
  /** null means "use the provider's default model". */
  aiModel: string | null;
  /** How many assets may be analysed at once, so one bulk upload can't exhaust the API quota. */
  aiConcurrency: number;
  maxUploadMb: number;
  logLevel: LogLevel;
  clientDistDir: string;
};

const NODE_ENVS: Config['nodeEnv'][] = ['development', 'production', 'test'];
const AI_PROVIDERS: AiProviderName[] = ['gemini', 'fake'];
const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const API_KEY_VAR: Record<AiProviderName, string | null> = {
  gemini: 'GEMINI_API_KEY',
  fake: null,
};

type Env = Record<string, string | undefined>;

function readString(env: Env, key: string, fallback: string): string {
  const raw = env[key]?.trim();
  return raw === undefined || raw === '' ? fallback : raw;
}

function readInt(env: Env, key: string, fallback: number, problems: string[]): number {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    problems.push(`${key} must be a positive integer (got "${raw}")`);
    return fallback;
  }
  return parsed;
}

function readEnum<T extends string>(
  env: Env,
  key: string,
  allowed: T[],
  fallback: T,
  problems: string[],
): T {
  const raw = env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  const match = allowed.find((value) => value === raw);
  if (match === undefined) {
    problems.push(`${key} must be one of ${allowed.join(' | ')} (got "${raw}")`);
    return fallback;
  }
  return match;
}

/**
 * Pure so it can be unit-tested; every problem is collected before throwing so a
 * misconfigured deployment sees all of them at once instead of one per restart.
 */
export function loadConfig(env: Env): Config {
  const problems: string[] = [];

  const nodeEnv = readEnum(env, 'NODE_ENV', NODE_ENVS, 'development', problems);
  const port = readInt(env, 'PORT', 3000, problems);
  const mongodbUri = readString(env, 'MONGODB_URI', '');
  if (mongodbUri === '') {
    problems.push('MONGODB_URI is required (e.g. mongodb://localhost:27017/kms)');
  } else if (!/^mongodb(\+srv)?:\/\//.test(mongodbUri)) {
    problems.push('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }

  const aiProvider = readEnum(env, 'AI_PROVIDER', AI_PROVIDERS, 'gemini', problems);
  const apiKeyVar = API_KEY_VAR[aiProvider];
  let aiApiKey: string | null = null;
  if (apiKeyVar !== null) {
    const key = readString(env, apiKeyVar, '');
    if (key === '') {
      problems.push(`${apiKeyVar} is required when AI_PROVIDER=${aiProvider}`);
    } else {
      aiApiKey = key;
    }
  }

  const aiModelRaw = readString(env, 'AI_MODEL', '');
  const aiConcurrency = readInt(env, 'AI_CONCURRENCY', 2, problems);
  const maxUploadMb = readInt(env, 'MAX_UPLOAD_MB', 10, problems);
  const logLevel = readEnum(env, 'LOG_LEVEL', LOG_LEVELS, 'info', problems);
  const clientDistDir = readString(env, 'CLIENT_DIST_DIR', '../client/dist');

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  }

  return {
    nodeEnv,
    port,
    mongodbUri,
    aiProvider,
    aiApiKey,
    aiModel: aiModelRaw === '' ? null : aiModelRaw,
    aiConcurrency,
    maxUploadMb,
    logLevel,
    clientDistDir,
  };
}

/** Safe to log: never includes the API key. */
export function describeConfig(config: Config): Record<string, unknown> {
  const { aiApiKey: _aiApiKey, mongodbUri, ...rest } = config;
  return { ...rest, mongodbHost: redactMongoUri(mongodbUri) };
}

function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/[^@/]*@/, '//***@');
}
