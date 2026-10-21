import { Booking, Movie, Payment, Refund, SeatReservation, Showtime, Theatre, User } from '../models/index.js';
import { RESERVATION_STATUS } from '../models/SeatReservation.js';
import { BOOKING_STATUS, MOVIE_STATUS, SHOWTIME_STATUS } from '../domain/statuses.js';
import { bookableCapacity } from '../domain/seatLayout.js';
import { AppError } from '../utils/AppError.js';
import { clock, minutes } from '../utils/clock.js';
import { containsText, paginate } from '../utils/query.js';

const DAY = minutes(24 * 60);

/**
 * Dashboard figures, all computed from stored data (nothing is estimated or invented):
 *  - revenue: captured demo payments in the last 30 days, refunds issued in the same period, and the net
 *  - tickets sold: seats in bookings CONFIRMED in the last 30 days that are still confirmed
 *  - occupancy: booked seats / bookable seats over scheduled shows in the next 7 days
 */
export async function dashboardStats() {
  const now = clock.now();
  const since = new Date(now.getTime() - 30 * DAY);
  const until = new Date(now.getTime() + 7 * DAY);

  const [moviesPublished, theatresActive, upcomingShows, grossAgg, refundAgg, soldAgg, topMovies, recentBookings] = await Promise.all([
    Movie.countDocuments({ status: MOVIE_STATUS.PUBLISHED }),
    Theatre.countDocuments({ isActive: true }),
    Showtime.find({ status: SHOWTIME_STATUS.SCHEDULED, startsAt: { $gt: now, $lt: until } }).select('seatMap'),
    Payment.aggregate([{ $match: { captured: true, succeededAt: { $gte: since } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Refund.aggregate([{ $match: { status: 'SUCCEEDED', createdAt: { $gte: since } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Booking.aggregate([
      { $match: { status: BOOKING_STATUS.CONFIRMED, confirmedAt: { $gte: since } } },
      { $group: { _id: null, bookings: { $sum: 1 }, tickets: { $sum: { $size: '$seats' } } } },
    ]),
    Booking.aggregate([
      { $match: { status: BOOKING_STATUS.CONFIRMED, confirmedAt: { $gte: since } } },
      { $group: { _id: '$snapshot.movie.id', title: { $first: '$snapshot.movie.title' }, tickets: { $sum: { $size: '$seats' } }, revenue: { $sum: '$totalAmount' } } },
      { $sort: { tickets: -1, title: 1 } },
      { $limit: 5 },
    ]),
    Booking.find({ status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED] } })
      .sort({ createdAt: -1 })
      .limit(8)
      .select('reference status totalAmount seats snapshot createdAt user')
      .populate('user', 'name email'),
  ]);

  const capacity = upcomingShows.reduce((sum, s) => sum + bookableCapacity(s.seatMap), 0);
  const booked = upcomingShows.length
    ? await SeatReservation.countDocuments({ showtime: { $in: upcomingShows.map((s) => s._id) }, status: RESERVATION_STATUS.BOOKED })
    : 0;
  const gross = grossAgg[0]?.total ?? 0;
  const refunded = refundAgg[0]?.total ?? 0;

  return {
    generatedAt: now,
    periodDays: 30,
    catalogue: { moviesPublished, theatresActive, upcomingShows: upcomingShows.length },
    revenue: { gross, refunded, net: gross - refunded, payments: grossAgg[0]?.count ?? 0, refunds: refundAgg[0]?.count ?? 0 },
    sales: { bookings: soldAgg[0]?.bookings ?? 0, tickets: soldAgg[0]?.tickets ?? 0 },
    occupancy: { windowDays: 7, bookedSeats: booked, capacity, rate: capacity ? booked / capacity : 0 },
    topMovies: topMovies.map((m) => ({ movieId: String(m._id), title: m.title, tickets: m.tickets, revenue: m.revenue })),
    recentBookings,
  };
}

/** Booking lookup for admins: by reference (IMV-…), or customer email/name, optionally by status or show. */
export async function listBookings({ q, status, showtime, page, pageSize }) {
  const filter = { ...(status && { status }), ...(showtime && { showtime }) };
  if (q) {
    if (/^IMV-[A-Z0-9]{0,8}$/i.test(q)) {
      filter.reference = q.length === 12 ? q.toUpperCase() : containsText(q.toUpperCase());
    } else {
      const users = await User.find({ $or: [{ email: containsText(q.toLowerCase()) }, { name: containsText(q) }] }).limit(200).distinct('_id');
      filter.user = { $in: users };
    }
  }
  return paginate(Booking, filter, {
    page,
    pageSize,
    sort: { createdAt: -1, _id: 1 },
    select: 'reference status totalAmount seats snapshot createdAt cancellation user showtime',
    populate: { path: 'user', select: 'name email' },
  });
}

export async function getBookingForAdmin(id) {
  const booking = await Booking.findById(id).populate('user', 'name email role createdAt');
  if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  const [payments, refunds, showtime] = await Promise.all([
    Payment.find({ booking: id }).sort({ createdAt: 1 }),
    Refund.find({ booking: id }),
    Showtime.findById(booking.showtime).select('status startsAt cancellation'),
  ]);
  return { booking, payments, refunds, showtime };
}
