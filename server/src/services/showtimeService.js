import { Movie, Theatre, Screen, Showtime, SeatReservation, Booking } from '../models/index.js';
import { MOVIE_STATUS, SHOWTIME_STATUS, ACTIVE_BOOKING_STATUSES } from '../domain/statuses.js';
import { RESERVATION_STATUS } from '../models/SeatReservation.js';
import { bookableCapacity } from '../domain/seatLayout.js';
import { AppError } from '../utils/AppError.js';
import { clock, minutes } from '../utils/clock.js';
import { istToDate, istDayRange, istDateKey } from '../utils/time.js';
import { equalsText, paginate } from '../utils/query.js';
import { withTransaction } from '../utils/transaction.js';
import { computeShowtimeWindow, findOverlappingShowtime } from './scheduling.js';
import { audit } from './auditService.js';

const showtimeNotFound = () => new AppError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found');
const PUBLIC_WINDOW_DAYS = 7;
const DATES_WINDOW_DAYS = 14;

/**
 * Derived (not stored) state: OPEN until the show starts, then STARTED, then COMPLETED once it ends.
 * Booking is only possible while OPEN.
 */
export function availabilityState(showtime, now = clock.now()) {
  if (showtime.status === SHOWTIME_STATUS.CANCELLED) return 'CANCELLED';
  if (now >= showtime.endsAt) return 'COMPLETED';
  if (now >= showtime.startsAt) return 'STARTED';
  return 'OPEN';
}

