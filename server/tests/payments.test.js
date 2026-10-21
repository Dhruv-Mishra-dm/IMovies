import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { testApp, registeredCustomer, adminClient } from './helpers/http.js';
import { createShowtime } from './helpers/factories.js';
import { Booking, Payment, Refund, SeatReservation, Showtime, AuditLog } from '../src/models/index.js';
import { bus } from '../src/events/bus.js';
import { setPaymentProvider, resetPaymentProvider, simulatedProvider } from '../src/services/payments/simulatedProvider.js';
import { retryPendingRefunds } from '../src/services/refundService.js';
import { failStalePayments } from '../src/services/paymentService.js';
import { resumeShowtimeCancellations } from '../src/services/cancellationService.js';
import { clock, minutes } from '../src/utils/clock.js';

const app = testApp();
const key = () => randomUUID();

async function heldBooking({ startsInMinutes = 24 * 60, seats = ['A1', 'A2'] } = {}) {
  const showtime = await createShowtime({ startsInMinutes });
  const customer = await registeredCustomer(app);
  const res = await customer.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: seats });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { ...customer, showtime, booking: res.body.booking };
}

const pay = (client, bookingId, outcome = 'SUCCESS', idempotencyKey = key()) =>
  client.post(`/api/bookings/${bookingId}/payments`, { outcome }).set('Idempotency-Key', idempotencyKey);

async function capture(fn) {
  const events = [];
  const on = (name) => (payload) => events.push({ name, payload });
  const handlers = { 'seats.changed': on('seats.changed'), 'booking.updated': on('booking.updated') };
  for (const [n, h] of Object.entries(handlers)) bus.on(n, h);
  try {
    await fn();
  } finally {
    for (const [n, h] of Object.entries(handlers)) bus.off(n, h);
  }
  return events;
}

