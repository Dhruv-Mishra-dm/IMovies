import { Booking } from '../models/index.js';
import { BOOKING_STATUS } from '../domain/statuses.js';
import { clock } from '../utils/clock.js';
import { paginate } from '../utils/query.js';

/**
 * A customer's own bookings.
 *  - upcoming: confirmed bookings for shows that haven't started, plus holds that are still valid
 *  - past:     everything else (finished shows, cancelled, expired, released) — so a cancelled
 *              booking can never be listed as an active one.
 */
export function listOwnBookings(user, { scope, page, pageSize }) {
  const now = clock.now();
  const upcoming = {
    $or: [
      { status: BOOKING_STATUS.CONFIRMED, 'snapshot.startsAt': { $gt: now } },
      { status: BOOKING_STATUS.HELD, holdExpiresAt: { $gt: now } },
    ],
  };
  const filter = { user: user._id, ...(scope === 'upcoming' ? upcoming : scope === 'past' ? { $nor: [upcoming] } : {}) };
  const sort = scope === 'upcoming' ? { 'snapshot.startsAt': 1, _id: 1 } : { createdAt: -1, _id: 1 };
  return paginate(Booking, filter, { page, pageSize, sort, select: 'reference status seats totalAmount currency snapshot holdExpiresAt createdAt cancelledAt cancellation showtime' });
}
