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
    // Signs access tokens. Generate with:  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters (generate a random value)'),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
    COOKIE_SECURE: booleanString.optional(),
    // Number of reverse proxies in front of the API (needed for correct client IPs in rate limiting). 0 = none.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    RATE_LIMIT_ENABLED: booleanString.optional(),
  })
  .superRefine((vars, ctx) => {
    // The .env.example placeholder is long enough to pass the length check, so reject it explicitly.
    if (vars.JWT_ACCESS_SECRET?.startsWith('replace-with')) {
      ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'is still the .env.example placeholder — generate a real value' });
    }
    if (vars.NODE_ENV === 'production') {
      if (vars.BCRYPT_COST < 12) ctx.addIssue({ code: 'custom', path: ['BCRYPT_COST'], message: 'must be at least 12 in production' });
      if (vars.COOKIE_SECURE === false) ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'must not be false in production (HTTPS only)' });
      if (/test-only/i.test(vars.JWT_ACCESS_SECRET)) ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'must not be the test secret in production' });
    }
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
    jwtAccessSecret: vars.JWT_ACCESS_SECRET,
    bcryptCost: vars.BCRYPT_COST,
    // Secure cookies are only sent over HTTPS. Browsers allow them on http://localhost too,
    // but we default to false in development so other local hostnames keep working.
    cookieSecure: vars.COOKIE_SECURE ?? vars.NODE_ENV === 'production',
    trustProxy: vars.TRUST_PROXY,
    rateLimitEnabled: vars.RATE_LIMIT_ENABLED ?? true,
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
