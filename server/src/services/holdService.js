import { Booking, SeatReservation, Showtime } from '../models/index.js';
import { RESERVATION_STATUS } from '../models/SeatReservation.js';
import { BOOKING_STATUS, MOVIE_STATUS, SHOWTIME_STATUS } from '../domain/statuses.js';
import { indexSeats } from '../domain/seatLayout.js';
import { SEAT_HOLD_MINUTES } from '../config/business.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';
import { clock, minutes } from '../utils/clock.js';
import { sumPaise } from '../utils/money.js';
import { newBookingReference } from '../utils/reference.js';
import { withTransaction, isDuplicateKeyError } from '../utils/transaction.js';
import { publish, publishSeatChanges } from '../events/bus.js';
import { availabilityState } from './showtimeService.js';

const bookingNotFound = () => new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');

/** Reservation filter for seats that are currently taken (booked, or held and not yet expired). */
export const takenNow = (now) => ({ $or: [{ status: RESERVATION_STATUS.BOOKED }, { status: RESERVATION_STATUS.HELD, expiresAt: { $gt: now } }] });

/**
 * "Write" the showtime inside a transaction. Every booking, payment and cancellation transaction for
 * a show does this, so they are serialised by MongoDB (a concurrent one hits a write conflict and is
 * retried) and none can commit against a show that has meanwhile been cancelled or has started.
 */
export async function lockOpenShowtime(showtimeId, session, now) {
  const result = await Showtime.updateOne(
    { _id: showtimeId, status: SHOWTIME_STATUS.SCHEDULED, startsAt: { $gt: now } },
    { $inc: { lockVersion: 1 } },
    { session },
  );
  if (result.matchedCount === 0) throw new AppError(409, 'SHOWTIME_UNAVAILABLE', 'This show is no longer open for booking');
}

/**
 * Marks the given HELD bookings EXPIRED (only if their hold really has run out) and frees their seats.
 * Safe to call repeatedly or concurrently: the status condition makes each expiry happen once.
 * Returns [{ showtimeId, userId, bookingId, seatIds }] for the bookings it actually expired.
 */
export async function expireHolds(bookingIds, session, now) {
  if (bookingIds.length === 0) return [];
  const due = await Booking.find({ _id: { $in: bookingIds }, status: BOOKING_STATUS.HELD, holdExpiresAt: { $lte: now } })
    .select('showtime user seats')
    .session(session);
  if (due.length === 0) return [];
  const ids = due.map((b) => b._id);
  await Booking.updateMany(
    { _id: { $in: ids }, status: BOOKING_STATUS.HELD },
    { $set: { status: BOOKING_STATUS.EXPIRED, expiredAt: now } },
    { session },
  );
  await SeatReservation.deleteMany({ booking: { $in: ids }, status: RESERVATION_STATUS.HELD }, { session });
  return due.map((b) => ({ showtimeId: b.showtime, userId: b.user, bookingId: b._id, seatIds: b.seats.map((s) => s.seatId) }));
}

function announceExpired(expired) {
  for (const e of expired) {
    publishSeatChanges(e.showtimeId, e.seatIds, 'available');
    publish('booking.updated', { userId: String(e.userId), bookingId: String(e.bookingId), status: BOOKING_STATUS.EXPIRED });
  }
}

/** Current seat states for a show. Other customers' identities are never revealed — only "held". */
export async function getSeatAvailability(showtimeId, viewer) {
  const showtime = await Showtime.findById(showtimeId).select('status startsAt endsAt movie').populate('movie', 'status');
  if (!showtime || showtime.movie?.status !== MOVIE_STATUS.PUBLISHED) throw new AppError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found');
  const now = clock.now();
  const reservations = await SeatReservation.find({ showtime: showtimeId, ...takenNow(now) }).select('seatId status user').lean();
  const seats = {};
  for (const r of reservations) {
    if (r.status === RESERVATION_STATUS.BOOKED) seats[r.seatId] = 'booked';
    else seats[r.seatId] = viewer && String(r.user) === String(viewer._id) ? 'mine' : 'held';
  }
  const myHold = viewer
    ? await Booking.findOne({ user: viewer._id, showtime: showtimeId, status: BOOKING_STATUS.HELD, holdExpiresAt: { $gt: now } }).select(
        'reference seats totalAmount holdExpiresAt',
      )
    : null;
  return { showtimeId: String(showtimeId), availability: availabilityState(showtime, now), seats, myHold, serverTime: now };
}

