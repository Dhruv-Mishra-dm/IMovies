import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createMovie, createScreen, createShowtime, createBooking, bookingFields } from './helpers/factories.js';
import { User, Movie, Screen, SeatReservation, Booking, Payment, Refund, Showtime } from '../src/models/index.js';
import { isDuplicateKeyError, withTransaction } from '../src/utils/transaction.js';

async function assertDuplicate(promise) {
  await assert.rejects(promise, (err) => {
    assert.ok(isDuplicateKeyError(err), `expected duplicate-key error, got: ${err.message}`);
    return true;
  });
}

describe('models and database constraints', () => {
  before(connectTestDB);
  after(disconnectTestDB);
  beforeEach(clearTestDB);

  describe('User', () => {
    it('normalises email and rejects a duplicate that differs only in case', async () => {
      const user = await createUser({ email: '  Asha@Example.COM ' });
      assert.equal(user.email, 'asha@example.com');
      await assertDuplicate(createUser({ email: 'ASHA@example.com' }));
    });

    it('never returns passwordHash by default or in JSON', async () => {
      const { _id } = await createUser();
      const found = await User.findById(_id);
      assert.equal(found.passwordHash, undefined);
      const withHash = await User.findById(_id).select('+passwordHash');
      assert.ok(withHash.passwordHash);
      assert.equal(JSON.stringify(withHash).includes('passwordHash'), false);
      assert.equal(JSON.stringify(withHash).includes('tokenVersion'), false);
    });

    it('rejects an unknown role and an invalid email', async () => {
      await assert.rejects(createUser({ role: 'superuser' }), mongoose.Error.ValidationError);
      await assert.rejects(createUser({ email: 'not-an-email' }), mongoose.Error.ValidationError);
    });
  });

  describe('Movie', () => {
    it('validates genres, duration, certification and URLs', async () => {
      await assert.rejects(createMovie({ genres: ['Western-ish'] }), mongoose.Error.ValidationError);
      await assert.rejects(createMovie({ durationMins: 12 }), mongoose.Error.ValidationError);
      await assert.rejects(createMovie({ certification: 'R' }), mongoose.Error.ValidationError);
      await assert.rejects(createMovie({ posterUrl: 'javascript:alert(1)' }), mongoose.Error.ValidationError);
      await assert.rejects(createMovie({ trailerUrl: 'http://insecure.example' }), mongoose.Error.ValidationError);
      const ok = await createMovie({ posterUrl: '/posters/x.svg', trailerUrl: 'https://example.com/t' });
      assert.equal(ok.status, 'PUBLISHED');
    });

    it('enforces unique slugs', async () => {
      await createMovie({ slug: 'same-slug' });
      await assertDuplicate(createMovie({ slug: 'same-slug' }));
    });
  });

  describe('Screen', () => {
    it('computes bookable capacity and validates the layout', async () => {
      const screen = await createScreen();
      assert.equal(screen.capacity, 15); // 6 + 6 + 4 seats, one disabled
      await assert.rejects(
        createScreen({ layout: { categories: [{ code: 'CLASSIC', name: 'Classic' }], rows: [{ label: 'A', seats: [{ number: 1, col: 1, category: 'NOPE' }] }] } }),
        /unknown category/,
      );
    });

    it('enforces unique screen names within a theatre', async () => {
      const screen = await createScreen({ name: 'Screen 1' });
      await assertDuplicate(createScreen({ name: 'Screen 1', theatre: screen.theatre }));
    });
  });

  describe('Showtime', () => {
    it('requires exactly one price per seat category', async () => {
      await assert.rejects(createShowtime({ prices: [{ category: 'CLASSIC', amount: 20000 }] }), /Exactly one price/);
      await assert.rejects(
        createShowtime({ prices: [{ category: 'CLASSIC', amount: 200.5 }, { category: 'RECLINER', amount: 45000 }] }),
        /whole paise/,
      );
    });

    it('stores a snapshot of the seat map', async () => {
      const showtime = await createShowtime();
      await Screen.updateOne({ _id: showtime.screen }, { $set: { 'layout.rows': [] } }, { runValidators: false });
      const reloaded = await Showtime.findById(showtime._id);
      assert.equal(reloaded.seatMap.rows.length, 3); // unaffected by the screen edit
    });
  });

  describe('SeatReservation — the double-booking guarantee', () => {
    it('rejects a second reservation of the same seat for the same show, but allows it for another show', async () => {
      const user = await createUser();
      const showA = await createShowtime();
      const showB = await createShowtime();
      const booking = await createBooking({ user, showtime: showA });
      const reservation = { seatId: 'A1', booking: booking._id, user: user._id, status: 'BOOKED' };

      await SeatReservation.create({ ...reservation, showtime: showA._id });
      await assertDuplicate(SeatReservation.create({ ...reservation, showtime: showA._id, status: 'HELD', expiresAt: new Date() }));
      await SeatReservation.create({ ...reservation, showtime: showB._id }); // requirement G: per-show availability
    });

    it('requires an expiry time on holds', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      const booking = await createBooking({ user, showtime });
      await assert.rejects(
        SeatReservation.create({ showtime: showtime._id, seatId: 'A2', booking: booking._id, user: user._id, status: 'HELD' }),
        /need an expiry time/,
      );
    });

    it('lets exactly one of many concurrent transactions take a seat', async () => {
      const showtime = await createShowtime();
      const users = await Promise.all(Array.from({ length: 10 }, () => createUser()));
      const bookings = await Promise.all(users.map((user) => createBooking({ user, showtime })));

      const results = await Promise.allSettled(
        bookings.map((booking, i) =>
          withTransaction((session) =>
            SeatReservation.create(
              [{ showtime: showtime._id, seatId: 'B2', booking: booking._id, user: users[i]._id, status: 'BOOKED' }],
              { session },
            ),
          ),
        ),
      );
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(await SeatReservation.countDocuments({ showtime: showtime._id, seatId: 'B2' }), 1);
      for (const failure of results.filter((r) => r.status === 'rejected')) assert.ok(isDuplicateKeyError(failure.reason));
    });
  });

  describe('Booking', () => {
    it('allows only one active hold per user per showtime', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      await createBooking({ user, showtime });
      await assertDuplicate(createBooking({ user, showtime }));
      // ...but any number of finished bookings
      await Booking.updateMany({}, { $set: { status: 'EXPIRED' } });
      await createBooking({ user, showtime });
    });

    it('requires total = sum of seat prices and a valid reference', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      await assert.rejects(Booking.create({ ...bookingFields({ user, showtime }), totalAmount: 1 }), /sum of seat prices/);
      await assert.rejects(Booking.create({ ...bookingFields({ user, showtime }), reference: 'bad' }), mongoose.Error.ValidationError);
    });
  });

  describe('Payment and Refund idempotency constraints', () => {
    it('allows one pending attempt and one captured payment per booking, and unique idempotency keys per user', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      const booking = await createBooking({ user, showtime });
      const base = { booking: booking._id, user: user._id, amount: booking.totalAmount };

      await Payment.create({ ...base, idempotencyKey: 'key-00000001', status: 'PENDING' });
      await assertDuplicate(Payment.create({ ...base, idempotencyKey: 'key-00000002', status: 'PENDING' }));
      await assertDuplicate(Payment.create({ ...base, idempotencyKey: 'key-00000001', status: 'FAILED' }));

      await Payment.create({ ...base, idempotencyKey: 'key-00000003', status: 'SUCCEEDED', captured: true });
      await assertDuplicate(Payment.create({ ...base, idempotencyKey: 'key-00000004', status: 'SUCCEEDED', captured: true }));
      await Payment.create({ ...base, idempotencyKey: 'key-00000005', status: 'FAILED' }); // failures are fine
    });

    it('records at most one refund per payment', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      const booking = await createBooking({ user, showtime });
      const payment = await Payment.create({
        booking: booking._id,
        user: user._id,
        amount: booking.totalAmount,
        idempotencyKey: 'key-refund-1',
        status: 'SUCCEEDED',
        captured: true,
      });
      const refund = { payment: payment._id, booking: booking._id, user: user._id, amount: payment.amount, reason: 'CUSTOMER_CANCELLATION' };
      await Refund.create(refund);
      await assertDuplicate(Refund.create({ ...refund, reason: 'SHOWTIME_CANCELLED' }));
    });
  });

  it('created every expected index', async () => {
    const indexNames = async (model) => (await model.collection.indexes()).map((i) => i.name);
    assert.ok((await indexNames(SeatReservation)).includes('showtime_1_seatId_1'));
    assert.ok((await indexNames(Booking)).includes('one_active_hold_per_user_showtime'));
    assert.ok((await indexNames(Payment)).includes('one_captured_payment_per_booking'));
    assert.ok((await indexNames(Movie)).includes('slug_1'));
  });
});
