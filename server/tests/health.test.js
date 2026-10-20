import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectTestDB, disconnectTestDB } from './helpers/db.js';

const CLIENT_ORIGIN = 'http://localhost:5173';

const app = createApp({ clientOrigin: CLIENT_ORIGIN });

describe('GET /api/health without a database connection', () => {
  it('responds 503 and reports the DB as disconnected', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 503);
    assert.equal(res.body.status, 'degraded');
    assert.equal(res.body.db.connected, false);
    assert.equal(res.body.db.writable, false);
  });
});

describe('GET /api/health with the Docker database', () => {
  before(async () => {
    await connectTestDB();
  });
  after(async () => {
    await disconnectTestDB();
  });

  it('responds 200 with replica set and transaction support', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.db.connected, true);
    assert.equal(res.body.db.writable, true);
    assert.equal(res.body.db.name, 'imovies_test');
    assert.equal(res.body.db.replicaSet, 'rs0');
    assert.equal(res.body.db.transactionsSupported, true);
  });
});

describe('app basics', () => {
  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
    assert.match(res.body.error.message, /Route not found/);
  });

  it('allows CORS only for the configured client origin', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', CLIENT_ORIGIN);
    assert.equal(allowed.headers['access-control-allow-origin'], CLIENT_ORIGIN);
    assert.equal(allowed.headers['access-control-allow-credentials'], 'true');

    const blocked = await request(app).get('/api/health').set('Origin', 'http://evil.example');
    assert.equal(blocked.headers['access-control-allow-origin'], undefined);
  });

  it('sets security headers and hides the Express fingerprint', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });
});
