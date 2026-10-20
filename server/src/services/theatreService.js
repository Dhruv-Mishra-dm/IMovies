import { Theatre, Screen, Showtime } from '../models/index.js';
import { slugify } from '../models/shared.js';
import { SHOWTIME_STATUS } from '../domain/statuses.js';
import { AppError } from '../utils/AppError.js';
import { clock } from '../utils/clock.js';
import { equalsText } from '../utils/query.js';
import { isDuplicateKeyError } from '../utils/transaction.js';
import { audit } from './auditService.js';

const theatreNotFound = () => new AppError(404, 'THEATRE_NOT_FOUND', 'Theatre not found');
const screenNotFound = () => new AppError(404, 'SCREEN_NOT_FOUND', 'Screen not found');

const byIdOrSlug = (v) => (/^[a-f\d]{24}$/i.test(v) ? { _id: v } : { slug: v });

const upcomingShows = (filter) =>
  Showtime.countDocuments({ ...filter, status: SHOWTIME_STATUS.SCHEDULED, startsAt: { $gt: clock.now() } });

// ---------- Public ----------

export async function listCities() {
  return (await Theatre.distinct('city', { isActive: true })).sort();
}

export async function listPublicTheatres({ city }) {
  const theatres = await Theatre.find({ isActive: true, ...(city && { city: equalsText(city) }) }).sort({ city: 1, name: 1 });
  const screenCounts = await Screen.aggregate([
    { $match: { theatre: { $in: theatres.map((t) => t._id) }, isActive: true } },
    { $group: { _id: '$theatre', screens: { $sum: 1 } } },
  ]);
  const counts = new Map(screenCounts.map((c) => [String(c._id), c.screens]));
  return theatres.map((t) => ({ ...t.toJSON(), screenCount: counts.get(String(t._id)) ?? 0 }));
}

export async function getPublicTheatre(idOrSlug) {
  const theatre = await Theatre.findOne({ ...byIdOrSlug(idOrSlug), isActive: true });
  if (!theatre) throw theatreNotFound();
  const screens = await Screen.find({ theatre: theatre._id, isActive: true }).select('name format capacity').sort({ name: 1 });
  return { theatre, screens };
}

// ---------- Admin: theatres ----------

export async function listAllTheatres() {
  const theatres = await Theatre.find().sort({ city: 1, name: 1 });
  const screens = await Screen.find().select('theatre name format capacity isActive').sort({ name: 1 });
  return theatres.map((t) => ({ ...t.toJSON(), screens: screens.filter((s) => String(s.theatre) === String(t._id)) }));
}

export async function getTheatreForAdmin(id) {
  const theatre = await Theatre.findById(id);
  if (!theatre) throw theatreNotFound();
  const screens = await Screen.find({ theatre: id }).sort({ name: 1 });
  return { theatre, screens };
}

async function uniqueSlug(base) {
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await Theatre.exists({ slug: candidate }))) return candidate;
  }
  throw new AppError(409, 'SLUG_TAKEN', 'Could not generate a unique slug; please provide one');
}

export async function createTheatre(body, actor) {
  try {
    const theatre = await Theatre.create({ ...body, slug: body.slug ?? (await uniqueSlug(slugify(body.name) || 'theatre')) });
    await audit({ actor, action: 'THEATRE_CREATED', entityType: 'Theatre', entityId: theatre._id, details: { name: theatre.name } });
    return theatre;
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'SLUG_TAKEN', 'Another theatre already uses this slug');
    throw err;
  }
}

export async function updateTheatre(id, body, actor) {
  const theatre = await Theatre.findById(id);
  if (!theatre) throw theatreNotFound();
  if (body.isActive === false && theatre.isActive) {
    const upcoming = await upcomingShows({ theatre: id });
    if (upcoming) throw new AppError(409, 'THEATRE_HAS_UPCOMING_SHOWS', `Cancel the ${upcoming} upcoming showtime(s) before deactivating this theatre`);
  }
  theatre.set(body);
  try {
    await theatre.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'SLUG_TAKEN', 'Another theatre already uses this slug');
    throw err;
  }
  await audit({ actor, action: 'THEATRE_UPDATED', entityType: 'Theatre', entityId: id, details: { fields: Object.keys(body) } });
  return theatre;
}

// ---------- Admin: screens ----------

export async function createScreen(theatreId, body, actor) {
  if (!(await Theatre.exists({ _id: theatreId }))) throw theatreNotFound();
  try {
    const screen = await Screen.create({ ...body, theatre: theatreId });
    await audit({ actor, action: 'SCREEN_CREATED', entityType: 'Screen', entityId: screen._id, details: { name: screen.name, capacity: screen.capacity } });
    return screen;
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'SCREEN_NAME_TAKEN', 'This theatre already has a screen with that name');
    throw err;
  }
}

export async function getScreen(id) {
  const screen = await Screen.findById(id).populate('theatre', 'name city slug');
  if (!screen) throw screenNotFound();
  return screen;
}

/**
 * Layout edits are allowed at any time: every showtime keeps its own copy of the seat map, so
 * already-scheduled shows (and their bookings) are unaffected; the new layout applies to shows
 * scheduled afterwards.
 */
export async function updateScreen(id, body, actor) {
  const screen = await Screen.findById(id);
  if (!screen) throw screenNotFound();
  if (body.isActive === false && screen.isActive) {
    const upcoming = await upcomingShows({ screen: id });
    if (upcoming) throw new AppError(409, 'SCREEN_HAS_UPCOMING_SHOWS', `Cancel the ${upcoming} upcoming showtime(s) before deactivating this screen`);
  }
  screen.set(body);
  try {
    await screen.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'SCREEN_NAME_TAKEN', 'This theatre already has a screen with that name');
    throw err;
  }
  await audit({ actor, action: 'SCREEN_UPDATED', entityType: 'Screen', entityId: id, details: { fields: Object.keys(body) } });
  return screen;
}

/** Only never-used screens can be deleted; otherwise deactivate (history must stay explainable). */
export async function deleteScreen(id, actor) {
  const screen = await Screen.findById(id);
  if (!screen) throw screenNotFound();
  if (await Showtime.exists({ screen: id })) throw new AppError(409, 'SCREEN_NOT_DELETABLE', 'This screen has showtimes; deactivate it instead');
  await Screen.deleteOne({ _id: id });
  await audit({ actor, action: 'SCREEN_DELETED', entityType: 'Screen', entityId: id, details: { name: screen.name } });
}