/** Validates seat ids against the show's own seat map and prices them from the show's prices. */
function priceSeats(showtime, seatIds) {
  // toObject(): spreading a Mongoose subdocument would copy its internals, not the seat fields.
  const seatIndex = indexSeats(showtime.seatMap.toObject());
  const invalid = seatIds.filter((id) => !seatIndex.has(id) || seatIndex.get(id).disabled);
  if (invalid.length) throw new AppError(400, 'INVALID_SEATS', 'Some seats do not exist or are out of service', { seats: invalid });
  const prices = new Map(showtime.prices.map((p) => [p.category, p.amount]));
  const names = new Map(showtime.seatMap.categories.map((c) => [c.code, c.name]));
  return seatIds.map((seatId) => {
    const { category } = seatIndex.get(seatId);
    return { seatId, category, categoryName: names.get(category), price: prices.get(category) };
  });
}

/**
 * Holds seats for 10 minutes and creates a HELD booking (see "Concurrency" in docs/ARCHITECTURE.md).
 * The browser only sends seat ids; prices, total and owner come from the server.
 */
export async function createHold(user, { showtimeId, seatIds }) {
  const now = clock.now();
  const showtime = await Showtime.findById(showtimeId).populate([
    { path: 'movie', select: 'title posterUrl durationMins certification status' },
    { path: 'theatre', select: 'name city address' },
    { path: 'screen', select: 'name format' },
  ]);
  if (!showtime || showtime.movie?.status !== MOVIE_STATUS.PUBLISHED) throw new AppError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found');
  if (availabilityState(showtime, now) !== 'OPEN') throw new AppError(409, 'SHOWTIME_UNAVAILABLE', 'This show is no longer open for booking');

  const seats = priceSeats(showtime, seatIds);
  const holdExpiresAt = new Date(now.getTime() + minutes(SEAT_HOLD_MINUTES));
  let expired = [];

  try {
    const booking = await withTransaction(async (session) => {
      expired = [];
      await lockOpenShowtime(showtimeId, session, now);

      // Lazy expiry: holds past their time stop blocking seats right now, without waiting for the sweeper.
      const staleOnSeats = await SeatReservation.find({
        showtime: showtimeId,
        seatId: { $in: seatIds },
        status: RESERVATION_STATUS.HELD,
        expiresAt: { $lte: now },
      })
        .session(session)
        .distinct('booking');
      const myStale = await Booking.find({ user: user._id, showtime: showtimeId, status: BOOKING_STATUS.HELD, holdExpiresAt: { $lte: now } })
        .session(session)
        .distinct('_id');
      expired = await expireHolds([...staleOnSeats, ...myStale], session, now);

      const existing = await Booking.findOne({ user: user._id, showtime: showtimeId, status: BOOKING_STATUS.HELD }).select('_id').session(session);
      if (existing) {
        throw new AppError(409, 'HOLD_EXISTS', 'You already have seats held for this show. Complete or release that booking first', {
          bookingId: String(existing._id),
        });
      }

      const [created] = await Booking.create(
        [
          {
            reference: newBookingReference(),
            user: user._id,
            showtime: showtime._id,
            status: BOOKING_STATUS.HELD,
            seats,
            totalAmount: sumPaise(seats.map((s) => s.price)),
            holdExpiresAt,
            snapshot: {
              movie: {
                id: showtime.movie._id,
                title: showtime.movie.title,
                posterUrl: showtime.movie.posterUrl,
                durationMins: showtime.movie.durationMins,
                certification: showtime.movie.certification,
              },
              theatre: { id: showtime.theatre._id, name: showtime.theatre.name, city: showtime.theatre.city, address: showtime.theatre.address },
              screen: { id: showtime.screen._id, name: showtime.screen.name, format: showtime.screen.format },
              language: showtime.language,
              startsAt: showtime.startsAt,
              endsAt: showtime.endsAt,
            },
          },
        ],
        { session },
      );
      // The unique (showtime, seatId) index rejects any seat that is already taken; the whole
      // transaction (booking included) is then rolled back, so a request never holds only some seats.
      await SeatReservation.insertMany(
        seats.map((s) => ({ showtime: showtime._id, seatId: s.seatId, booking: created._id, user: user._id, status: RESERVATION_STATUS.HELD, expiresAt: holdExpiresAt })),
        { session, ordered: true },
      );
      return created;
    });

    announceExpired(expired);
    publishSeatChanges(showtimeId, seatIds, 'held');
    logger.info({ bookingId: String(booking._id), showtimeId: String(showtimeId), seats: seatIds.length }, 'Seats held');
    return booking;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    if (err.keyPattern?.user || /one_active_hold/.test(err.message)) {
      throw new AppError(409, 'HOLD_EXISTS', 'You already have seats held for this show. Complete or release that booking first');
    }
    const taken = await SeatReservation.find({ showtime: showtimeId, seatId: { $in: seatIds }, ...takenNow(clock.now()) }).distinct('seatId');
    throw new AppError(409, 'SEATS_UNAVAILABLE', 'Sorry, some of those seats were just taken by someone else', { seats: taken.sort() });
  }
}

