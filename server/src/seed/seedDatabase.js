import { Movie, Theatre, Screen, Showtime } from '../models/index.js';
import { MOVIE_STATUS, SHOWTIME_STATUS } from '../domain/statuses.js';
import { computeShowtimeWindow, findOverlappingShowtime } from '../services/scheduling.js';
import { istDateKey, istToDate, addDaysToKey } from '../utils/time.js';
import { clock, minutes } from '../utils/clock.js';
import * as data from './data.js';

function releaseDateFor(today, offsetDays) {
  return istToDate(addDaysToKey(today, offsetDays), '00:00');
}

/**
 * Inserts demo movies, theatres, screens and upcoming showtimes.
 *
 * Idempotent: movies/theatres are matched by slug, screens by (theatre, name), showtimes by
 * (screen, startsAt). Existing records are left untouched ($setOnInsert), so re-running never
 * duplicates data and never overwrites changes an admin made. Returns how many records were created.
 */
export async function seedCatalogue({ now = clock.now() } = {}) {
  const today = istDateKey(now);
  const created = { movies: 0, theatres: 0, screens: 0, showtimes: 0 };

  const movieDocs = [];
  for (const movie of [...data.movies, data.draftMovie]) {
    const { releaseOffsetDays, ...fields } = movie;
    const isDraft = movie === data.draftMovie;
    const result = await Movie.findOneAndUpdate(
      { slug: movie.slug },
      {
        $setOnInsert: {
          ...fields,
          posterUrl: `/posters/${movie.slug}.svg`,
          backdropUrl: `/backdrops/${movie.slug}.svg`,
          releaseDate: releaseDateFor(today, releaseOffsetDays),
          status: isDraft ? MOVIE_STATUS.DRAFT : MOVIE_STATUS.PUBLISHED,
          ...(!isDraft && { publishedAt: now }),
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true, includeResultMetadata: true },
    );
    if (!result.lastErrorObject?.updatedExisting) created.movies += 1;
    if (!isDraft) movieDocs.push(result.value);
  }

  const screens = [];
  for (const { screens: screenSpecs, ...theatreFields } of data.theatres) {
    const theatreResult = await Theatre.findOneAndUpdate(
      { slug: theatreFields.slug },
      { $setOnInsert: theatreFields },
      { upsert: true, returnDocument: 'after', runValidators: true, includeResultMetadata: true },
    );
    if (!theatreResult.lastErrorObject?.updatedExisting) created.theatres += 1;
    const theatre = theatreResult.value;

    for (const spec of screenSpecs) {
      let screen = await Screen.findOne({ theatre: theatre._id, name: spec.name });
      if (!screen) {
        screen = await Screen.create({ theatre: theatre._id, ...spec });
        created.screens += 1;
      }
      screens.push({ screen, theatre });
    }
  }

  // Showtimes for the next SEED_DAYS days, rotating through movies that have been released by that day.
  for (const [screenIndex, { screen, theatre }] of screens.entries()) {
    if (!screen.isActive || !theatre.isActive) continue;
    for (let day = 0; day < data.SEED_DAYS; day += 1) {
      const dateKey = addDaysToKey(today, day);
      const available = movieDocs.filter((m) => m.status === MOVIE_STATUS.PUBLISHED && istDateKey(m.releaseDate) <= dateKey);
      if (available.length === 0) continue;

      for (const [slotIndex, slot] of data.DAILY_SLOTS.entries()) {
        const startsAt = istToDate(dateKey, slot);
        if (startsAt.getTime() < now.getTime() + minutes(30)) continue; // don't create shows about to start

        const movie = available[(screenIndex * 3 + day + slotIndex) % available.length];
        const window = computeShowtimeWindow(startsAt, movie.durationMins);
        if (await Showtime.exists({ screen: screen._id, startsAt })) continue;
        if (await findOverlappingShowtime({ screenId: screen._id, ...window })) continue;

        const evening = slot >= '17:00';
        const prices = screen.layout.categories.map(({ code }) => ({
          category: code,
          amount: data.basePrices[code] + (evening ? data.EVENING_SURCHARGE : 0),
        }));

        await Showtime.create({
          movie: movie._id,
          theatre: theatre._id,
          screen: screen._id,
          language: movie.languages[(day + slotIndex) % movie.languages.length],
          format: screen.format,
          ...window,
          seatMap: screen.layout.toObject(),
          prices,
          status: SHOWTIME_STATUS.SCHEDULED,
        });
        created.showtimes += 1;
      }
    }
  }

  return created;
}

/** How many bookable demo shows lie ahead of `now`, and the IST date of the last one (null if none). */
export async function upcomingShowtimeSummary({ now = clock.now() } = {}) {
  const filter = { status: SHOWTIME_STATUS.SCHEDULED, startsAt: { $gt: now } };
  const [count, last] = await Promise.all([
    Showtime.countDocuments(filter),
    Showtime.findOne(filter).sort({ startsAt: -1 }).select('startsAt').lean(),
  ]);
  return { count, lastDate: last ? istDateKey(last.startsAt) : null };
}
