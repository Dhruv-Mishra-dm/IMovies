import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { testApp, adminClient, registeredCustomer } from './helpers/http.js';
import { createMovie, createTheatre, createScreen, createShowtime, createUser, createBooking, smallLayout } from './helpers/factories.js';
import { Showtime, SeatReservation, Screen, AuditLog } from '../src/models/index.js';
import { buildLayout } from '../src/domain/seatLayout.js';
import { clock, minutes } from '../src/utils/clock.js';
import { istDateKey, addDaysToKey } from '../src/utils/time.js';

const app = testApp();
const PRICES = [
  { category: 'CLASSIC', amount: 20000 },
  { category: 'RECLINER', amount: 45000 },
];
const tomorrow = () => addDaysToKey(istDateKey(clock.now()), 1);

describe('theatres, screens and showtimes', () => {
  before(connectTestDB);
  after(disconnectTestDB);
  beforeEach(clearTestDB);
  afterEach(() => clock.reset());

  describe('public theatres', () => {
    it('lists active theatres by city with screen counts, and cities', async () => {
      const a = await createTheatre({ name: 'Galaxy Bandra', city: 'Mumbai' });
      await createScreen({ theatre: a._id });
      await createScreen({ theatre: a._id, isActive: false });
      await createTheatre({ name: 'Orbit', city: 'Bengaluru' });
      await createTheatre({ name: 'Closed Hall', city: 'Mumbai', isActive: false });

      const mumbai = await request(app).get('/api/theatres?city=mumbai');
      assert.deepEqual(mumbai.body.theatres.map((t) => [t.name, t.screenCount]), [['Galaxy Bandra', 1]]);
      assert.deepEqual((await request(app).get('/api/cities')).body.cities, ['Bengaluru', 'Mumbai']);

      const detail = await request(app).get(`/api/theatres/${a.slug}`);
      assert.equal(detail.body.theatre.name, 'Galaxy Bandra');
      assert.equal(detail.body.screens.length, 1);
      assert.equal((await request(app).get('/api/theatres/closed-hall-x')).status, 404);
    });
  });

  describe('public showtimes', () => {
    it('lists upcoming shows with seats left, filtered by movie, theatre, city and IST date', async () => {
      const movie = await createMovie({ title: 'Alpha' });
      const other = await createMovie({ title: 'Beta' });
      const mumbai = await createTheatre({ city: 'Mumbai' });
      const delhi = await createTheatre({ city: 'Delhi' });
      const s1 = await createShowtime({ movie, screen: await createScreen({ theatre: mumbai._id }), startsInMinutes: 120 });
      await createShowtime({ movie, screen: await createScreen({ theatre: delhi._id }), startsInMinutes: 150 });
      await createShowtime({ movie: other, screen: await createScreen({ theatre: mumbai._id }), startsInMinutes: 180 });
      await createShowtime({ movie, startsInMinutes: -30 }); // started
      await createShowtime({ movie, startsInMinutes: 200, status: 'CANCELLED' });
      await createShowtime({ movie: await createMovie({ status: 'DRAFT' }), startsInMinutes: 100 });

      // one booked seat and one live hold reduce seats left; an expired hold doesn't
      const user = await createUser();
      const booking = await createBooking({ user, showtime: s1 });
      const base = { showtime: s1._id, booking: booking._id, user: user._id };
      await SeatReservation.create([
        { ...base, seatId: 'A1', status: 'BOOKED' },
        { ...base, seatId: 'A2', status: 'HELD', expiresAt: new Date(clock.now().getTime() + minutes(5)) },
        { ...base, seatId: 'A3', status: 'HELD', expiresAt: new Date(clock.now().getTime() - minutes(1)) },
      ]);

      const all = (await request(app).get('/api/showtimes')).body.showtimes;
      assert.equal(all.length, 3);
      const first = all[0];
      assert.equal(first.id, String(s1._id));
      assert.deepEqual([first.capacity, first.seatsLeft, first.priceFrom, first.availability], [15, 13, 20000, 'OPEN']);
      assert.equal(first.movie.title, 'Alpha');

      const q = async (qs) => (await request(app).get(`/api/showtimes?${qs}`)).body.showtimes.length;
      assert.equal(await q(`movie=${movie.id}`), 2);
      assert.equal(await q(`theatre=${mumbai.id}`), 2);
      assert.equal(await q('city=delhi'), 1);
      assert.equal(await q(`movie=${movie.id}&city=Mumbai`), 1);
      assert.equal(await q(`date=${istDateKey(s1.startsAt)}`) >= 1, true);
      assert.equal(await q(`date=${addDaysToKey(istDateKey(clock.now()), 5)}`), 0);
      assert.equal((await request(app).get('/api/showtimes?movie=bad')).status, 400);
    });

    it('lists IST dates that have shows', async () => {
      const movie = await createMovie();
      const s = await createShowtime({ movie, startsInMinutes: 3 * 24 * 60 });
      const res = await request(app).get(`/api/showtimes/dates?movie=${movie.id}`);
      assert.deepEqual(res.body.dates, [istDateKey(s.startsAt)]);
    });

    it('returns one showtime with its seat map and named prices', async () => {
      const s = await createShowtime();
      const res = await request(app).get(`/api/showtimes/${s.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.showtime.seatMap.rows.length, 3);
      assert.deepEqual(res.body.showtime.prices[0], { category: 'CLASSIC', name: 'Classic', amount: 20000 });
      assert.equal((await request(app).get('/api/showtimes/507f1f77bcf86cd799439011')).status, 404);
      assert.equal((await request(app).get('/api/showtimes/not-an-id')).status, 400);
    });

    it('reports availability states derived from the clock', async () => {
      const s = await createShowtime({ startsInMinutes: 10 });
      const state = async () => (await request(app).get(`/api/showtimes/${s.id}`)).body.showtime.availability;
      assert.equal(await state(), 'OPEN');
      clock.advance(minutes(15));
      assert.equal(await state(), 'STARTED');
      clock.advance(minutes(200));
      assert.equal(await state(), 'COMPLETED');
    });
  });

  describe('admin: theatres and screens', () => {
    it('forbids customers', async () => {
      const { client } = await registeredCustomer(app);
      assert.equal((await client.post('/api/admin/theatres', { name: 'X', city: 'Pune', address: '1 Road, Pune' })).status, 403);
    });

    it('creates a theatre and a screen with a validated layout', async () => {
      const { client } = await adminClient(app);
      const theatre = (await client.post('/api/admin/theatres', { name: 'New Cinema', city: 'Pune', address: '12 MG Road, Pune' })).body.theatre;
      assert.equal(theatre.slug, 'new-cinema');

      const bad = await client.post(`/api/admin/theatres/${theatre.id}/screens`, {
        name: 'Audi 1',
        layout: { categories: [{ code: 'CLASSIC', name: 'Classic' }], rows: [{ label: 'A', seats: [{ number: 1, col: 1, category: 'VIP' }] }] },
      });
      assert.equal(bad.status, 400);
      assert.match(JSON.stringify(bad.body.error.details), /unknown category/);

      const ok = await client.post(`/api/admin/theatres/${theatre.id}/screens`, { name: 'Audi 1', format: 'IMAX', layout: smallLayout });
      assert.equal(ok.status, 201);
      assert.equal(ok.body.screen.capacity, 15);
      const dup = await client.post(`/api/admin/theatres/${theatre.id}/screens`, { name: 'Audi 1', layout: smallLayout });
      assert.equal(dup.status, 409);
    });

    it('refuses to deactivate a theatre or screen with upcoming shows, and to delete a used screen', async () => {
      const { client } = await adminClient(app);
      const screen = await createScreen();
      await createShowtime({ screen });
      const t = await client.patch(`/api/admin/theatres/${screen.theatre}`, { isActive: false });
      assert.equal(t.status, 409);
      assert.equal(t.body.error.code, 'THEATRE_HAS_UPCOMING_SHOWS');
      assert.equal((await client.patch(`/api/admin/screens/${screen.id}`, { isActive: false })).body.error.code, 'SCREEN_HAS_UPCOMING_SHOWS');
      assert.equal((await client.delete(`/api/admin/screens/${screen.id}`)).status, 409);
      const unused = await createScreen();
      assert.equal((await client.delete(`/api/admin/screens/${unused.id}`)).status, 204);
    });

    it('lets layout edits apply to future shows only (existing shows keep their snapshot)', async () => {
      const { client } = await adminClient(app);
      const screen = await createScreen();
      const show = await createShowtime({ screen });
      const newLayout = buildLayout({ categories: [{ code: 'CLASSIC', name: 'Classic' }], rows: [{ label: 'A', category: 'CLASSIC', seats: 4 }] });
      assert.equal((await client.patch(`/api/admin/screens/${screen.id}`, { layout: newLayout })).status, 200);
      assert.equal((await Showtime.findById(show._id)).seatMap.rows.length, 3);
      assert.equal((await Screen.findById(screen._id)).capacity, 4);
    });
  });

  describe('admin: scheduling', () => {
    async function setup() {
      const { client, user } = await adminClient(app);
      const movie = await createMovie({ durationMins: 120, languages: ['Hindi', 'English'] });
      const screen = await createScreen();
      return { client, user, movie, screen };
    }
    const body = (movie, screen, time, extra = {}) => ({ movieId: movie.id, screenId: screen.id, date: tomorrow(), time, language: 'hindi', prices: PRICES, ...extra });

    it('creates a showtime from IST date/time with the computed end, turnaround and seat-map snapshot', async () => {
      const { client, movie, screen, user } = await setup();
      const res = await client.post('/api/admin/showtimes', body(movie, screen, '18:30'));
      assert.equal(res.status, 201);
      const s = res.body.showtime;
      assert.equal(new Date(s.startsAt).toISOString(), `${tomorrow()}T13:00:00.000Z`);
      assert.equal((new Date(s.endsAt) - new Date(s.startsAt)) / 60000, 120);
      assert.equal((new Date(s.blockedUntil) - new Date(s.endsAt)) / 60000, 15);
      assert.equal(s.language, 'Hindi'); // canonical spelling from the movie
      assert.equal(s.seatMap.rows.length, 3);
      assert.ok(await AuditLog.exists({ actor: user._id, action: 'SHOWTIME_CREATED' }));
    });

    it('rejects overlaps on the same screen, including turnaround, but allows back-to-back and other screens', async () => {
      const { client, movie, screen } = await setup();
      assert.equal((await client.post('/api/admin/showtimes', body(movie, screen, '10:00'))).status, 201); // busy 10:00–12:15
      const overlap = await client.post('/api/admin/showtimes', body(movie, screen, '12:10'));
      assert.equal(overlap.status, 409);
      assert.equal(overlap.body.error.code, 'SHOWTIME_OVERLAP');
      assert.ok(overlap.body.error.details.conflictingShowtimeId);
      assert.equal((await client.post('/api/admin/showtimes', body(movie, screen, '08:30'))).status, 409); // ends inside
      assert.equal((await client.post('/api/admin/showtimes', body(movie, screen, '12:15'))).status, 201); // exactly at busyUntil
      assert.equal((await client.post('/api/admin/showtimes', body(movie, await createScreen(), '10:00'))).status, 201);
    });

    it('lets exactly one of several simultaneous overlapping schedules succeed', async () => {
      const { client, movie, screen } = await setup();
      const results = await Promise.all(['14:00', '14:20', '14:40', '15:00', '15:20'].map((t) => client.post('/api/admin/showtimes', body(movie, screen, t))));
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.ok(results.every((r) => r.status === 201 || r.body.error?.code === 'SHOWTIME_OVERLAP'));
      assert.equal(await Showtime.countDocuments({ screen: screen._id }), 1);
    });

    it('validates movie, screen, time, language and prices', async () => {
      const { client, movie, screen } = await setup();
      const expectError = async (payload, status, code) => {
        const res = await client.post('/api/admin/showtimes', payload);
        assert.equal(res.status, status, JSON.stringify(res.body));
        if (code) assert.equal(res.body.error.code, code);
      };
      await expectError(body(movie, screen, '18:00', { date: istDateKey(clock.now()), time: '00:00' }), 400, 'SHOWTIME_IN_PAST');
      await expectError(body(movie, screen, '18:00', { language: 'Tamil' }), 400, 'INVALID_LANGUAGE');
      await expectError(body(movie, screen, '18:00', { prices: [PRICES[0]] }), 400, 'PRICES_MISMATCH');
      await expectError(body(movie, screen, '18:00', { prices: [PRICES[0], PRICES[0]] }), 400, 'VALIDATION_ERROR');
      await expectError(body(movie, screen, '25:00'), 400, 'VALIDATION_ERROR');
      await expectError(body(await createMovie({ status: 'DRAFT' }), screen, '18:00'), 409, 'MOVIE_NOT_PUBLISHED');
      await expectError(body(await createMovie({ releaseDate: new Date('2099-01-01') }), screen, '18:00'), 400, 'BEFORE_RELEASE');
      await expectError(body(movie, await createScreen({ isActive: false }), '18:00'), 409, 'SCREEN_INACTIVE');
      await expectError({ ...body(movie, screen, '18:00'), screenId: '507f1f77bcf86cd799439011' }, 404, 'SCREEN_NOT_FOUND');
    });

    it('allows price/language edits but not a time change once seats are held or booked', async () => {
      const { client, movie, screen } = await setup();
      const s = (await client.post('/api/admin/showtimes', body(movie, screen, '18:00'))).body.showtime;
      const retimed = await client.patch(`/api/admin/showtimes/${s.id}`, { date: tomorrow(), time: '19:00' });
      assert.equal(retimed.status, 200, JSON.stringify(retimed.body));

      await createBooking({ user: await createUser(), showtime: await Showtime.findById(s.id) });
      const moved = await client.patch(`/api/admin/showtimes/${s.id}`, { date: tomorrow(), time: '20:00' });
      assert.equal(moved.status, 409);
      assert.equal(moved.body.error.code, 'SHOWTIME_HAS_BOOKINGS');
      const repriced = await client.patch(`/api/admin/showtimes/${s.id}`, { prices: [{ category: 'CLASSIC', amount: 30000 }, PRICES[1]], language: 'English' });
      assert.equal(repriced.status, 200, JSON.stringify(repriced.body));
      assert.equal(repriced.body.showtime.prices[0].amount, 30000);
    });

    it('lists showtimes for admins with seat counts', async () => {
      const { client } = await setup();
      await createShowtime({ startsInMinutes: 300 });
      await createShowtime({ startsInMinutes: -500 });
      const upcoming = await client.get('/api/admin/showtimes');
      assert.equal(upcoming.body.total, 1);
      assert.equal(upcoming.body.items[0].seatsLeft, 15);
      assert.equal((await client.get('/api/admin/showtimes?when=past')).body.total, 1);
    });
  });
});
