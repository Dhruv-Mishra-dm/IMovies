// Loaded with `node --import` BEFORE any test file, so every module sees NODE_ENV=test.
// That switches the app to MONGODB_URI_TEST and activates the test-database guard in config/env.js.
process.env.NODE_ENV = 'test';

// Test-only values (never used outside tests; production rejects this secret):
process.env.JWT_ACCESS_SECRET = 'test-only-secret-not-for-production-use-0123456789';
process.env.BCRYPT_COST = '4'; // fast hashing in tests; production enforces >= 12
// Rate limits are disabled for most tests (many logins from one "IP"); tests/rateLimit.test.js enables them.
process.env.RATE_LIMIT_ENABLED = 'false';
