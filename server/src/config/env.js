import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load server/.env into process.env using Node's built-in loader (no dotenv needed).
// Variables already set in the real environment win, which is what hosting platforms expect.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

/** Returns the database name from a MongoDB URI, e.g. "imovies" from mongodb://host/imovies?x=y */
export function databaseNameFromUri(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/.exec(uri);
  return match?.[1] || null;
}

const mongoUri = z
  .string()
  .regex(/^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/, 'must look like mongodb://host:port/databaseName');

// A browser origin is scheme + host + optional port, with no path, e.g. http://localhost:5173
const origin = z.string().refine((value) => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}, 'must be an origin like http://localhost:5173 (no path or trailing slash)');

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    MONGODB_URI: mongoUri,
    MONGODB_URI_TEST: mongoUri.optional(),
    CLIENT_ORIGIN: origin,
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    LOG_PRETTY: booleanString.optional(),
  })
  .superRefine((vars, ctx) => {
    if (vars.NODE_ENV !== 'test') return;

    // Safety guard: tests create and delete data, so they must never point at the dev database.
    if (!vars.MONGODB_URI_TEST) {
      ctx.addIssue({ code: 'custom', path: ['MONGODB_URI_TEST'], message: 'is required when NODE_ENV=test' });
      return;
    }
    const testDb = databaseNameFromUri(vars.MONGODB_URI_TEST);
    const devDb = databaseNameFromUri(vars.MONGODB_URI);
    if (!testDb?.endsWith('_test')) {
      ctx.addIssue({ code: 'custom', path: ['MONGODB_URI_TEST'], message: 'database name must end with "_test"' });
    }
    if (testDb === devDb) {
      ctx.addIssue({ code: 'custom', path: ['MONGODB_URI_TEST'], message: 'must use a different database from MONGODB_URI' });
    }
  });

export class EnvValidationError extends Error {}

/**
 * Validates environment variables and returns a frozen config object.
 * Error messages name the variable and the rule but never echo the value (it may be a secret).
 */
export function loadEnv(source = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'} ${issue.message}`);
    throw new EnvValidationError(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  const vars = result.data;
  const isTest = vars.NODE_ENV === 'test';

  return Object.freeze({
    nodeEnv: vars.NODE_ENV,
    isProduction: vars.NODE_ENV === 'production',
    isTest,
    port: vars.PORT,
    // In tests the app talks to the (guarded) test database, never the dev database.
    mongodbUri: isTest ? vars.MONGODB_URI_TEST : vars.MONGODB_URI,
    clientOrigin: vars.CLIENT_ORIGIN,
    logLevel: vars.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
    logPretty: vars.LOG_PRETTY ?? vars.NODE_ENV === 'development',
  });
}

function loadOrExit() {
  try {
    return loadEnv();
  } catch (err) {
    if (!(err instanceof EnvValidationError)) throw err;
    // The logger isn't available yet (it depends on this config), so print directly.
    console.error(`${err.message}\nSee server/.env.example for the expected format.`);
    process.exit(1);
  }
}

export const env = loadOrExit();
