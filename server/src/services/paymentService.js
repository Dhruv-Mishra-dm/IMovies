import { Booking, Payment, SeatReservation } from '../models/index.js';
import { RESERVATION_STATUS } from '../models/SeatReservation.js';
import { BOOKING_STATUS, PAYMENT_STATUS } from '../domain/statuses.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';
import { clock, minutes } from '../utils/clock.js';
import { withTransaction, isDuplicateKeyError } from '../utils/transaction.js';
import { publish, publishSeatChanges } from '../events/bus.js';
import { lockOpenShowtime } from './holdService.js';
import { paymentProvider } from './payments/simulatedProvider.js';

// A PENDING attempt older than this was interrupted (e.g. server restart mid-payment). Its
// authorisation was never captured, so it is marked FAILED and the customer can try again.
const STALE_PENDING_MS = minutes(2);

const holdExpired = () =>
  new AppError(409, 'HOLD_EXPIRED', 'Your seat hold expired before the payment completed. You were not charged; please choose seats again');

class ConfirmationAborted extends Error {
  constructor(appError) {
    super(appError.message);
    this.appError = appError;
  }
}

async function failStalePending(bookingId, now) {
  await Payment.updateMany(
    { booking: bookingId, status: PAYMENT_STATUS.PENDING, createdAt: { $lt: new Date(now.getTime() - STALE_PENDING_MS) } },
    { $set: { status: PAYMENT_STATUS.FAILED, failureCode: 'INTERRUPTED', failureMessage: 'The payment was interrupted. You were not charged.', failedAt: now } },
  );
}

/** What a repeated request with an already-used Idempotency-Key gets back. */
async function replay(existing, bookingId) {
  if (String(existing.booking) !== String(bookingId)) {
    throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This payment key was already used for a different booking');
  }
  if (existing.status === PAYMENT_STATUS.PENDING) {
    throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'This payment is still being processed; please wait a moment');
  }
  return { payment: existing, booking: await Booking.findById(bookingId), replayed: true };
}

/**
 * Pays for a HELD booking with the (simulated) provider. See README "Payments".
 * Never trusts the browser: the amount comes from the booking, success comes from the provider.
 */
export async function payForBooking(user, bookingId, { idempotencyKey, outcome }) {
  const previous = await Payment.findOne({ user: user._id, idempotencyKey });
  if (previous) return replay(previous, bookingId);

  const now = clock.now();
  const booking = await Booking.findOne({ _id: bookingId, user: user._id });
  if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  if (booking.status === BOOKING_STATUS.CONFIRMED) throw new AppError(409, 'BOOKING_ALREADY_PAID', 'This booking has already been paid');
  if (booking.status !== BOOKING_STATUS.HELD || booking.holdExpiresAt <= now) throw holdExpired();

  await failStalePending(booking._id, now);

  let payment;
  try {
    payment = await Payment.create({
      booking: booking._id,
      user: user._id,
      amount: booking.totalAmount, // from the booking, never from the request
      idempotencyKey,
      status: PAYMENT_STATUS.PENDING,
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const sameKey = await Payment.findOne({ user: user._id, idempotencyKey });
    if (sameKey) return replay(sameKey, bookingId); // the same request arrived twice at once
    throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'Another payment for this booking is in progress; please wait a moment');
  }

  const provider = paymentProvider();
  const auth = await provider.authorize({ amount: payment.amount, currency: payment.currency, reference: booking.reference, outcome });

  if (!auth.approved) {
    const failed = await Payment.findOneAndUpdate(
      { _id: payment._id, status: PAYMENT_STATUS.PENDING },
      { $set: { status: PAYMENT_STATUS.FAILED, failureCode: auth.failureCode, failureMessage: auth.failureMessage, failedAt: clock.now() } },
      { returnDocument: 'after' },
    );
    logger.info({ bookingId: String(booking._id), failureCode: auth.failureCode }, 'Simulated payment declined');
    return { payment: failed, booking: await Booking.findById(booking._id) };
  }

  // Approved: confirm the booking, turn the holds into bookings and capture — all or nothing.
  let confirmed;
  try {
    confirmed = await withTransaction(async (session) => {
      const confirmAt = clock.now();
      try {
        await lockOpenShowtime(booking.showtime, session, confirmAt);
      } catch (err) {
        throw new ConfirmationAborted(err);
      }
      const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: BOOKING_STATUS.HELD, holdExpiresAt: { $gt: confirmAt } },
        { $set: { status: BOOKING_STATUS.CONFIRMED, confirmedAt: confirmAt } },
        { session, returnDocument: 'after' },
      );
      if (!updated) throw new ConfirmationAborted(holdExpired());
      const seats = await SeatReservation.updateMany(
        { booking: booking._id, status: RESERVATION_STATUS.HELD },
        { $set: { status: RESERVATION_STATUS.BOOKED }, $unset: { expiresAt: 1 } },
        { session },
      );
      if (seats.modifiedCount !== updated.seats.length) throw new ConfirmationAborted(holdExpired());
      const paid = await Payment.findOneAndUpdate(
        { _id: payment._id, status: PAYMENT_STATUS.PENDING },
        { $set: { status: PAYMENT_STATUS.SUCCEEDED, captured: true, succeededAt: confirmAt, providerReference: auth.authorizationId } },
        { session, returnDocument: 'after' },
      );
      if (!paid) throw new ConfirmationAborted(new AppError(409, 'PAYMENT_CONFLICT', 'This payment was already processed'));
      return { booking: updated, payment: paid };
    });
  } catch (err) {
    // Nothing was committed: release the authorisation so no money is taken.
    await provider.void({ authorizationId: auth.authorizationId });
    const appError = err instanceof ConfirmationAborted ? err.appError : null;
    await Payment.updateOne(
      { _id: payment._id, status: PAYMENT_STATUS.PENDING },
      {
        $set: {
          status: PAYMENT_STATUS.VOIDED,
          failureCode: appError?.code ?? 'CONFIRMATION_FAILED',
          failureMessage: appError ? 'The seat hold ended before the payment completed. You were not charged.' : 'The payment could not be completed. You were not charged.',
          failedAt: clock.now(),
        },
      },
    );
    logger.warn({ bookingId: String(booking._id), reason: appError?.code ?? err.message }, 'Payment authorised but booking not confirmed; authorisation voided');
    throw appError ?? err;
  }

  // Committed. In a real integration capture may fail and must be retried / reconciled;
  // the simulated provider always captures.
  await provider.capture({ authorizationId: auth.authorizationId, amount: payment.amount });
  publishSeatChanges(confirmed.booking.showtime, confirmed.booking.seats.map((s) => s.seatId), 'booked');
  publish('booking.updated', { userId: String(user._id), bookingId: String(booking._id), status: BOOKING_STATUS.CONFIRMED });
  logger.info({ bookingId: String(booking._id), amount: payment.amount }, 'Booking confirmed (simulated payment captured)');
  return confirmed;
}

/** Sweeper task: marks interrupted PENDING attempts as FAILED so customers can retry. */
export async function failStalePayments() {
  const now = clock.now();
  const result = await Payment.updateMany(
    { status: PAYMENT_STATUS.PENDING, createdAt: { $lt: new Date(now.getTime() - STALE_PENDING_MS) } },
    { $set: { status: PAYMENT_STATUS.FAILED, failureCode: 'INTERRUPTED', failureMessage: 'The payment was interrupted. You were not charged.', failedAt: now } },
  );
  return result.modifiedCount;
}