describe('payments, cancellations and refunds', () => {
  before(connectTestDB);
  after(disconnectTestDB);
  beforeEach(clearTestDB);
  afterEach(() => {
    clock.reset();
    resetPaymentProvider();
  });

  describe('paying for a hold', () => {
    it('confirms the booking, books the seats and records one captured payment of the server amount', async () => {
      const { client, booking } = await heldBooking();
      const events = await capture(async () => {
        const res = await pay(client, booking.id);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.payment.status, 'SUCCEEDED');
        assert.equal(res.body.payment.amount, booking.totalAmount);
        assert.equal(res.body.payment.idempotencyKey, undefined); // internal field not exposed
        assert.equal(res.body.booking.status, 'CONFIRMED');
        assert.equal(res.body.cancellation.allowed, true);
      });
      assert.deepEqual(await SeatReservation.distinct('status'), ['BOOKED']);
      assert.equal(await SeatReservation.countDocuments({ expiresAt: { $exists: true } }), 0);
      assert.equal(await Payment.countDocuments({ captured: true }), 1);
      assert.deepEqual(
        events.map((e) => e.name),
        ['seats.changed', 'booking.updated'],
      );
      assert.deepEqual(events[0].payload.changes.map((c) => c.state), ['booked', 'booked']);
    });

    it('records a declined payment, keeps the hold, and allows a retry that succeeds (business rule 4)', async () => {
      const { client, booking } = await heldBooking();
      const declined = await pay(client, booking.id, 'DECLINED');
      assert.equal(declined.status, 201);
      assert.equal(declined.body.payment.status, 'FAILED');
      assert.equal(declined.body.payment.failureCode, 'CARD_DECLINED');
      assert.equal(declined.body.booking.status, 'HELD');

      const poor = await pay(client, booking.id, 'INSUFFICIENT_FUNDS');
      assert.equal(poor.body.payment.failureCode, 'INSUFFICIENT_FUNDS');

      const retry = await pay(client, booking.id, 'SUCCESS');
      assert.equal(retry.body.booking.status, 'CONFIRMED');
      assert.deepEqual(retry.body.payments.map((p) => p.status), ['FAILED', 'FAILED', 'SUCCEEDED']);
    });

    it('refuses to pay once the hold has expired, and the seats stay free for others', async () => {
      const { client, booking, showtime } = await heldBooking();
      await pay(client, booking.id, 'DECLINED');
      clock.advance(minutes(10) + 1000);
      const late = await pay(client, booking.id, 'SUCCESS');
      assert.equal(late.status, 409);
      assert.equal(late.body.error.code, 'HOLD_EXPIRED');
      assert.equal(await Payment.countDocuments({ captured: true }), 0);

      const other = await registeredCustomer(app);
      assert.equal((await other.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['A1'] })).status, 201);
    });

    it('voids an approved payment if the hold expires during authorisation — no booking, no event, no charge', async () => {
      const { client, booking } = await heldBooking();
      // A slow gateway: by the time it approves, the 10-minute hold has run out.
      setPaymentProvider({
        ...simulatedProvider,
        async authorize(args) {
          clock.advance(minutes(11));
          return simulatedProvider.authorize(args);
        },
      });
      const events = await capture(async () => {
        const res = await pay(client, booking.id, 'SUCCESS');
        assert.equal(res.status, 409);
        assert.equal(res.body.error.code, 'HOLD_EXPIRED');
      });
      assert.deepEqual(events.filter((e) => e.payload.changes?.some((c) => c.state === 'booked')), []);
      const attempt = await Payment.findOne();
      assert.equal(attempt.status, 'VOIDED');
      assert.equal(attempt.captured, false);
      assert.equal((await Booking.findById(booking.id)).status, 'HELD'); // expired; the sweeper/next hold expires it
      assert.equal(await SeatReservation.countDocuments({ status: 'BOOKED' }), 0);
    });

    it('voids an approved payment if the show was cancelled meanwhile', async () => {
      const { client, booking, showtime } = await heldBooking();
      await Showtime.updateOne({ _id: showtime._id }, { $set: { status: 'CANCELLED' } });
      const res = await pay(client, booking.id, 'SUCCESS');
      assert.equal(res.status, 409);
      assert.equal((await Payment.findOne()).status, 'VOIDED');
    });
  });

  describe('idempotency', () => {
    it('answers a repeated request with the same key with the original result and charges once', async () => {
      const { client, booking } = await heldBooking();
      const k = key();
      const first = await pay(client, booking.id, 'SUCCESS', k);
      const again = await pay(client, booking.id, 'SUCCESS', k);
      assert.equal(first.status, 201);
      assert.equal(again.status, 200);
      assert.equal(again.body.payment.id, first.body.payment.id);
      assert.equal(await Payment.countDocuments(), 1);
    });

    it('handles the same request arriving several times at once', async () => {
      const { client, booking } = await heldBooking();
      const k = key();
      const results = await Promise.all(Array.from({ length: 5 }, () => pay(client, booking.id, 'SUCCESS', k)));
      assert.ok(results.every((r) => [200, 201, 409].includes(r.status)), results.map((r) => r.status).join());
      assert.equal(await Payment.countDocuments(), 1);
      assert.equal(await Payment.countDocuments({ captured: true }), 1);
      assert.equal((await Booking.findById(booking.id)).status, 'CONFIRMED');
    });

    it('never captures twice when different attempts race (e.g. two tabs)', async () => {
      const { client, booking } = await heldBooking();
      const results = await Promise.all(Array.from({ length: 6 }, () => pay(client, booking.id, 'SUCCESS')));
      assert.equal(await Payment.countDocuments({ captured: true }), 1);
      assert.equal(results.filter((r) => r.status === 201 && r.body.payment.status === 'SUCCEEDED').length, 1);
      for (const r of results.filter((x) => x.status !== 201)) assert.ok(['PAYMENT_IN_PROGRESS', 'BOOKING_ALREADY_PAID'].includes(r.body.error.code));
    });

    it('rejects paying an already-paid booking with a new key, and reusing a key for another booking', async () => {
      const a = await heldBooking();
      const k = key();
      await pay(a.client, a.booking.id, 'SUCCESS', k);
      assert.equal((await pay(a.client, a.booking.id, 'SUCCESS')).body.error.code, 'BOOKING_ALREADY_PAID');
      const second = (await a.client.post('/api/bookings', { showtimeId: (await createShowtime()).id, seatIds: ['B1'] })).body.booking;
      const reused = await pay(a.client, second.id, 'SUCCESS', k);
      assert.equal(reused.status, 422);
      assert.equal(reused.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
    });

    it('requires a well-formed Idempotency-Key and a valid demo outcome; ignores amounts sent by the browser', async () => {
      const { client, booking } = await heldBooking();
      assert.equal((await client.post(`/api/bookings/${booking.id}/payments`, { outcome: 'SUCCESS' })).body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
      assert.equal((await pay(client, booking.id, 'STEAL')).status, 400);
      const res = await client
        .post(`/api/bookings/${booking.id}/payments`, { outcome: 'SUCCESS', amount: 1, status: 'SUCCEEDED', cardNumber: '4111111111111111' })
        .set('Idempotency-Key', key());
      assert.equal(res.body.payment.amount, booking.totalAmount);
      assert.doesNotMatch(JSON.stringify(await Payment.findOne().lean()), /4111/);
    });

    it("doesn't let customers pay for other people's bookings", async () => {
      const { booking } = await heldBooking();
      const stranger = await registeredCustomer(app);
      assert.equal((await pay(stranger.client, booking.id)).status, 404);
    });

    it('recovers an interrupted payment so the customer can retry', async () => {
      const { client, booking, user } = await heldBooking();
      await Payment.create({ booking: booking.id, user: user.id, amount: booking.totalAmount, idempotencyKey: key(), status: 'PENDING' });
      assert.equal((await pay(client, booking.id)).body.error.code, 'PAYMENT_IN_PROGRESS');
      clock.advance(minutes(3));
      await Payment.updateMany({}, { $set: { createdAt: new Date(clock.now().getTime() - minutes(3)) } });
      assert.equal(await failStalePayments(), 1);
      assert.equal((await pay(client, booking.id)).body.booking.status, 'CONFIRMED');
    });
  });

  describe('customer cancellation (business rule 2)', () => {
    it('cancels at least 120 minutes before the show with a full refund, and frees exactly those seats', async () => {
      const { client, booking, showtime } = await heldBooking({ startsInMinutes: 121 });
      await pay(client, booking.id);
      // another customer's booked seat must stay booked
      const other = await registeredCustomer(app);
      const otherBooking = (await other.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['B1'] })).body.booking;
      await pay(other.client, otherBooking.id);

      const res = await client.post(`/api/bookings/${booking.id}/cancel`);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.booking.status, 'CANCELLED');
      assert.equal(res.body.booking.cancellation.reason, 'CUSTOMER_REQUEST');
      assert.equal(res.body.refund.status, 'SUCCEEDED');
      assert.equal(res.body.refund.amount, booking.totalAmount);
      assert.equal(res.body.payments[0].status, 'REFUNDED');
      assert.deepEqual(await SeatReservation.distinct('seatId'), ['B1']);
    });

    it('refuses after the cutoff', async () => {
      const { client, booking } = await heldBooking({ startsInMinutes: 130 });
      await pay(client, booking.id);
      clock.advance(minutes(11)); // now 119 minutes before the show
      const res = await client.post(`/api/bookings/${booking.id}/cancel`);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'CANCELLATION_WINDOW_CLOSED');
      assert.ok(res.body.error.details.cutoffAt);
      assert.equal((await Booking.findById(booking.id)).status, 'CONFIRMED');
      assert.equal(await Refund.countDocuments(), 0);
    });

    it('is idempotent, refunds once under concurrent requests, and protects other users', async () => {
      const { client, booking } = await heldBooking();
      await pay(client, booking.id);
      const stranger = await registeredCustomer(app);
      assert.equal((await stranger.client.post(`/api/bookings/${booking.id}/cancel`)).status, 404);

      const results = await Promise.all(Array.from({ length: 5 }, () => client.post(`/api/bookings/${booking.id}/cancel`)));
      assert.ok(results.every((r) => r.status === 200), results.map((r) => r.status).join());
      assert.equal(await Refund.countDocuments(), 1);
      assert.equal((await client.post(`/api/bookings/${booking.id}/cancel`)).body.booking.status, 'CANCELLED');
    });

    it('does not cancel unpaid holds (they are released instead)', async () => {
      const { client, booking } = await heldBooking();
      assert.equal((await client.post(`/api/bookings/${booking.id}/cancel`)).body.error.code, 'BOOKING_NOT_PAID');
    });

    it('retries a refund the provider failed', async () => {
      const { client, booking } = await heldBooking();
      await pay(client, booking.id);
      setPaymentProvider({ ...simulatedProvider, refund: async () => Promise.reject(new Error('gateway down')) });
      const res = await client.post(`/api/bookings/${booking.id}/cancel`);
      assert.equal(res.body.booking.status, 'CANCELLED'); // cancellation itself stands
      assert.equal(res.body.refund.status, 'FAILED');
      resetPaymentProvider();
      clock.advance(minutes(2));
      await Refund.updateMany({}, { $set: { updatedAt: new Date(clock.now().getTime() - minutes(2)) } }, { timestamps: false });
      assert.equal(await retryPendingRefunds(), 1);
      assert.equal((await Refund.findOne()).status, 'SUCCEEDED');
      assert.equal((await Payment.findOne({ captured: true })).status, 'REFUNDED');
    });
  });

  describe('admin showtime cancellation (business rule 5)', () => {
    it('cancels the show, every affected booking, refunds paid ones once, and blocks new bookings', async () => {
      const showtime = await createShowtime();
      const paid = await registeredCustomer(app);
      const holding = await registeredCustomer(app);
      const paidBooking = (await paid.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['A1', 'A2'] })).body.booking;
      await pay(paid.client, paidBooking.id);
      const heldOnly = (await holding.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['B1'] })).body.booking;

      const { client: admin, user } = await adminClient(app);
      const events = [];
      const onCancelled = (p) => events.push(p);
      bus.on('showtime.cancelled', onCancelled);
      const res = await admin.post(`/api/admin/showtimes/${showtime.id}/cancel`, { reason: 'Projector failure' });
      bus.off('showtime.cancelled', onCancelled);

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.showtime.status, 'CANCELLED');
      assert.deepEqual(
        { progress: res.body.showtime.cancellation.progress, cancelled: res.body.showtime.cancellation.bookingsCancelled, refunds: res.body.showtime.cancellation.refundsRecorded },
        { progress: 'COMPLETED', cancelled: 2, refunds: 1 },
      );
      assert.equal((await Booking.findById(paidBooking.id)).cancellation.reason, 'SHOWTIME_CANCELLED');
      assert.equal((await Booking.findById(heldOnly.id)).status, 'CANCELLED');
      assert.equal(await SeatReservation.countDocuments({ showtime: showtime._id }), 0);
      assert.equal((await Refund.findOne()).status, 'SUCCEEDED');
      assert.deepEqual(events, [{ showtimeId: showtime.id }]);
      assert.ok(await AuditLog.exists({ actor: user._id, action: 'SHOWTIME_CANCELLED' }));

      // retrying is safe: no second refund, same totals
      const again = await admin.post(`/api/admin/showtimes/${showtime.id}/cancel`, { reason: 'Projector failure' });
      assert.equal(again.body.showtime.cancellation.refundsRecorded, 1);
      assert.equal(await Refund.countDocuments(), 1);

      // the held customer can't pay any more, and nobody can hold seats
      assert.equal((await pay(holding.client, heldOnly.id)).status, 409);
      const late = await registeredCustomer(app);
      assert.equal((await late.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['C1'] })).body.error.code, 'SHOWTIME_UNAVAILABLE');
    });

    it('is admin-only, requires a reason and refuses finished shows', async () => {
      const showtime = await createShowtime();
      const { client: customer } = await registeredCustomer(app);
      assert.equal((await customer.post(`/api/admin/showtimes/${showtime.id}/cancel`, { reason: 'nope' })).status, 403);
      const { client: admin } = await adminClient(app);
      assert.equal((await admin.post(`/api/admin/showtimes/${showtime.id}/cancel`, {})).status, 400);
      const finished = await createShowtime({ startsInMinutes: -500 });
      assert.equal((await admin.post(`/api/admin/showtimes/${finished.id}/cancel`, { reason: 'too late' })).body.error.code, 'SHOWTIME_COMPLETED');
    });

    it('finishes an interrupted cancellation in the background without refunding twice', async () => {
      const { client, booking, showtime, user } = await heldBooking();
      await pay(client, booking.id);
      // simulate a crash right after step 1 (show marked cancelled, bookings untouched)
      await Showtime.updateOne(
        { _id: showtime._id },
        { $set: { status: 'CANCELLED', cancellation: { at: clock.now(), by: user.id, reason: 'crash test', progress: 'IN_PROGRESS' } } },
      );
      clock.advance(minutes(2));
      await Showtime.updateOne({ _id: showtime._id }, { $set: { updatedAt: new Date(clock.now().getTime() - minutes(2)) } }, { timestamps: false });
      assert.equal(await resumeShowtimeCancellations(), 1);
      assert.equal((await Showtime.findById(showtime._id)).cancellation.progress, 'COMPLETED');
      assert.equal((await Booking.findById(booking.id)).status, 'CANCELLED');
      assert.equal(await Refund.countDocuments(), 1);
    });

    it('a customer cancelling at the same moment as the admin still gets exactly one refund', async () => {
      const { client, booking, showtime } = await heldBooking();
      await pay(client, booking.id);
      const { client: admin } = await adminClient(app);
      await Promise.all([client.post(`/api/bookings/${booking.id}/cancel`), admin.post(`/api/admin/showtimes/${showtime.id}/cancel`, { reason: 'Power cut' })]);
      assert.equal((await Booking.findById(booking.id)).status, 'CANCELLED');
      assert.equal(await Refund.countDocuments(), 1);
    });
  });
});
