import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnv, databaseNameFromUri, EnvValidationError } from '../src/config/env.js';

const DEV_URI = 'mongodb://127.0.0.1:27017/imovies?replicaSet=rs0';
const TEST_URI = 'mongodb://127.0.0.1:27017/imovies_test?replicaSet=rs0';
const valid = {
  NODE_ENV: 'development',
  PORT: '5000',
  MONGODB_URI: DEV_URI,
  MONGODB_URI_TEST: TEST_URI,
  CLIENT_ORIGIN: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
};

function expectInvalid(overrides, pattern) {
  assert.throws(() => loadEnv({ ...valid, ...overrides }), (err) => {
    assert.ok(err instanceof EnvValidationError);
    assert.match(err.message, pattern);
    return true;
  });
}

describe('loadEnv()', () => {
  it('accepts a valid development configuration and applies defaults', () => {
    const env = loadEnv({ ...valid, PORT: undefined, NODE_ENV: undefined });
    assert.equal(env.nodeEnv, 'development');
    assert.equal(env.port, 5000);
    assert.equal(env.mongodbUri, DEV_URI);
    assert.equal(env.logPretty, true);
  });

  it('rejects a non-numeric PORT (the audit defect) instead of crashing later', () => {
    expectInvalid({ PORT: 'abc' }, /PORT/);
  });

  it('rejects out-of-range and fractional ports', () => {
    expectInvalid({ PORT: '70000' }, /PORT/);
    expectInvalid({ PORT: '0' }, /PORT/);
    expectInvalid({ PORT: '50.5' }, /PORT/);
  });

  it('requires MONGODB_URI and CLIENT_ORIGIN', () => {
    expectInvalid({ MONGODB_URI: undefined }, /MONGODB_URI/);
    expectInvalid({ CLIENT_ORIGIN: undefined }, /CLIENT_ORIGIN/);
  });

  it('rejects a CLIENT_ORIGIN with a path or trailing slash', () => {
    expectInvalid({ CLIENT_ORIGIN: 'http://localhost:5173/' }, /CLIENT_ORIGIN/);
    expectInvalid({ CLIENT_ORIGIN: 'http://localhost:5173/app' }, /CLIENT_ORIGIN/);
  });

  it('rejects a MONGODB_URI without a database name', () => {
    expectInvalid({ MONGODB_URI: 'mongodb://127.0.0.1:27017' }, /MONGODB_URI/);
  });

  it('never echoes variable values in error messages', () => {
    const secretUri = 'mongodb://user:SuperSecret123@db.example.com';
    assert.throws(() => loadEnv({ ...valid, MONGODB_URI: secretUri }), (err) => {
      assert.doesNotMatch(err.message, /SuperSecret123/);
      return true;
    });
  });

  describe('test-database guard (NODE_ENV=test)', () => {
    it('uses MONGODB_URI_TEST in test mode', () => {
      const env = loadEnv({ ...valid, NODE_ENV: 'test' });
      assert.equal(env.mongodbUri, TEST_URI);
      assert.equal(env.logLevel, 'silent');
    });

    it('requires MONGODB_URI_TEST', () => {
      expectInvalid({ NODE_ENV: 'test', MONGODB_URI_TEST: undefined }, /MONGODB_URI_TEST is required/);
    });

    it('refuses the development database', () => {
      expectInvalid({ NODE_ENV: 'test', MONGODB_URI_TEST: DEV_URI }, /different database/);
    });

    it('refuses a database whose name does not end with _test', () => {
      expectInvalid({ NODE_ENV: 'test', MONGODB_URI_TEST: 'mongodb://127.0.0.1:27017/imovies_staging' }, /_test/);
    });
  });

  describe('auth settings', () => {
    it('requires a long JWT secret', () => {
      expectInvalid({ JWT_ACCESS_SECRET: undefined }, /JWT_ACCESS_SECRET/);
      expectInvalid({ JWT_ACCESS_SECRET: 'short' }, /JWT_ACCESS_SECRET must be at least 32/);
      expectInvalid({ JWT_ACCESS_SECRET: 'replace-with-a-long-random-value-from-the-command-above' }, /placeholder/);
    });

    it('defaults to bcrypt cost 12, insecure cookies in development and secure cookies in production', () => {
      const dev = loadEnv(valid);
      assert.equal(dev.bcryptCost, 12);
      assert.equal(dev.cookieSecure, false);
      assert.equal(loadEnv({ ...valid, NODE_ENV: 'production' }).cookieSecure, true);
    });

    it('enforces production safety rules', () => {
      expectInvalid({ NODE_ENV: 'production', BCRYPT_COST: '10' }, /BCRYPT_COST must be at least 12 in production/);
      expectInvalid({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }, /COOKIE_SECURE/);
      expectInvalid({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'test-only-secret-not-for-production-use-0123456789' }, /test secret/);
    });
  });

  it('extracts database names from URIs', () => {
    assert.equal(databaseNameFromUri(DEV_URI), 'imovies');
    assert.equal(databaseNameFromUri('mongodb+srv://u:p@cluster.example.net/shop_test?retryWrites=true'), 'shop_test');
    assert.equal(databaseNameFromUri('mongodb://127.0.0.1:27017'), null);
  });
});

describe('server startup with invalid configuration', () => {
  const serverDir = fileURLToPath(new URL('..', import.meta.url));

  function startServer(envOverrides) {
    return spawnSync(process.execPath, ['src/server.js'], {
      cwd: serverDir,
      env: { ...process.env, ...envOverrides },
      encoding: 'utf8',
      timeout: 15_000,
    });
  }

  it('exits with code 1 and a clear message for PORT=abc, before touching the database', () => {
    const result = startServer({ NODE_ENV: 'development', PORT: 'abc', LOG_PRETTY: 'false' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /PORT/);
    assert.doesNotMatch(result.stderr, /RangeError|at Server\.listen/);
    assert.doesNotMatch(result.stdout, /MongoDB connected/);
  });

  it('refuses to start in test mode when the test DB is the dev DB, without printing the URI', () => {
    const result = startServer({ NODE_ENV: 'test', MONGODB_URI: DEV_URI, MONGODB_URI_TEST: DEV_URI });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MONGODB_URI_TEST must use a different database/);
    assert.doesNotMatch(result.stderr, /127\.0\.0\.1/);
  });
});
