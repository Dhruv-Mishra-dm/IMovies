import { Booking, Refund, SeatReservation, Showtime } from '../models/index.js';
import { BOOKING_STATUS, SHOWTIME_STATUS } from '../domain/statuses.js';
import { CANCELLATION_CUTOFF_MINUTES } from '../config/business.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';
import { clock, minutes } from '../utils/clock.js';
import { withTransaction } from '../utils/transaction.js';
import { publish, publishSeatChanges } from '../events/bus.js';
import { recordRefund, processRefund } from './refundService.js';
import { audit } from './auditService.js';

/**
 * Business rule 2: a customer may cancel a CONFIRMED booking only if the show starts at least
 * 120 minutes from now (server time); they then get a full (simulated) refund.
 */
export function cancellationEligibility(booking, now = clock.now()) {
  const cutoffAt = new Date(new Date(booking.snapshot.startsAt).getTime() - minutes(CANCELLATION_CUTOFF_MINUTES));
  if (booking.status !== BOOKING_STATUS.CONFIRMED) return { allowed: false, reason: 'NOT_CONFIRMED', cutoffAt };
  if (now > cutoffAt) return { allowed: false, reason: 'CUTOFF_PASSED', cutoffAt };
  return { allowed: true, cutoffAt };
}

function announceCancelled(booking) {
  publishSeatChanges(booking.showtime, booking.seats.map((s) => s.seatId), 'available');
  publish('booking.updated', { userId: String(booking.user), bookingId: String(booking._id), status: BOOKING_STATUS.CANCELLED });
}

/** Customer cancellation. Idempotent: cancelling an already-cancelled booking returns it unchanged. */
export async function cancelByCustomer(user, bookingId) {
  const result = await withTransaction(async (session) => {
    const now = clock.now();
    const booking = await Booking.findOne({ _id: bookingId, user: user._id }).session(session);
    if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
    if (booking.status === BOOKING_STATUS.CANCELLED) return { booking, alreadyCancelled: true };
    if (booking.status === BOOKING_STATUS.HELD) throw new AppError(409, 'BOOKING_NOT_PAID', 'This booking is not paid yet; release the seats instead');
    if (booking.status !== BOOKING_STATUS.CONFIRMED) throw new AppError(409, 'BOOKING_NOT_CANCELLABLE', 'This booking can no longer be cancelled');

    // Use the show's CURRENT start time (an admin may have edited it before seats were booked).
    const showtime = await Showtime.findById(booking.showtime).select('startsAt status').session(session);
    const eligibility = cancellationEligibility({ status: booking.status, snapshot: { startsAt: showtime.startsAt } }, now);
    if (!eligibility.allowed) {
      throw new AppError(409, 'CANCELLATION_WINDOW_CLOSED', `Bookings can be cancelled up to ${CANCELLATION_CUTOFF_MINUTES} minutes before the show`, {
        cutoffAt: eligibility.cutoffAt,
      });
    }

    // Conditional on CONFIRMED: of two simultaneous cancellations only one can win.
    const cancelled = await Booking.findOneAndUpdate(
      { _id: booking._id, status: BOOKING_STATUS.CONFIRMED },
      { $set: { status: BOOKING_STATUS.CANCELLED, cancelledAt: now, cancellation: { reason: 'CUSTOMER_REQUEST', by: user._id } } },
      { session, returnDocument: 'after' },
    );
    if (!cancelled) return { booking: await Booking.findById(booking._id).session(session), alreadyCancelled: true };
    // Only this booking's own BOOKED seats are released — never seats of any other booking.
    await SeatReservation.deleteMany({ booking: booking._id }, { session });
    const refund = await recordRefund(cancelled, 'CUSTOMER_CANCELLATION', session);
    return { booking: cancelled, refund };
  });

  if (result.alreadyCancelled) {
    const refund = await Refund.findOne({ booking: bookingId });
    return { booking: result.booking, refund };
  }
  announceCancelled(result.booking);
  const refund = result.refund ? await processRefund(result.refund._id) : null;
  logger.info({ bookingId: String(bookingId) }, 'Booking cancelled by customer');
  return { booking: result.booking, refund };
}

/** Cancels ONE booking of a cancelled show, with a refund if it was paid. Returns what happened. */
async function cancelForShowtime(bookingId, adminId) {
  const result = await withTransaction(async (session) => {
    const now = clock.now();
    const booking = await Booking.findOneAndUpdate(
      { _id: bookingId, status: { $in: [BOOKING_STATUS.HELD, BOOKING_STATUS.CONFIRMED] } },
      { $set: { status: BOOKING_STATUS.CANCELLED, cancelledAt: now, cancellation: { reason: 'SHOWTIME_CANCELLED', by: adminId } } },
      { session, returnDocument: 'before' }, // 'before' tells us whether it had been paid
    );
    if (!booking) return null; // already handled (e.g. by an earlier, interrupted attempt)
    await SeatReservation.deleteMany({ booking: booking._id }, { session });
    const refund = booking.status === BOOKING_STATUS.CONFIRMED ? await recordRefund(booking, 'SHOWTIME_CANCELLED', session) : null;
    return { booking, refund };
  });
  if (!result) return null;
  announceCancelled(result.booking);
  if (result.refund) await processRefund(result.refund._id);
  return result;
}