/** The customer gives up their hold (e.g. "change seats"). Idempotent; a confirmed booking can't be released. */
export async function releaseHold(user, bookingId) {
  const now = clock.now();
  const released = await withTransaction(async (session) => {
    const booking = await Booking.findOneAndUpdate(
      { _id: bookingId, user: user._id, status: BOOKING_STATUS.HELD },
      { $set: { status: BOOKING_STATUS.RELEASED, releasedAt: now } },
      { session, returnDocument: 'after' },
    );
    if (!booking) return null;
    await SeatReservation.deleteMany({ booking: booking._id, status: RESERVATION_STATUS.HELD }, { session });
    return booking;
  });

  if (released) {
    publishSeatChanges(released.showtime, released.seats.map((s) => s.seatId), 'available');
    publish('booking.updated', { userId: String(user._id), bookingId: String(released._id), status: released.status });
    return released;
  }
  const current = await Booking.findOne({ _id: bookingId, user: user._id });
  if (!current) throw bookingNotFound();
  if (current.status === BOOKING_STATUS.CONFIRMED) throw new AppError(409, 'BOOKING_CONFIRMED', 'This booking is already paid; cancel it instead');
  return current; // already released or expired: nothing to do
}

/**
 * Background clean-up: expires overdue holds in small batches. Correctness does not depend on this
 * (every operation checks expiry itself); it keeps data tidy and tells connected browsers promptly.
 */
export async function sweepExpiredHolds({ limit = 100 } = {}) {
  const now = clock.now();
  const due = await Booking.find({ status: BOOKING_STATUS.HELD, holdExpiresAt: { $lte: now } }).select('_id').limit(limit).lean();
  if (due.length === 0) return 0;
  const expired = await withTransaction((session) => expireHolds(due.map((b) => b._id), session, now));
  announceExpired(expired);
  if (expired.length) logger.info({ count: expired.length }, 'Expired seat holds released');
  return expired.length;
}

/** A booking visible to its owner (admins use the admin API). Others get 404, never 403, so ids can't be probed. */
export async function getOwnBooking(user, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, user: user._id });
  if (!booking) throw bookingNotFound();
  return booking;
}
