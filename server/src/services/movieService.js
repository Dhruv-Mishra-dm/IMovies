import mongoose from 'mongoose';
import { Movie, Showtime } from '../models/index.js';
import { slugify } from '../models/shared.js';
import { MOVIE_STATUS, SHOWTIME_STATUS, canTransition } from '../domain/statuses.js';
import { AppError } from '../utils/AppError.js';
import { clock } from '../utils/clock.js';
import { istToDate } from '../utils/time.js';
import { containsText, equalsText, paginate } from '../utils/query.js';
import { isDuplicateKeyError } from '../utils/transaction.js';
import { audit } from './auditService.js';

const movieNotFound = () => new AppError(404, 'MOVIE_NOT_FOUND', 'Movie not found');

const SORTS = {
  'release-desc': { releaseDate: -1, _id: 1 },
  'release-asc': { releaseDate: 1, _id: 1 },
  title: { title: 1, _id: 1 },
};

// Fields sent to the browser in lists (the synopsis and cast are only needed on the detail page).
const LIST_FIELDS = 'title slug genres languages durationMins certification releaseDate posterUrl status';

function publicReleaseFilter(release, now) {
  if (release === 'now-showing') return { releaseDate: { $lte: now } };
  if (release === 'coming-soon') return { releaseDate: { $gt: now } };
  return {};
}

/** Public catalogue: published movies only. */
export function listPublicMovies({ q, genre, language, release, sort, page, pageSize }) {
  const filter = {
    status: MOVIE_STATUS.PUBLISHED,
    ...publicReleaseFilter(release, clock.now()),
    ...(q && { title: containsText(q) }),
    ...(genre && { genres: genre }),
    ...(language && { languages: equalsText(language) }),
  };
  return paginate(Movie, filter, { page, pageSize, sort: SORTS[sort], select: LIST_FIELDS });
}

/** Genres and languages that appear in the public catalogue (for filter dropdowns). */
export async function publicFilterOptions() {
  const [genres, languages] = await Promise.all([
    Movie.distinct('genres', { status: MOVIE_STATUS.PUBLISHED }),
    Movie.distinct('languages', { status: MOVIE_STATUS.PUBLISHED }),
  ]);
  return { genres: genres.sort(), languages: languages.sort() };
}

function byIdOrSlug(idOrSlug) {
  return mongoose.isValidObjectId(idOrSlug) && /^[a-f\d]{24}$/i.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
}

/** A published movie, or 404 (drafts and archived movies are indistinguishable from missing ones). */
export async function getPublicMovie(idOrSlug) {
  const movie = await Movie.findOne({ ...byIdOrSlug(idOrSlug), status: MOVIE_STATUS.PUBLISHED });
  if (!movie) throw movieNotFound();
  return movie;
}

// ---------- Administration ----------

export function listAllMovies({ q, status, page, pageSize }) {
  const filter = { ...(status && { status }), ...(q && { title: containsText(q) }) };
  return paginate(Movie, filter, { page, pageSize, sort: { updatedAt: -1, _id: 1 }, select: `${LIST_FIELDS} updatedAt` });
}

export async function getMovieForAdmin(id) {
  const movie = await Movie.findById(id);
  if (!movie) throw movieNotFound();
  return movie;
}

function toFields(body) {
  const { releaseDate, ...rest } = body;
  return { ...rest, ...(releaseDate !== undefined && { releaseDate: istToDate(releaseDate, '00:00') }) };
}

async function uniqueSlug(base) {
  const root = base || 'movie';
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    if (!(await Movie.exists({ slug: candidate }))) return candidate;
  }
  throw new AppError(409, 'SLUG_TAKEN', 'Could not generate a unique slug; please provide one');
}

export async function createMovie(body, actor) {
  const fields = toFields(body);
  try {
    const movie = await Movie.create({
      ...fields,
      slug: fields.slug ?? (await uniqueSlug(slugify(fields.title))),
      status: MOVIE_STATUS.DRAFT, // new movies are always drafts until explicitly published
    });
    await audit({ actor, action: 'MOVIE_CREATED', entityType: 'Movie', entityId: movie._id, details: { title: movie.title } });
    return movie;
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'SLUG_TAKEN', 'Another movie already uses this slug');
    throw err;
  }
}

export async function updateMovie(id, body, actor) {
  const movie = await getMovieForAdmin(id);
  // Note: existing showtimes keep their own start/end times, so changing the duration only affects
  // showtimes scheduled afterwards; bookings keep their own snapshot of the title and poster.
  movie.set(toFields(body));
  try {
    await movie.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'SLUG_TAKEN', 'Another movie already uses this slug');
    throw err;
  }
  await audit({ actor, action: 'MOVIE_UPDATED', entityType: 'Movie', entityId: movie._id, details: { fields: Object.keys(body) } });
  return movie;
}

async function transition(id, to, actor, extra = {}) {
  const movie = await getMovieForAdmin(id);
  if (!canTransition('movie', movie.status, to)) {
    throw new AppError(409, 'INVALID_STATUS_CHANGE', `A ${movie.status.toLowerCase()} movie cannot become ${to.toLowerCase()}`);
  }
  // Conditional update: two admins clicking at once can't both apply the transition.
  const updated = await Movie.findOneAndUpdate(
    { _id: id, status: movie.status },
    { $set: { status: to, ...extra } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new AppError(409, 'CONFLICT', 'The movie was changed by someone else; reload and try again');
  await audit({ actor, action: `MOVIE_${to}`, entityType: 'Movie', entityId: id, details: { from: movie.status } });
  return updated;
}

export function publishMovie(id, actor) {
  return transition(id, MOVIE_STATUS.PUBLISHED, actor, { publishedAt: clock.now(), archivedAt: null });
}

export async function archiveMovie(id, actor) {
  const upcoming = await Showtime.countDocuments({ movie: id, status: SHOWTIME_STATUS.SCHEDULED, startsAt: { $gt: clock.now() } });
  if (upcoming > 0) {
    throw new AppError(409, 'MOVIE_HAS_UPCOMING_SHOWS', `Cancel the ${upcoming} upcoming showtime(s) before archiving this movie`);
  }
  return transition(id, MOVIE_STATUS.ARCHIVED, actor, { archivedAt: clock.now() });
}

/** Only never-scheduled drafts can be deleted; everything else is archived to keep history explainable. */
export async function deleteMovie(id, actor) {
  const movie = await getMovieForAdmin(id);
  if (movie.status !== MOVIE_STATUS.DRAFT) throw new AppError(409, 'MOVIE_NOT_DELETABLE', 'Only draft movies can be deleted; archive it instead');
  if (await Showtime.exists({ movie: id })) throw new AppError(409, 'MOVIE_NOT_DELETABLE', 'This movie has been scheduled; archive it instead');
  await Movie.deleteOne({ _id: id, status: MOVIE_STATUS.DRAFT });
  await audit({ actor, action: 'MOVIE_DELETED', entityType: 'Movie', entityId: id, details: { title: movie.title } });
}
