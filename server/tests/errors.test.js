import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/errorHandlers.js';
import { validate } from '../src/middleware/validate.js';
import { AppError } from '../src/utils/AppError.js';
import { idParams } from '../src/utils/validation.js';

const app = createApp({ clientOrigin: 'http://localhost:5173' });

/** A tiny app that routes a thrown error through the real error handler. */
function appThrowing(err) {
  const a = express();
  a.get('/boom', () => {
    throw err;
  });
  a.use(errorHandler);
  return a;
}

describe('consistent error responses', () => {
  it('returns 400 INVALID_JSON for malformed JSON bodies', async () => {
    const res = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{"broken":');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  it('returns 413 PAYLOAD_TOO_LARGE above the 100kb body limit', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(110 * 1024) }));
    assert.equal(res.status, 413);
    assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  it('includes a request id in the header and in error bodies', async () => {
    const res = await request(app).get('/api/nope');
    assert.match(res.headers['x-request-id'], /^[0-9a-f-]{36}$/);
    assert.equal(res.body.error.requestId, res.headers['x-request-id']);
  });

  it('hides internal details of unexpected errors', async () => {
    const res = await request(appThrowing(new Error('db password is hunter2'))).get('/boom');
    assert.equal(res.status, 500);
    assert.deepEqual(Object.keys(res.body.error).sort(), ['code', 'message']);
    assert.equal(res.body.error.code, 'INTERNAL_ERROR');
    assert.equal(res.body.error.message, 'Internal server error');
    assert.doesNotMatch(res.text, /hunter2|at .*\.js/);
  });

  it('passes AppError status, code, message and details through', async () => {
    const res = await request(appThrowing(new AppError(409, 'SEAT_UNAVAILABLE', 'Seat taken', { seats: ['A1'] }))).get('/boom');
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.error, { code: 'SEAT_UNAVAILABLE', message: 'Seat taken', details: { seats: ['A1'] } });
  });

  it('maps a Mongoose CastError to 400 INVALID_ID', async () => {
    const res = await request(appThrowing(new mongoose.Error.CastError('ObjectId', 'abc', '_id'))).get('/boom');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_ID');
  });

  it('maps a Mongoose ValidationError to 400 with field details', async () => {
    const err = new mongoose.Error.ValidationError();
    err.addError('title', new mongoose.Error.ValidatorError({ path: 'title', message: 'Title is required' }));
    const res = await request(appThrowing(err)).get('/boom');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(res.body.error.details, [{ path: 'title', message: 'Title is required' }]);
  });

  it('maps a duplicate-key error to 409 without echoing the duplicate value', async () => {
    const dup = Object.assign(new Error('E11000 duplicate key error dup key: { email: "a@b.com" }'), {
      code: 11000,
      keyPattern: { email: 1 },
    });
    const res = await request(appThrowing(dup)).get('/boom');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DUPLICATE');
    assert.deepEqual(res.body.error.details, { fields: ['email'] });
    assert.doesNotMatch(res.text, /a@b\.com/);
  });
});

describe('validate() middleware', () => {
  const body = z.object({ title: z.string().min(1), seats: z.number().int().positive() });
  const a = express();
  a.use(express.json());
  a.post('/items/:id', validate({ params: idParams, body }), (req, res) => res.json(req.validated));
  a.use(errorHandler);

  it('passes parsed values on req.validated and drops unknown fields (mass assignment)', async () => {
    const res = await request(a)
      .post('/items/507f1f77bcf86cd799439011')
      .send({ title: 'Dune', seats: 2, role: 'admin', price: 0 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.body, { title: 'Dune', seats: 2 });
  });

  it('rejects an invalid ObjectId before any database call', async () => {
    const res = await request(a).post('/items/not-an-id').send({ title: 'Dune', seats: 2 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(res.body.error.details[0], { location: 'params', path: 'id', message: 'must be a valid id' });
  });

  it('rejects MongoDB operator objects where a value is expected (NoSQL injection)', async () => {
    const res = await request(a).post('/items/507f1f77bcf86cd799439011').send({ title: { $gt: '' }, seats: 1 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].path, 'title');
  });

  it('reports every invalid field at once', async () => {
    const res = await request(a).post('/items/507f1f77bcf86cd799439011').send({ seats: -1 });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details.map((d) => d.path).sort(), ['seats', 'title']);
  });
});
