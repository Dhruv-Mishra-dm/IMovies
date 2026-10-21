import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { testApp, browser, registeredCustomer, parseSetCookies, uniqueEmail, PASSWORD, ORIGIN } from './helpers/http.js';
import { User, RefreshSession } from '../src/models/index.js';
import { requireAdmin } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandlers.js';
import { signAccessToken } from '../src/services/tokenService.js';
import { clock, minutes } from '../src/utils/clock.js';

const app = testApp();

/** Reads the raw value of a cookie the agent is holding (to simulate an attacker replaying it). */
function cookieValue(client, name, path = '/api/auth') {
  return client.agent.jar.getCookie(name, { domain: '127.0.0.1', path, script: false, secure: false })?.value;
}

describe('authentication API', () => {
  before(connectTestDB);
  after(disconnectTestDB);
  beforeEach(clearTestDB);
  afterEach(() => clock.reset());

  describe('registration', () => {
    it('creates a customer, hashes the password and sets secure session cookies', async () => {
      const client = browser(app);
      const email = uniqueEmail();
      const res = await client.post('/api/auth/register', { name: 'Asha', email: email.toUpperCase(), password: PASSWORD, role: 'admin' });

      assert.equal(res.status, 201);
      assert.equal(res.body.user.email, email); // normalised
      assert.equal(res.body.user.role, 'customer'); // role in the payload is ignored
      assert.equal(res.body.user.passwordHash, undefined);
      assert.doesNotMatch(res.text, /passwordHash|tokenVersion/);

      const stored = await User.findOne({ email }).select('+passwordHash');
      assert.match(stored.passwordHash, /^\$2[aby]\$04\$/); // bcrypt (cost 4 in tests, 12 by default)
      assert.notEqual(stored.passwordHash, PASSWORD);

      const cookies = parseSetCookies(res);
      for (const name of ['imovies_at', 'imovies_rt']) {
        assert.ok(cookies[name], `${name} set`);
        assert.ok(cookies[name].attributes.includes('httponly'));
        assert.ok(cookies[name].attributes.includes('samesite=strict'));
      }
      assert.ok(cookies.imovies_at.attributes.includes('path=/'));
      assert.ok(cookies.imovies_rt.attributes.includes('path=/api/auth'));
      assert.ok(cookies.imovies_at.attributes.includes('max-age=900')); // 15 minutes
      assert.ok(cookies.imovies_rt.attributes.includes('max-age=604800')); // 7 days

      // the raw refresh token is never stored, only its hash
      const raw = cookieValue(client, 'imovies_rt');
      assert.equal(await RefreshSession.countDocuments({ tokenHash: raw }), 0);
      assert.equal(await RefreshSession.countDocuments(), 1);
    });

    it('rejects a duplicate email regardless of case', async () => {
      const { email } = await registeredCustomer(app);
      const res = await browser(app).post('/api/auth/register', { name: 'B', email: email.toUpperCase(), password: PASSWORD });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'EMAIL_TAKEN');
    });

    it('lets exactly one of 10 simultaneous registrations with the same email succeed', async () => {
      const email = uniqueEmail('race');
      const results = await Promise.all(
        Array.from({ length: 10 }, () => browser(app).post('/api/auth/register', { name: 'Racer', email, password: PASSWORD })),
      );
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 9);
      assert.equal(await User.countDocuments({ email }), 1);
    });

    it('enforces the password policy, including the 72-byte bcrypt limit', async () => {
      const cases = ['short1', 'lettersonlypassword', '12345678901', `a1${'é'.repeat(36)}`];
      for (const password of cases) {
        const res = await browser(app).post('/api/auth/register', { name: 'X', email: uniqueEmail(), password });
        assert.equal(res.status, 400, `password ${password.length} chars should be rejected`);
        assert.equal(res.body.error.details[0].path, 'password');
      }
    });
  });

  describe('login', () => {
    it('logs in with correct credentials', async () => {
      const { email } = await registeredCustomer(app);
      const client = browser(app);
      const res = await client.post('/api/auth/login', { email: ` ${email.toUpperCase()} `, password: PASSWORD });
      assert.equal(res.status, 200);
      assert.equal(res.body.user.email, email);
      assert.equal((await client.get('/api/auth/me')).status, 200);
    });

    it('returns the same generic error for a wrong password and an unknown email', async () => {
      const { email } = await registeredCustomer(app);
      const wrongPassword = await browser(app).post('/api/auth/login', { email, password: 'wrong password 1' });
      const unknownEmail = await browser(app).post('/api/auth/login', { email: uniqueEmail('nobody'), password: PASSWORD });
      for (const res of [wrongPassword, unknownEmail]) {
        assert.equal(res.status, 401);
        assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
        assert.equal(res.body.error.message, 'Invalid email or password');
        assert.equal(res.headers['set-cookie'], undefined);
      }
    });
  });

  describe('access tokens', () => {
    it('requires a session for /me', async () => {
      const res = await request(app).get('/api/auth/me');
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'AUTH_REQUIRED');
    });

    it('expires after 15 minutes and is renewed by refreshing', async () => {
      const { client } = await registeredCustomer(app);
      clock.advance(minutes(14));
      assert.equal((await client.get('/api/auth/me')).status, 200);
      clock.advance(minutes(2));
      const expired = await client.get('/api/auth/me');
      assert.equal(expired.status, 401);
      assert.equal(expired.body.error.code, 'TOKEN_EXPIRED');

      assert.equal((await client.post('/api/auth/refresh')).status, 200);
      assert.equal((await client.get('/api/auth/me')).status, 200);
    });

    it('rejects tampered and unsigned tokens', async () => {
      const { user } = await registeredCustomer(app);
      const forged = jwt.sign({ sub: user.id, ver: 0 }, 'wrong-secret-wrong-secret-wrong-secret', { expiresIn: 900 });
      const unsigned = jwt.sign({ sub: user.id, ver: 0 }, null, { algorithm: 'none' });
      for (const token of [forged, unsigned, 'garbage']) {
        const res = await request(app).get('/api/auth/me').set('Cookie', `imovies_at=${token}`);
        assert.equal(res.status, 401);
        assert.equal(res.body.error.code, 'INVALID_TOKEN');
      }
    });
  });

  describe('refresh-token rotation (business rule 1)', () => {
    it('issues a new refresh token on every refresh', async () => {
      const { client } = await registeredCustomer(app);
      const first = cookieValue(client, 'imovies_rt');
      await client.post('/api/auth/refresh').expect(200);
      const second = cookieValue(client, 'imovies_rt');
      assert.notEqual(first, second);
      assert.equal(await RefreshSession.countDocuments({ usedAt: { $ne: null } }), 1);
    });

    it('detects reuse of a rotated token and revokes the whole family', async () => {
      const { client } = await registeredCustomer(app);
      const stolen = cookieValue(client, 'imovies_rt');
      await client.post('/api/auth/refresh').expect(200); // legitimate rotation

      clock.advance(11_000); // outside the concurrent-refresh grace window
      const replay = await request(app).post('/api/auth/refresh').set('Origin', ORIGIN).set('Cookie', `imovies_rt=${stolen}`);
      assert.equal(replay.status, 401);
      assert.equal(replay.body.error.code, 'REFRESH_REUSED');

      // the legitimate user's current token is now revoked too
      const legit = await client.post('/api/auth/refresh');
      assert.equal(legit.status, 401);
      assert.equal(legit.body.error.code, 'SESSION_REVOKED');
      assert.equal(await RefreshSession.countDocuments({ revokedAt: null }), 0);
    });

    it('treats a reuse within the grace window as a harmless race (409, no revocation)', async () => {
      const { client } = await registeredCustomer(app);
      const old = cookieValue(client, 'imovies_rt');
      await client.post('/api/auth/refresh').expect(200);
      const race = await request(app).post('/api/auth/refresh').set('Origin', ORIGIN).set('Cookie', `imovies_rt=${old}`);
      assert.equal(race.status, 409);
      assert.equal(race.body.error.code, 'REFRESH_CONFLICT');
      assert.equal((await client.post('/api/auth/refresh')).status, 200);
    });

    it('lets only one of several simultaneous refreshes with the same token rotate it', async () => {
      const { client } = await registeredCustomer(app);
      const token = cookieValue(client, 'imovies_rt');
      const results = await Promise.all(
        Array.from({ length: 5 }, () => request(app).post('/api/auth/refresh').set('Origin', ORIGIN).set('Cookie', `imovies_rt=${token}`)),
      );
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      assert.ok(results.every((r) => r.status === 200 || r.status === 409));
    });

    it('rejects an expired refresh token after 7 days', async () => {
      const { client } = await registeredCustomer(app);
      clock.advance(7 * 24 * 60 * minutes(1) + 1000);
      const res = await client.post('/api/auth/refresh');
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'SESSION_EXPIRED');
    });

    it('requires a refresh cookie', async () => {
      const res = await browser(app).post('/api/auth/refresh');
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'REFRESH_REQUIRED');
    });
  });

  describe('logout and revocation', () => {
    it('logout clears cookies and kills the refresh token', async () => {
      const { client } = await registeredCustomer(app);
      const token = cookieValue(client, 'imovies_rt');
      const res = await client.post('/api/auth/logout');
      assert.equal(res.status, 204);
      const cleared = parseSetCookies(res);
      assert.equal(cleared.imovies_at.value, '');
      assert.equal(cleared.imovies_rt.value, '');
      const reuse = await request(app).post('/api/auth/refresh').set('Origin', ORIGIN).set('Cookie', `imovies_rt=${token}`);
      assert.equal(reuse.status, 401);
    });

    it('logout-all invalidates access tokens immediately on every device', async () => {
      const { client, email } = await registeredCustomer(app);
      const otherDevice = browser(app);
      await otherDevice.post('/api/auth/login', { email, password: PASSWORD }).expect(200);

      await client.post('/api/auth/logout-all').expect(204);
      const other = await otherDevice.get('/api/auth/me');
      assert.equal(other.status, 401);
      assert.equal(other.body.error.code, 'SESSION_REVOKED');
      assert.equal((await otherDevice.post('/api/auth/refresh')).status, 401);
    });

    it('changing the password revokes other sessions and keeps this one', async () => {
      const { client, email } = await registeredCustomer(app);
      const otherDevice = browser(app);
      await otherDevice.post('/api/auth/login', { email, password: PASSWORD }).expect(200);

      const wrong = await client.post('/api/auth/change-password', { currentPassword: 'nope nope 1', newPassword: 'new secret 99' });
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.error.code, 'INVALID_CURRENT_PASSWORD');

      await client.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'new secret 99' }).expect(200);
      assert.equal((await client.get('/api/auth/me')).status, 200);
      assert.equal((await otherDevice.get('/api/auth/me')).status, 401);
      assert.equal((await browser(app).post('/api/auth/login', { email, password: PASSWORD })).status, 401);
      assert.equal((await browser(app).post('/api/auth/login', { email, password: 'new secret 99' })).status, 200);
    });

    it('updates the profile name but nothing else', async () => {
      const { client } = await registeredCustomer(app);
      const res = await client.patch('/api/auth/me', { name: '  Asha K  ', role: 'admin', email: 'x@example.test' });
      assert.equal(res.status, 200);
      assert.equal(res.body.user.name, 'Asha K');
      assert.equal(res.body.user.role, 'customer');
      assert.notEqual(res.body.user.email, 'x@example.test');
    });
  });

  describe('role-based authorization', () => {
    const adminApp = express();
    adminApp.use(cookieParser());
    adminApp.get('/admin-only', requireAdmin, (req, res) => res.json({ ok: true }));
    adminApp.use(errorHandler);

    it('allows admins, forbids customers and rejects anonymous users', async () => {
      const customer = await User.create({ name: 'C', email: uniqueEmail(), passwordHash: 'x' });
      const admin = await User.create({ name: 'A', email: uniqueEmail(), passwordHash: 'x', role: 'admin' });
      const as = (user) => request(adminApp).get('/admin-only').set('Cookie', `imovies_at=${signAccessToken(user)}`);

      assert.equal((await request(adminApp).get('/admin-only')).status, 401);
      const forbidden = await as(customer);
      assert.equal(forbidden.status, 403);
      assert.equal(forbidden.body.error.code, 'FORBIDDEN');
      assert.equal((await as(admin)).status, 200);
    });

    it('applies a role change immediately, even with an old token', async () => {
      const admin = await User.create({ name: 'A', email: uniqueEmail(), passwordHash: 'x', role: 'admin' });
      const token = signAccessToken(admin);
      await User.updateOne({ _id: admin._id }, { $set: { role: 'customer' } });
      const res = await request(adminApp).get('/admin-only').set('Cookie', `imovies_at=${token}`);
      assert.equal(res.status, 403);
    });
  });

  describe('CSRF protection (Origin check)', () => {
    it('rejects state-changing requests without an Origin or from another site', async () => {
      const missing = await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
      assert.equal(missing.status, 403);
      assert.equal(missing.body.error.code, 'ORIGIN_REQUIRED');

      const evil = await request(app).post('/api/auth/logout').set('Origin', 'https://evil.example');
      assert.equal(evil.status, 403);
      assert.equal(evil.body.error.code, 'ORIGIN_NOT_ALLOWED');
    });

    it('accepts a same-origin Referer when Origin is absent and never blocks GET', async () => {
      const viaReferer = await request(app).post('/api/auth/logout').set('Referer', `${ORIGIN}/account`);
      assert.equal(viaReferer.status, 204);
      assert.equal((await request(app).get('/api/health')).status !== 403, true);
    });
  });
});
