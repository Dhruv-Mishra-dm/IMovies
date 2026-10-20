import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { seedCatalogue } from '../src/seed/seedDatabase.js';
import { Movie, Theatre, Screen, Showtime } from '../src/models/index.js';
import { SHOWTIME_TURNAROUND_MINUTES } from '../src/config/business.js';
import { istDateKey } from '../src/utils/time.js';

describe('development seed', () => {
  const now = new Date('2026-11-02T04:30:00Z'); // 10:00 IST

  before(async () => {
    await connectTestDB();
    await clearTestDB();
  });
  after(disconnectTestDB);

  it('creates a demonstrable catalogue', async () => {
    const created = await seedCatalogue({ now });
    assert.deepEqual({ movies: created.movies, theatres: created.theatres, screens: created.screens }, { movies: 11, theatres: 4, screens: 6 });
    assert.ok(created.showtimes > 100, `expected many showtimes, got ${created.showtimes}`);

    assert.equal(await Movie.countDocuments({ status: 'DRAFT' }), 1);
    assert.equal(await Movie.countDocuments({ status: 'PUBLISHED', releaseDate: { $gt: now } }), 2); // coming soon
    assert.deepEqual((await Theatre.distinct('city')).sort(), ['Bengaluru', 'Delhi', 'Mumbai']);
  });

  it('is idempotent: a second run creates nothing', async () => {
    const before = await Showtime.countDocuments();
    const created = await seedCatalogue({ now });
    assert.deepEqual(created, { movies: 0, theatres: 0, screens: 0, showtimes: 0 });
    assert.equal(await Showtime.countDocuments(), before);
    assert.equal(await Screen.countDocuments(), 6);
  });

  it('never schedules overlapping shows on a screen, unreleased movies, or past shows', async () => {
    const showtimes = await Showtime.find().sort({ screen: 1, startsAt: 1 }).populate('movie', 'releaseDate durationMins status');
    for (let i = 1; i < showtimes.length; i += 1) {
      const [prev, cur] = [showtimes[i - 1], showtimes[i]];
      if (String(prev.screen) === String(cur.screen)) assert.ok(prev.blockedUntil <= cur.startsAt, 'overlap found');
    }
    for (const show of showtimes) {
      assert.ok(show.startsAt > now);
      assert.equal(show.movie.status, 'PUBLISHED');
      assert.ok(istDateKey(show.movie.releaseDate) <= istDateKey(show.startsAt), 'movie shown before release');
      assert.equal(show.blockedUntil - show.endsAt, SHOWTIME_TURNAROUND_MINUTES * 60_000);
      assert.equal(show.prices.length, show.seatMap.categories.length);
    }
  });

  it('does not overwrite admin edits on re-run', async () => {
    await Movie.updateOne({ slug: 'velocity-run' }, { $set: { title: 'Velocity Run (Director’s Cut)' } });
    await seedCatalogue({ now });
    assert.equal((await Movie.findOne({ slug: 'velocity-run' })).title, 'Velocity Run (Director’s Cut)');
  });
});