/** Seats currently taken per showtime: booked seats plus holds that haven't expired. */
async function takenSeatCounts(showtimeIds, now) {
  if (showtimeIds.length === 0) return new Map();
  const rows = await SeatReservation.aggregate([
    {
      $match: {
        showtime: { $in: showtimeIds },
        $or: [{ status: RESERVATION_STATUS.BOOKED }, { status: RESERVATION_STATUS.HELD, expiresAt: { $gt: now } }],
      },
    },
    { $group: { _id: '$showtime', taken: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.taken]));
}

function summary(showtime, taken, now) {
  const capacity = bookableCapacity(showtime.seatMap);
  const { movie, theatre, screen } = showtime;
  return {
    id: String(showtime._id),
    startsAt: showtime.startsAt,
    endsAt: showtime.endsAt,
    language: showtime.language,
    format: showtime.format,
    status: showtime.status,
    availability: availabilityState(showtime, now),
    priceFrom: Math.min(...showtime.prices.map((p) => p.amount)),
    capacity,
    seatsLeft: Math.max(0, capacity - taken),
    movie: movie?.title
      ? { id: String(movie._id), title: movie.title, slug: movie.slug, posterUrl: movie.posterUrl, durationMins: movie.durationMins, certification: movie.certification }
      : { id: String(showtime.movie) },
    theatre: theatre?.name ? { id: String(theatre._id), name: theatre.name, slug: theatre.slug, city: theatre.city, address: theatre.address } : { id: String(showtime.theatre) },
    screen: screen?.name ? { id: String(screen._id), name: screen.name } : { id: String(showtime.screen) },
  };
}

const POPULATE = [
  { path: 'movie', select: 'title slug posterUrl durationMins certification status languages' },
  { path: 'theatre', select: 'name slug city address isActive' },
  { path: 'screen', select: 'name' },
];

/** `startsAtRange` overrides the default window (one IST day if `date` is given, else the next 7 days). */
async function publicFilter({ movie, theatre, city, date }, now, startsAtRange) {
  let startsAt = startsAtRange;
  if (!startsAt && date) {
    const { start, end } = istDayRange(date);
    startsAt = { $gte: start > now ? start : now, $lt: end };
  }
  startsAt ??= { $gt: now, $lt: new Date(now.getTime() + PUBLIC_WINDOW_DAYS * minutes(24 * 60)) };
  const conditions = [{ status: SHOWTIME_STATUS.SCHEDULED }, { startsAt }];
  if (movie) conditions.push({ movie });
  if (theatre) conditions.push({ theatre });
  if (city) conditions.push({ theatre: { $in: await Theatre.find({ city: equalsText(city), isActive: true }).distinct('_id') } });
  return { $and: conditions };
}

const isPublic = (s) => s.movie?.status === MOVIE_STATUS.PUBLISHED && s.theatre?.isActive;

/** Upcoming bookable shows, filtered by movie / theatre / city / IST date, soonest first. */
export async function listPublicShowtimes(query) {
  const now = clock.now();
  const showtimes = (await Showtime.find(await publicFilter(query, now)).sort({ startsAt: 1 }).limit(500).populate(POPULATE)).filter(isPublic);
  const taken = await takenSeatCounts(showtimes.map((s) => s._id), now);
  return showtimes.map((s) => summary(s, taken.get(String(s._id)) ?? 0, now));
}

/** IST dates (YYYY-MM-DD) in the next two weeks that have at least one upcoming show. */
export async function listShowtimeDates({ movie, theatre, city }) {
  const now = clock.now();
  const filter = await publicFilter({ movie, theatre, city }, now, { $gt: now, $lt: new Date(now.getTime() + DATES_WINDOW_DAYS * minutes(24 * 60)) });
  const showtimes = (await Showtime.find(filter).select('startsAt movie theatre').populate(POPULATE.slice(0, 2))).filter(isPublic);
  return [...new Set(showtimes.map((s) => istDateKey(s.startsAt)))].sort();
}

/** One showtime with its seat map and prices. Cancelled/past shows are still returned (for history), flagged by `availability`. */
export async function getPublicShowtime(id) {
  const showtime = await Showtime.findById(id).populate(POPULATE);
  if (!showtime || showtime.movie?.status !== MOVIE_STATUS.PUBLISHED) throw showtimeNotFound();
  const now = clock.now();
  const taken = await takenSeatCounts([showtime._id], now);
  const categoryNames = new Map(showtime.seatMap.categories.map((c) => [c.code, c.name]));
  return {
    ...summary(showtime, taken.get(String(showtime._id)) ?? 0, now),
    seatMap: showtime.seatMap,
    prices: showtime.prices.map((p) => ({ category: p.category, name: categoryNames.get(p.category), amount: p.amount })),
  };
}

// ---------- Administration ----------

function checkPrices(prices, layout) {
  const codes = layout.categories.map((c) => c.code).sort();
  const priced = prices.map((p) => p.category).sort();
  if (codes.join() !== priced.join()) {
    throw new AppError(400, 'PRICES_MISMATCH', `Provide exactly one price for each seat category: ${codes.join(', ')}`);
  }
}

function checkLanguage(language, movie) {
  const match = movie.languages.find((l) => l.toLowerCase() === language.toLowerCase());
  if (!match) throw new AppError(400, 'INVALID_LANGUAGE', `This movie is available in: ${movie.languages.join(', ')}`);
  return match;
}

function checkStart(startsAt, movie, now) {
  if (startsAt <= now) throw new AppError(400, 'SHOWTIME_IN_PAST', 'The showtime must start in the future');
  if (istDateKey(startsAt) < istDateKey(movie.releaseDate)) {
    throw new AppError(400, 'BEFORE_RELEASE', `This movie releases on ${istDateKey(movie.releaseDate)}`);
  }
}

function overlapError(conflict) {
  return new AppError(409, 'SHOWTIME_OVERLAP', 'This screen is already booked for an overlapping show (including turnaround time)', {
    conflictingShowtimeId: String(conflict._id),
    startsAt: conflict.startsAt,
    busyUntil: conflict.blockedUntil,
  });
}

export async function createShowtime({ movieId, screenId, date, time, language, prices }, actor) {
  const now = clock.now();
  const movie = await Movie.findById(movieId);
  if (!movie) throw new AppError(404, 'MOVIE_NOT_FOUND', 'Movie not found');
  if (movie.status !== MOVIE_STATUS.PUBLISHED) throw new AppError(409, 'MOVIE_NOT_PUBLISHED', 'Publish the movie before scheduling it');
  const screen = await Screen.findById(screenId).populate('theatre', 'isActive name');
  if (!screen) throw new AppError(404, 'SCREEN_NOT_FOUND', 'Screen not found');
  if (!screen.isActive || !screen.theatre?.isActive) throw new AppError(409, 'SCREEN_INACTIVE', 'This screen or its theatre is inactive');

  const startsAt = istToDate(date, time);
  checkStart(startsAt, movie, now);
  const canonicalLanguage = checkLanguage(language, movie);
  checkPrices(prices, screen.layout);
  const window = computeShowtimeWindow(startsAt, movie.durationMins);

  const showtime = await withTransaction(async (session) => {
    // Writing the screen document makes concurrent scheduling of the SAME screen conflict, so one
    // transaction retries and its overlap check below then sees the other's committed showtime.
    const locked = await Screen.findOneAndUpdate({ _id: screenId, isActive: true }, { $inc: { scheduleVersion: 1 } }, { session });
    if (!locked) throw new AppError(409, 'SCREEN_INACTIVE', 'This screen is inactive');
    const conflict = await findOverlappingShowtime({ screenId, ...window, session });
    if (conflict) throw overlapError(conflict);
    const [created] = await Showtime.create(
      [
        {
          movie: movie._id,
          theatre: screen.theatre._id,
          screen: screen._id,
          language: canonicalLanguage,
          format: screen.format,
          ...window,
          seatMap: screen.layout.toObject(),
          prices,
        },
      ],
      { session },
    );
    await audit({ actor, action: 'SHOWTIME_CREATED', entityType: 'Showtime', entityId: created._id, details: { movie: movie.title, startsAt }, session });
    return created;
  });
  return showtime;
}

/**
 * Prices and language can change at any time (existing bookings keep the price they paid).
 * Date/time can only change while nobody holds or has booked seats, so customers' tickets never move.
 */
export async function updateShowtime(id, body, actor) {
  const now = clock.now();
  const existing = await Showtime.findById(id).populate('movie', 'languages releaseDate durationMins title');
  if (!existing) throw showtimeNotFound();
  if (existing.status !== SHOWTIME_STATUS.SCHEDULED) throw new AppError(409, 'SHOWTIME_CANCELLED', 'Cancelled showtimes cannot be edited');
  if (existing.startsAt <= now) throw new AppError(409, 'SHOWTIME_STARTED', 'This show has already started');

  const changes = {};
  if (body.prices) {
    checkPrices(body.prices, existing.seatMap);
    changes.prices = body.prices;
  }
  if (body.language) changes.language = checkLanguage(body.language, existing.movie);
  let window;
  if (body.date) {
    const startsAt = istToDate(body.date, body.time);
    checkStart(startsAt, existing.movie, now);
    window = computeShowtimeWindow(startsAt, existing.movie.durationMins);
    Object.assign(changes, window);
  }

  return withTransaction(async (session) => {
    if (window) {
      if (await Booking.exists({ showtime: id, status: { $in: ACTIVE_BOOKING_STATUSES } }).session(session)) {
        throw new AppError(409, 'SHOWTIME_HAS_BOOKINGS', 'Seats are held or booked for this show, so its time can no longer change');
      }
      await Screen.updateOne({ _id: existing.screen }, { $inc: { scheduleVersion: 1 } }, { session });
      const conflict = await findOverlappingShowtime({ screenId: existing.screen, ...window, excludeId: id, session });
      if (conflict) throw overlapError(conflict);
    }
    // lockVersion: a booking transaction writes the same document, so the two can't interleave.
    const updated = await Showtime.findOneAndUpdate(
      { _id: id, status: SHOWTIME_STATUS.SCHEDULED },
      { $set: changes, $inc: { lockVersion: 1 } },
      { session, returnDocument: 'after', runValidators: true },
    );
    if (!updated) throw new AppError(409, 'SHOWTIME_CANCELLED', 'This showtime was cancelled');
    await audit({ actor, action: 'SHOWTIME_UPDATED', entityType: 'Showtime', entityId: id, details: { fields: Object.keys(body) }, session });
    return updated;
  });
}

export async function listAdminShowtimes({ movie, theatre, screen, date, status, when, page, pageSize }) {
  const now = clock.now();
  const filter = {
    ...(movie && { movie }),
    ...(theatre && { theatre }),
    ...(screen && { screen }),
    ...(status && { status }),
  };
  if (date) {
    const { start, end } = istDayRange(date);
    filter.startsAt = { $gte: start, $lt: end };
  } else if (when === 'upcoming') filter.endsAt = { $gt: now };
  else if (when === 'past') filter.endsAt = { $lte: now };

  const result = await paginate(Showtime, filter, {
    page,
    pageSize,
    sort: when === 'past' ? { startsAt: -1 } : { startsAt: 1 },
    populate: POPULATE,
  });
  const taken = await takenSeatCounts(result.items.map((s) => s._id), now);
  return {
    ...result,
    items: result.items.map((s) => ({ ...summary(s, taken.get(String(s._id)) ?? 0, now), cancellation: s.cancellation, prices: s.prices })),
  };
}
