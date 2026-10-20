import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { testApp, registeredCustomer, adminClient } from './helpers/http.js';
import { createShowtime } from './helpers/factories.js';
import { Booking, SeatReservation, Showtime } from '../src/models/index.js';
import { sweepExpiredHolds } from '../src/services/holdService.js';
import { bus } from '../src/events/bus.js';
import { clock, minutes } from '../src/utils/clock.js';

const app = testApp();

/** Collects events published on the bus while `fn` runs. */
async function captureEvents(fn) {
  const events = [];
  const listener = (name) => (payload) => events.push({ name, payload });
  const handlers = Object.fromEntries(['seats.changed', 'booking.updated'].map((n) => [n, listener(n)]));
  for (const [n, h] of Object.entries(handlers)) bus.on(n, h);
  try {
    await fn();
  } finally {
    for (const [n, h] of Object.entries(handlers)) bus.off(n, h);
  }
  return events;
}

const hold = (client, showtime, seatIds, extra = {}) => client.post('/api/bookings', { showtimeId: showtime.id, seatIds, ...extra });

describe('seat holds and the booking engine', () => {
  before(connectTestDB);
  after(disconnectTestDB);
  beforeEach(clearTestDB);
  afterEach(() => clock.reset());

  describe('creating a hold', () => {
    it('holds seats for 10 minutes at server-calculated prices, ignoring client prices and status', async () => {
      const showtime = await createShowtime();
      const { client, user } = await registeredCustomer(app);
      const res = await hold(client, showtime, ['A1', 'C2'], { totalAmount: 1, price: 0, status: 'CONFIRMED', userId: 'someone-else' });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const b = res.body.booking;
      assert.equal(b.status, 'HELD');
      assert.match(b.reference, /^IMV-[A-Z2-9]{8}$/);
      assert.deepEqual(
        b.seats.map((s) => [s.seatId, s.category, s.price]),
        [
          ['A1', 'CLASSIC', 20000],
          ['C2', 'RECLINER', 45000],
        ],
      );
      assert.equal(b.totalAmount, 65000);
      assert.equal(b.currency, 'INR');
      const remaining = new Date(b.holdExpiresAt) - clock.now(); // measured a few ms after creation
      assert.ok(remaining <= minutes(10) && remaining > minutes(10) - 5000, `remaining ${remaining} ms`);
      assert.equal(b.user, user.id);
      assert.equal(b.snapshot.movie.title.startsWith('Test Movie'), true);
      assert.equal(await SeatReservation.countDocuments({ booking: b.id, status: 'HELD' }), 2);
    });

    it('rejects unknown, out-of-service, duplicate and too many seats', async () => {
      const showtime = await createShowtime();
      const { client } = await registeredCustomer(app);
      const unknown = await hold(client, showtime, ['A1', 'Z9']);
      assert.equal(unknown.status, 400);
      assert.equal(unknown.body.error.code, 'INVALID_SEATS');
      assert.deepEqual(unknown.body.error.details.seats, ['Z9']);
      assert.deepEqual((await hold(client, showtime, ['A6'])).body.error.details.seats, ['A6']); // disabled seat
      assert.equal((await hold(client, showtime, ['A1', 'A1'])).status, 400);
      assert.equal((await hold(client, showtime, ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'])).status, 400);
      assert.equal((await hold(client, showtime, [])).status, 400);
      assert.equal(await SeatReservation.countDocuments(), 0);
    });

    it('refuses shows that started, were cancelled or do not exist', async () => {
      const { client } = await registeredCustomer(app);
      const started = await createShowtime({ startsInMinutes: -5 });
      const cancelled = await createShowtime({ status: 'CANCELLED' });
      assert.equal((await hold(client, started, ['A1'])).body.error.code, 'SHOWTIME_UNAVAILABLE');
      assert.equal((await hold(client, cancelled, ['A1'])).body.error.code, 'SHOWTIME_UNAVAILABLE');
      assert.equal((await client.post('/api/bookings', { showtimeId: '507f1f77bcf86cd799439011', seatIds: ['A1'] })).status, 404);
    });

    it('requires a customer account', async () => {
      const showtime = await createShowtime();
      assert.equal((await request(app).post('/api/bookings').set('Origin', 'http://localhost:5173').send({ showtimeId: showtime.id, seatIds: ['A1'] })).status, 401);
      const { client: admin } = await adminClient(app);
      assert.equal((await hold(admin, showtime, ['A1'])).status, 403);
    });
  });

  describe('concurrency — the double-booking guarantee', () => {
    it('lets exactly ONE of 20 customers competing for the same seat succeed', async () => {
      const showtime = await createShowtime();
      const customers = await Promise.all(Array.from({ length: 20 }, () => registeredCustomer(app)));
      const results = await Promise.all(customers.map(({ client }) => hold(client, showtime, ['B3'])));

      const winners = results.filter((r) => r.status === 201);
      const losers = results.filter((r) => r.status === 409);
      assert.equal(winners.length, 1, `statuses: ${results.map((r) => r.status)}`);
      assert.equal(losers.length, 19);
      for (const r of losers) {
        assert.equal(r.body.error.code, 'SEATS_UNAVAILABLE');
        assert.deepEqual(r.body.error.details.seats, ['B3']);
      }
      assert.equal(await SeatReservation.countDocuments({ showtime: showtime._id, seatId: 'B3' }), 1);
      assert.equal(await Booking.countDocuments({ showtime: showtime._id }), 1); // no orphan bookings from the losers
    });

    it('never creates partial holds when overlapping multi-seat requests race', async () => {
      const showtime = await createShowtime();
      const requests = [['A1', 'A2'], ['A2', 'A3'], ['A3', 'A4'], ['A4', 'A5'], ['A5', 'A1'], ['B1', 'B2'], ['B2', 'B3']];
      const customers = await Promise.all(requests.map(() => registeredCustomer(app)));
      const results = await Promise.all(customers.map(({ client }, i) => hold(client, showtime, requests[i])));
      assert.ok(results.every((r) => r.status === 201 || r.status === 409), results.map((r) => r.status).join());

      const bookings = await Booking.find({ showtime: showtime._id });
      const reservations = await SeatReservation.find({ showtime: showtime._id });
      const seatIds = reservations.map((r) => r.seatId);
      assert.equal(new Set(seatIds).size, seatIds.length, 'a seat is reserved twice');
      for (const b of bookings) {
        const mine = reservations.filter((r) => String(r.booking) === String(b._id)).map((r) => r.seatId).sort();
        assert.deepEqual(mine, b.seats.map((s) => s.seatId).sort(), 'booking without all of its seats');
      }
      assert.equal(bookings.length, results.filter((r) => r.status === 201).length);
    });

    it('allows only one active hold per customer per show, even on a double-click', async () => {
      const showtime = await createShowtime();
      const { client } = await registeredCustomer(app);
      const results = await Promise.all([hold(client, showtime, ['A1']), hold(client, showtime, ['A2']), hold(client, showtime, ['A3'])]);
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      for (const r of results.filter((x) => x.status !== 201)) assert.equal(r.body.error.code, 'HOLD_EXISTS');
      assert.equal(await Booking.countDocuments({ status: 'HELD' }), 1);
      // the same customer can still hold seats for a different show
      assert.equal((await hold(client, await createShowtime(), ['A1'])).status, 201);
    });
  });

  describe('expiry', () => {
    it('stops blocking a seat the moment the hold expires, even before any clean-up runs', async () => {
      const showtime = await createShowtime();
      const first = await registeredCustomer(app);
      const second = await registeredCustomer(app);
      const original = (await hold(first.client, showtime, ['A1', 'A2'])).body.booking;

      assert.equal((await hold(second.client, showtime, ['A1'])).status, 409);
      clock.advance(minutes(10) + 1000);
      const retry = await hold(second.client, showtime, ['A1']);
      assert.equal(retry.status, 201, JSON.stringify(retry.body));

      const expired = await Booking.findById(original.id);
      assert.equal(expired.status, 'EXPIRED');
      assert.equal(await SeatReservation.countDocuments({ booking: original.id }), 0); // A2 freed too
    });

    it('lets a customer whose hold expired hold seats again', async () => {
      const showtime = await createShowtime();
      const { client } = await registeredCustomer(app);
      await hold(client, showtime, ['A1']);
      clock.advance(minutes(11));
      assert.equal((await hold(client, showtime, ['B1'])).status, 201);
    });

    it('the sweeper expires overdue holds once, leaves live holds alone and announces the freed seats', async () => {
      const showtime = await createShowtime();
      const a = await registeredCustomer(app);
      const b = await registeredCustomer(app);
      await hold(a.client, showtime, ['A1']);
      clock.advance(minutes(6));
      await hold(b.client, showtime, ['B1']);
      clock.advance(minutes(5)); // a's hold is 11 min old, b's 5 min

      const events = await captureEvents(async () => assert.equal(await sweepExpiredHolds(), 1));
      assert.equal(await sweepExpiredHolds(), 0); // idempotent
      assert.deepEqual(await SeatReservation.distinct('seatId'), ['B1']);
      assert.deepEqual(events.find((e) => e.name === 'seats.changed').payload.changes, [{ seatId: 'A1', state: 'available' }]);
      assert.equal(events.find((e) => e.name === 'booking.updated').payload.status, 'EXPIRED');
    });
  });

  describe('releasing, viewing and availability', () => {
    it('releases a hold idempotently and frees the seats', async () => {
      const showtime = await createShowtime();
      const { client } = await registeredCustomer(app);
      const booking = (await hold(client, showtime, ['A1'])).body.booking;
      const first = await client.post(`/api/bookings/${booking.id}/release`);
      assert.equal(first.body.booking.status, 'RELEASED');
      assert.equal((await client.post(`/api/bookings/${booking.id}/release`)).body.booking.status, 'RELEASED');
      assert.equal(await SeatReservation.countDocuments(), 0);
      const other = await registeredCustomer(app);
      assert.equal((await hold(other.client, showtime, ['A1'])).status, 201);
    });

    it("hides other customers' bookings (404, not 403)", async () => {
      const showtime = await createShowtime();
      const owner = await registeredCustomer(app);
      const stranger = await registeredCustomer(app);
      const booking = (await hold(owner.client, showtime, ['A1'])).body.booking;
      assert.equal((await owner.client.get(`/api/bookings/${booking.id}`)).status, 200);
      assert.equal((await stranger.client.get(`/api/bookings/${booking.id}`)).status, 404);
      assert.equal((await stranger.client.post(`/api/bookings/${booking.id}/release`)).status, 404);
      assert.equal((await request(app).get(`/api/bookings/${booking.id}`)).status, 401);
      assert.equal((await Booking.findById(booking.id)).status, 'HELD');
    });

    it('reports seat states, distinguishing my holds from other people’s without revealing who', async () => {
      const showtime = await createShowtime();
      const me = await registeredCustomer(app);
      const other = await registeredCustomer(app);
      await hold(me.client, showtime, ['A1']);
      await hold(other.client, showtime, ['A2']);
      await SeatReservation.updateOne({ seatId: 'A2' }, { $set: { status: 'BOOKED' }, $unset: { expiresAt: 1 } });

      const mine = (await me.client.get(`/api/showtimes/${showtime.id}/seats`)).body;
      assert.deepEqual(mine.seats, { A1: 'mine', A2: 'booked' });
      assert.equal(mine.myHold.seats[0].seatId, 'A1');
      assert.ok(mine.serverTime);
      const anonymous = (await request(app).get(`/api/showtimes/${showtime.id}/seats`)).body;
      assert.deepEqual(anonymous.seats, { A1: 'held', A2: 'booked' });
      assert.equal(anonymous.myHold, null);
      assert.doesNotMatch(JSON.stringify(anonymous), new RegExp(me.user.id));
    });
  });

  describe('events', () => {
    it('announces held seats only after a successful commit, and nothing for a failed attempt', async () => {
      const showtime = await createShowtime();
      const a = await registeredCustomer(app);
      const b = await registeredCustomer(app);
      const ok = await captureEvents(() => hold(a.client, showtime, ['A1', 'A2']));
      assert.deepEqual(ok.map((e) => e.name), ['seats.changed']);
      assert.deepEqual(ok[0].payload, { showtimeId: showtime.id, changes: [{ seatId: 'A1', state: 'held' }, { seatId: 'A2', state: 'held' }] });

      const failed = await captureEvents(() => hold(b.client, showtime, ['A2', 'A3']));
      assert.deepEqual(failed, []);
      assert.equal(await SeatReservation.countDocuments({ seatId: 'A3' }), 0);
    });

    it('does not let a hold commit against a show that was cancelled in the meantime', async () => {
      const showtime = await createShowtime();
      const { client } = await registeredCustomer(app);
      await Showtime.updateOne({ _id: showtime._id }, { $set: { status: 'CANCELLED' } });
      const res = await hold(client, showtime, ['A1']);
      assert.equal(res.status, 409);
      assert.equal(await Booking.countDocuments(), 0);
    });
  });
});