async function processShowtimeCancellation(showtime, adminId) {
  const affected = await Booking.find({ showtime: showtime._id, status: { $in: [BOOKING_STATUS.HELD, BOOKING_STATUS.CONFIRMED] } }).select('_id');
  let failedBookings = 0;
  for (const { _id } of affected) {
    try {
      await cancelForShowtime(_id, adminId);
    } catch (err) {
      failedBookings += 1;
      logger.error({ err, bookingId: String(_id), showtimeId: String(showtime._id) }, 'Could not cancel a booking of a cancelled showtime; retry the cancellation');
    }
  }

  // Totals are counted from the database, so repeated runs (retries) never double-count.
  const cancelledIds = await Booking.find({ showtime: showtime._id, 'cancellation.reason': 'SHOWTIME_CANCELLED' }).distinct('_id');
  const refundsRecorded = await Refund.countDocuments({ booking: { $in: cancelledIds }, reason: 'SHOWTIME_CANCELLED' });
  const progress = failedBookings ? 'PARTIAL' : 'COMPLETED';
  const updated = await Showtime.findOneAndUpdate(
    { _id: showtime._id },
    {
      $set: {
        'cancellation.progress': progress,
        'cancellation.bookingsCancelled': cancelledIds.length,
        'cancellation.refundsRecorded': refundsRecorded,
        'cancellation.failedBookings': failedBookings,
      },
    },
    { returnDocument: 'after' },
  );
  await audit({
    actor: adminId,
    action: 'SHOWTIME_CANCELLATION_PROCESSED',
    entityType: 'Showtime',
    entityId: showtime._id,
    details: { progress, bookingsCancelled: cancelledIds.length, refundsRecorded, failedBookings },
  });
  return updated;
}

/**
 * Business rule 5: an admin cancels a showtime; every affected booking is cancelled and paid
 * ones are refunded (simulated).
 *
 * Step 1 (one transaction): mark the show CANCELLED. From that moment no hold or payment can commit
 * for it (they all lock the show and require SCHEDULED).
 * Step 2: cancel each affected booking in its own small transaction, so one failure doesn't undo the
 * others. The outcome (COMPLETED / PARTIAL) is recorded on the show; calling this again for an
 * already-cancelled show simply finishes the remaining bookings, so it is safe to retry.
 */
export async function cancelShowtime(adminId, showtimeId, { reason }) {
  const now = clock.now();
  const current = await Showtime.findById(showtimeId);
  if (!current) throw new AppError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found');
  if (current.status === SHOWTIME_STATUS.SCHEDULED && current.endsAt <= now) {
    throw new AppError(409, 'SHOWTIME_COMPLETED', 'This show has already finished and cannot be cancelled');
  }

  if (current.status === SHOWTIME_STATUS.SCHEDULED) {
    const cancelled = await withTransaction(async (session) => {
      const updated = await Showtime.findOneAndUpdate(
        { _id: showtimeId, status: SHOWTIME_STATUS.SCHEDULED },
        {
          $set: { status: SHOWTIME_STATUS.CANCELLED, cancellation: { at: now, by: adminId, reason, progress: 'IN_PROGRESS' } },
          $inc: { lockVersion: 1 },
        },
        { session, returnDocument: 'after' },
      );
      if (updated) await audit({ actor: adminId, action: 'SHOWTIME_CANCELLED', entityType: 'Showtime', entityId: showtimeId, details: { reason }, session });
      return updated;
    });
    if (cancelled) publish('showtime.cancelled', { showtimeId: String(showtimeId) });
  }

  const showtime = await Showtime.findById(showtimeId);
  return processShowtimeCancellation(showtime, adminId);
}

/** Recovery task: finishes cancellations that were interrupted (server crash) or partially failed. */
export async function resumeShowtimeCancellations() {
  const stuck = await Showtime.find({
    status: SHOWTIME_STATUS.CANCELLED,
    'cancellation.progress': { $in: ['IN_PROGRESS', 'PARTIAL'] },
    updatedAt: { $lt: new Date(clock.now().getTime() - minutes(1)) },
  }).limit(10);
  for (const showtime of stuck) await processShowtimeCancellation(showtime, showtime.cancellation.by);
  return stuck.length;
}
