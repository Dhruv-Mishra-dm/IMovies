import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { testApp, browser, adminClient, registeredCustomer, PASSWORD, ORIGIN } from './helpers/http.js';
import { createMovie } from './helpers/factories.js';
import { Movie } from '../src/models/index.js';

const app = testApp();

describe('security probes', () => {
  before(connectTestDB);
  after(disconnectTestDB);
  beforeEach(clearTestDB);

  describe('NoSQL injection', () => {
    it('treats operator syntax in query strings as plain keys (it cannot widen a filter)', async () => {
      await createMovie({ title: 'Visible', slug: 'visible' });
      await createMovie({ title: 'Hidden Draft', slug: 'hidden-draft', status: 'DRAFT' });
      // ?status[$ne]=PUBLISHED would expose drafts if objects were parsed from the query string.
      const res = await request(app).get('/api/movies?status[$ne]=PUBLISHED&q[$regex]=.*');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items.map((m) => m.slug), ['visible']);
    });

    it('rejects operator objects in JSON bodies before they reach the database', async () => {
      await registeredCustomer(app, { email: 'victim@example.test' });
      for (const body of [
        { email: { $ne: null }, password: PASSWORD },
        { email: 'victim@example.test', password: { $gt: '' } },
      ]) {
        const res = await browser(app).post('/api/auth/login', body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  describe('XSS via stored URLs', () => {
    it('rejects image URLs that could break out of CSS url("…") or HTML attributes', async () => {
      const { client } = await adminClient(app);
      const base = { title: 'X', genres: ['Drama'], languages: ['Hindi'], durationMins: 100, certification: 'U', releaseDate: '2026-12-01' };
      for (const posterUrl of ['https://cdn.example.com/a.png") ; background:url("https://evil', "https://x.example/a'.png", 'https://x.example/a b.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>']) {
        const res = await client.post('/api/admin/movies', { ...base, posterUrl });
        assert.equal(res.status, 400, posterUrl);
      }
      await assert.rejects(Movie.create({ ...base, slug: 'x', releaseDate: new Date(), backdropUrl: 'https://x.example/a(1).png' }));
      assert.equal((await client.post('/api/admin/movies', { ...base, posterUrl: 'https://cdn.example.com/posters/x-1.png' })).status, 201);
    });
  });

  describe('cross-origin requests', () => {
    it('gives a foreign site no CORS permission, not even on a preflight', async () => {
      const res = await request(app).options('/api/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
      assert.equal(res.headers['access-control-allow-origin'], undefined);
      assert.equal(res.headers['access-control-allow-credentials'], undefined);
    });

    it('refuses a logged-in user’s state-changing request that comes from another site (CSRF)', async () => {
      const { client } = await registeredCustomer(app);
      const forged = await client.agent.post('/api/auth/logout-all').set('Origin', 'https://evil.example');
      assert.equal(forged.status, 403);
      assert.equal((await client.get('/api/auth/me')).status, 200); // still logged in: nothing happened
    });
  });

  describe('headers and error responses', () => {
    it('sends security headers on API responses', async () => {
      const res = await request(app).get('/api/health');
      assert.match(res.headers['content-security-policy'], /default-src 'self'/);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
      assert.ok(res.headers['strict-transport-security']);
      assert.equal(res.headers['x-powered-by'], undefined);
    });

    it('answers malformed URL encoding with 400 (not a 500 server error), without internals', async () => {
      for (const path of ['/api/movies/%E0%A4%A', '/api/showtimes/%ZZ', '/api/bookings/%E0']) {
        const res = await request(app).get(path);
        assert.equal(res.status, 400, path);
        assert.equal(res.body.error.code, 'BAD_REQUEST');
        assert.doesNotMatch(res.text, /\bat \w+.*\.js:\d+|node_modules|Failed to decode|stack/);
      }
    });
  });

  describe('authorization boundaries', () => {
    it('rejects every admin endpoint for customers', async () => {
      const { client } = await registeredCustomer(app);
      const id = '507f1f77bcf86cd799439011';
      const calls = [
        client.get('/api/admin/stats'),
        client.get('/api/admin/movies'),
        client.post('/api/admin/movies', {}),
        client.get('/api/admin/theatres'),
        client.post(`/api/admin/theatres/${id}/screens`, {}),
        client.patch(`/api/admin/screens/${id}`, {}),
        client.post('/api/admin/showtimes', {}),
        client.post(`/api/admin/showtimes/${id}/cancel`, { reason: 'nope' }),
        client.get('/api/admin/bookings'),
        client.get(`/api/admin/bookings/${id}`),
      ];
      for (const res of await Promise.all(calls)) assert.equal(res.status, 403, res.req.path);
    });

    it('does not let a user become admin through registration or profile updates', async () => {
      const res = await browser(app).post('/api/auth/register', { name: 'Eve', email: 'eve@example.test', password: PASSWORD, role: 'admin', tokenVersion: -1 });
      assert.equal(res.body.user.role, 'customer');
      const client = browser(app);
      await client.post('/api/auth/login', { email: 'eve@example.test', password: PASSWORD });
      await client.patch('/api/auth/me', { name: 'Eve', role: 'admin' });
      assert.equal((await client.get('/api/auth/me')).body.user.role, 'customer');
      assert.equal((await client.get('/api/admin/stats').set('Origin', ORIGIN)).status, 403);
    });
  });
});
