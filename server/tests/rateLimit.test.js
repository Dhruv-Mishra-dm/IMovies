import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { testApp, browser, uniqueEmail, PASSWORD } from './helpers/http.js';

describe('rate limiting', () => {
  before(async () => {
    await connectTestDB();
    await clearTestDB();
  });
  after(disconnectTestDB);

  it('blocks the 11th login attempt for the same email within 15 minutes, but not other emails', async () => {
    const app = testApp({ rateLimitEnabled: true });
    const email = uniqueEmail('target');
    for (let i = 0; i < 10; i += 1) {
      const res = await browser(app).post('/api/auth/login', { email, password: 'wrong password 1' });
      assert.equal(res.status, 401);
    }
    const blocked = await browser(app).post('/api/auth/login', { email, password: PASSWORD });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'RATE_LIMITED');
    assert.ok(blocked.headers.ratelimit, 'RateLimit header tells the client when to retry');

    const other = await browser(app).post('/api/auth/login', { email: uniqueEmail('other'), password: PASSWORD });
    assert.equal(other.status, 401); // still allowed to try (and fail)
  });

  it('limits registrations per network to 5 per hour', async () => {
    const app = testApp({ rateLimitEnabled: true });
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await browser(app).post('/api/auth/register', { name: 'R', email: uniqueEmail('reg'), password: PASSWORD })).status, 201);
    }
    const blocked = await browser(app).post('/api/auth/register', { name: 'R', email: uniqueEmail('reg'), password: PASSWORD });
    assert.equal(blocked.status, 429);
  });
});
