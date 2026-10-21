import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { testApp } from './helpers/http.js';

describe('serving the built website from the API (production option)', () => {
  let dist;
  let app;

  before(() => {
    dist = mkdtempSync(path.join(tmpdir(), 'imovies-dist-'));
    mkdirSync(path.join(dist, 'assets'));
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>IMovies</title><div id="root"></div>');
    writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
    app = testApp({ clientDistDir: dist });
  });
  after(() => rmSync(dist, { recursive: true, force: true }));

  it('serves index.html for the home page and for client-side routes, with a strict CSP', async () => {
    for (const url of ['/', '/movies/the-monsoon-cipher', '/bookings/abc/checkout']) {
      const res = await request(app).get(url).set('Accept', 'text/html');
      assert.equal(res.status, 200, url);
      assert.match(res.text, /<div id="root">/);
      assert.equal(res.headers['cache-control'], 'no-cache');
      const csp = res.headers['content-security-policy'];
      assert.match(csp, /script-src 'self'/);
      assert.match(csp, /img-src 'self' data: https:/);
      assert.match(csp, /frame-ancestors 'none'/);
    }
  });

  it('serves hashed assets with long-lived caching', async () => {
    const res = await request(app).get('/assets/index-abc123.js');
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'], /max-age=31536000, immutable/);
  });

  it('keeps API errors as JSON (no HTML fallback for /api)', async () => {
    const res = await request(app).get('/api/nope').set('Accept', 'text/html');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
  });

  it('is off unless configured', async () => {
    const res = await request(testApp({ clientDistDir: null })).get('/').set('Accept', 'text/html');
    assert.equal(res.status, 404);
  });
});
