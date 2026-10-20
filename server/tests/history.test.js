import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { testApp, registeredCustomer } from './helpers/http.js';
import { createShowtime } from './helpers/factories.js';
import { clock, minutes } from '../src/utils/clock.js';

const app = testApp();

describe('booking history', () => {
  before(connectTestDB);
  after(disconnectTestDB);
  beforeEach(clearTestDB);
  afterEach(() => clock.reset());

  it('separates upcoming from past/cancelled bookings and only shows my own', async () => {
    const me = await registeredCustomer(app);
    const other = await registeredCustomer(app);
    const book = async (client, startsInMinutes, seat, { pay = true } = {}) => {
      const show = await createShowtime({ startsInMinutes });
      const b = (await client.post('/api/bookings', { showtimeId: show.id, seatIds: [seat] })).body.booking;
      if (pay) await client.post(`/api/bookings/${b.id}/payments`, { outcome: 'SUCCESS' }).set('Idempotency-Key', randomUUID());
      return b;
    };
    const soon = await book(me.client, 300, 'A1');
    const later = await book(me.client, 3000, 'A1');
    const cancelled = await book(me.client, 4000, 'A1');
    await me.client.post(`/api/bookings/${cancelled.id}/cancel`);
    const holding = await book(me.client, 5000, 'A1', { pay: false });
    const finished = await book(me.client, 30, 'A1');
    await book(other.client, 600, 'A1');
    clock.advance(minutes(240)); // `finished` is now in the past
    await me.client.post('/api/auth/refresh').expect(200); // the 15-minute access token expired meanwhile, as in a browser

    const upcomingRes = await me.client.get('/api/bookings?scope=upcoming');
    assert.equal(upcomingRes.status, 200, JSON.stringify(upcomingRes.body));
    const upcoming = upcomingRes.body;
    assert.deepEqual(upcoming.items.map((b) => b.id), [soon.id, later.id]); // soonest first; the hold expired meanwhile
    const past = (await me.client.get('/api/bookings?scope=past')).body;
    assert.deepEqual(past.items.map((b) => b.id).sort(), [cancelled.id, holding.id, finished.id].sort());
    assert.equal(past.items.find((b) => b.id === cancelled.id).status, 'CANCELLED');
    assert.equal((await me.client.get('/api/bookings?scope=all')).body.total, 5);
    assert.equal((await request(app).get('/api/bookings')).status, 401);
    assert.equal((await me.client.get('/api/bookings?scope=nope')).status, 400);
  });
});
