// Small builders for test data. Each returns a saved document with sensible defaults
// that a test can override.
import { randomUUID } from 'node:crypto';
import { User, Movie, Theatre, Screen, Showtime, Booking } from '../../src/models/index.js';
import { buildLayout } from '../../src/domain/seatLayout.js';
import { computeShowtimeWindow } from '../../src/services/scheduling.js';
import { clock, minutes } from '../../src/utils/clock.js';

const unique = () => randomUUID().slice(0, 8);

export const smallLayout = buildLayout({
  categories: [
    { code: 'CLASSIC', name: 'Classic' },
    { code: 'RECLINER', name: 'Recliner' },
  ],
  rows: [
    { label: 'A', category: 'CLASSIC', seats: 6, aisleAfter: [3], disabled: [6] },
    { label: 'B', category: 'CLASSIC', seats: 6, aisleAfter: [3] },
    { label: 'C', category: 'RECLINER', seats: 4, aisleAfter: [2] },
  ],
});

export function createUser(overrides = {}) {
  return User.create({
    name: 'Test User',
    email: `user-${unique()}@example.test`,
    passwordHash: '$2b$04$placeholderplaceholderplaceholderplaceholderplace',
    ...overrides,
  });
}

export function createMovie(overrides = {}) {
  const id = unique();
  return Movie.create({
    title: `Test Movie ${id}`,
    slug: `test-movie-${id}`,
    genres: ['Drama'],
    languages: ['English'],
    durationMins: 120,
    certification: 'U',
    releaseDate: new Date('2026-01-01T00:00:00Z'),
    status: 'PUBLISHED',
    ...overrides,
  });
}

export function createTheatre(overrides = {}) {
  const id = unique();
  return Theatre.create({ name: `Test Theatre ${id}`, slug: `test-theatre-${id}`, city: 'Mumbai', address: '1 Test Road, Mumbai', ...overrides });
}

export async function createScreen(overrides = {}) {
  const theatre = overrides.theatre ?? (await createTheatre())._id;
  return Screen.create({ theatre, name: `Screen ${unique()}`, layout: smallLayout, ...overrides });
}

/** A scheduled showtime starting `startsInMinutes` from the (test) clock's now. */
export async function createShowtime({ startsInMinutes = 24 * 60, movie, screen, ...overrides } = {}) {
  const movieDoc = movie ?? (await createMovie());
  const screenDoc = screen ?? (await createScreen());
  const startsAt = new Date(clock.now().getTime() + minutes(startsInMinutes));
  return Showtime.create({
    movie: movieDoc._id,
    theatre: screenDoc.theatre,
    screen: screenDoc._id,
    language: 'English',
    format: screenDoc.format,
    ...computeShowtimeWindow(startsAt, movieDoc.durationMins),
    seatMap: screenDoc.layout.toObject(),
    prices: [
      { category: 'CLASSIC', amount: 20000 },
      { category: 'RECLINER', amount: 45000 },
    ],
    ...overrides,
  });
}

export function bookingFields({ user, showtime, status = 'HELD', seats = [{ seatId: 'A1', category: 'CLASSIC', categoryName: 'Classic', price: 20000 }] }) {
  return {
    reference: `IMV-${unique().toUpperCase().replace(/[^A-Z0-9]/g, '0')}`,
    user: user._id,
    showtime: showtime._id,
    status,
    seats,
    totalAmount: seats.reduce((sum, s) => sum + s.price, 0),
    holdExpiresAt: new Date(clock.now().getTime() + minutes(10)),
    snapshot: {
      movie: { id: showtime.movie, title: 'Test Movie' },
      theatre: { id: showtime.theatre, name: 'Test Theatre' },
      screen: { id: showtime.screen, name: 'Screen' },
      startsAt: showtime.startsAt,
      endsAt: showtime.endsAt,
    },
  };
}

export function createBooking(args) {
  return Booking.create(bookingFields(args));
}
