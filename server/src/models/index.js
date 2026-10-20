import { User } from './User.js';
import { RefreshSession } from './RefreshSession.js';
import { Movie } from './Movie.js';
import { Theatre } from './Theatre.js';
import { Screen } from './Screen.js';
import { Showtime } from './Showtime.js';
import { SeatReservation } from './SeatReservation.js';
import { Booking } from './Booking.js';
import { Payment } from './Payment.js';
import { Refund } from './Refund.js';
import { AuditLog } from './AuditLog.js';

export { User, RefreshSession, Movie, Theatre, Screen, Showtime, SeatReservation, Booking, Payment, Refund, AuditLog };

export const allModels = [User, RefreshSession, Movie, Theatre, Screen, Showtime, SeatReservation, Booking, Payment, Refund, AuditLog];

/**
 * Creates every collection and index. Called at server start-up (and by tests) BEFORE any request
 * is served, because correctness depends on the unique indexes existing — a duplicate seat
 * reservation is only impossible once the (showtime, seatId) index is in place.
 * createIndexes() only adds missing indexes; it never drops anything.
 */
export async function ensureIndexes() {
  for (const model of allModels) {
    await model.createCollection();
    await model.createIndexes();
  }
}
