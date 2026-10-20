import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { testApp, adminClient, registeredCustomer } from './helpers/http.js';
import { createMovie, createShowtime } from './helpers/factories.js';
import { Movie, AuditLog } from '../src/models/index.js';
import { clock, minutes } from '../src/utils/clock.js';

const app = testApp();
const day = minutes(24 * 60);
const ago = (days) => new Date(clock.now().getTime() - days * day);

describe('movie catalogue', () => {
  before(connectTestDB);
  after(disconnectTestDB);
  beforeEach(clearTestDB);

  describe('public API', () => {
    beforeEach(async () => {
      await createMovie({ title: 'Alpha Dawn', slug: 'alpha-dawn', genres: ['Action'], languages: ['Hindi'], releaseDate: ago(10) });
      await createMovie({ title: 'Beta Tides', slug: 'beta-tides', genres: ['Drama'], languages: ['English', 'Tamil'], releaseDate: ago(3) });
      await createMovie({ title: 'Gamma (Rising)', slug: 'gamma-rising', genres: ['Action', 'Sci-Fi'], languages: ['English'], releaseDate: ago(-20) });
      await createMovie({ title: 'Secret Draft', slug: 'secret-draft', status: 'DRAFT', releaseDate: ago(1) });
      await createMovie({ title: 'Old Archived', slug: 'old-archived', status: 'ARCHIVED', releaseDate: ago(400) });
    });

    it('lists only published movies, newest release first, without heavy fields', async () => {
      const res = await request(app).get('/api/movies');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items.map((m) => m.slug), ['gamma-rising', 'beta-tides', 'alpha-dawn']);
      assert.equal(res.body.total, 3);
      assert.equal(res.body.items[0].synopsis, undefined);
      assert.ok(res.body.items[0].id);
    });

    it('paginates', async () => {
      const page1 = await request(app).get('/api/movies?pageSize=2&page=1');
      const page2 = await request(app).get('/api/movies?pageSize=2&page=2');
      assert.deepEqual([page1.body.total, page1.body.totalPages, page1.body.items.length, page2.body.items.length], [3, 2, 2, 1]);
      const all = [...page1.body.items, ...page2.body.items].map((m) => m.slug);
      assert.equal(new Set(all).size, 3);
    });

    it('searches titles case-insensitively and treats regex characters literally', async () => {
      assert.deepEqual((await request(app).get('/api/movies?q=TIDES')).body.items.map((m) => m.slug), ['beta-tides']);
      assert.deepEqual((await request(app).get('/api/movies?q=(Rising)')).body.items.map((m) => m.slug), ['gamma-rising']);
      assert.equal((await request(app).get('/api/movies?q=.*')).body.total, 0);
      assert.equal((await request(app).get('/api/movies?q=secret')).body.total, 0); // drafts never found
    });

    it('filters by genre, language and release status', async () => {
      const slugs = async (qs) => (await request(app).get(`/api/movies?${qs}`)).body.items.map((m) => m.slug).sort();
      assert.deepEqual(await slugs('genre=Action'), ['alpha-dawn', 'gamma-rising']);
      assert.deepEqual(await slugs('language=tamil'), ['beta-tides']);
      assert.deepEqual(await slugs('release=now-showing'), ['alpha-dawn', 'beta-tides']);
      assert.deepEqual(await slugs('release=coming-soon'), ['gamma-rising']);
      assert.deepEqual(await slugs('genre=Action&release=now-showing'), ['alpha-dawn']);
    });

    it('sorts by title', async () => {
      const res = await request(app).get('/api/movies?sort=title');
      assert.deepEqual(res.body.items.map((m) => m.title), ['Alpha Dawn', 'Beta Tides', 'Gamma (Rising)']);
    });

    it('rejects invalid query parameters', async () => {
      for (const qs of ['genre=Western', 'page=0', 'pageSize=500', 'release=yesterday', 'sort=random']) {
        const res = await request(app).get(`/api/movies?${qs}`);
        assert.equal(res.status, 400, qs);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      }
    });

    it('returns a movie by slug or id, and 404 for drafts, archived or missing movies', async () => {
      const bySlug = await request(app).get('/api/movies/beta-tides');
      assert.equal(bySlug.status, 200);
      assert.equal(bySlug.body.movie.title, 'Beta Tides');
      assert.equal((await request(app).get(`/api/movies/${bySlug.body.movie.id}`)).body.movie.slug, 'beta-tides');

      for (const slug of ['secret-draft', 'old-archived', 'no-such-movie', '507f1f77bcf86cd799439011']) {
        const res = await request(app).get(`/api/movies/${slug}`);
        assert.equal(res.status, 404, slug);
        assert.equal(res.body.error.code, 'MOVIE_NOT_FOUND');
      }
      assert.equal((await request(app).get('/api/movies/Bad%20Slug!')).status, 400);
    });

    it('lists filter options from published movies only', async () => {
      const res = await request(app).get('/api/movies/filters');
      assert.deepEqual(res.body.genres, ['Action', 'Drama', 'Sci-Fi']);
      assert.deepEqual(res.body.languages, ['English', 'Hindi', 'Tamil']);
    });
  });

  describe('admin API', () => {
    const validMovie = {
      title: 'The New One',
      synopsis: 'A test film.',
      genres: ['Drama'],
      languages: ['Hindi'],
      durationMins: 125,
      certification: 'UA 13+',
      releaseDate: '2026-12-25',
      cast: ['Actor One'],
      posterUrl: '/posters/placeholder.svg',
    };

    it('rejects anonymous users (401) and customers (403)', async () => {
      assert.equal((await request(app).get('/api/admin/movies')).status, 401);
      const { client } = await registeredCustomer(app);
      assert.equal((await client.get('/api/admin/movies')).status, 403);
      assert.equal((await client.post('/api/admin/movies', validMovie)).status, 403);
      assert.equal(await Movie.countDocuments(), 0);
    });

    it('creates a draft with a generated slug and IST release date, ignoring a client-sent status', async () => {
      const { client, user } = await adminClient(app);
      const res = await client.post('/api/admin/movies', { ...validMovie, status: 'PUBLISHED' });
      assert.equal(res.status, 201);
      assert.equal(res.body.movie.status, 'DRAFT');
      assert.equal(res.body.movie.slug, 'the-new-one');
      assert.equal(res.body.movie.releaseDate, '2026-12-24T18:30:00.000Z'); // midnight IST
      const second = await client.post('/api/admin/movies', validMovie);
      assert.equal(second.body.movie.slug, 'the-new-one-2');
      assert.equal(await AuditLog.countDocuments({ actor: user._id, action: 'MOVIE_CREATED' }), 2);
    });

    it('validates input with field-level details', async () => {
      const { client } = await adminClient(app);
      const res = await client.post('/api/admin/movies', { ...validMovie, durationMins: 10, genres: [], posterUrl: 'javascript:alert(1)' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body.error.details.map((d) => d.path).sort(), ['durationMins', 'genres', 'posterUrl']);
    });

    it('updates, publishes and archives a movie with valid transitions only', async () => {
      const { client } = await adminClient(app);
      const { movie } = (await client.post('/api/admin/movies', validMovie)).body;

      const updated = await client.patch(`/api/admin/movies/${movie.id}`, { title: 'Renamed', status: 'ARCHIVED' });
      assert.equal(updated.body.movie.title, 'Renamed');
      assert.equal(updated.body.movie.status, 'DRAFT');

      assert.equal((await request(app).get(`/api/movies/${movie.id}`)).status, 404); // draft not public yet
      assert.equal((await client.post(`/api/admin/movies/${movie.id}/publish`)).body.movie.status, 'PUBLISHED');
      assert.equal((await request(app).get(`/api/movies/${movie.id}`)).status, 200);

      const again = await client.post(`/api/admin/movies/${movie.id}/publish`);
      assert.equal(again.status, 409);
      assert.equal(again.body.error.code, 'INVALID_STATUS_CHANGE');

      assert.equal((await client.post(`/api/admin/movies/${movie.id}/archive`)).body.movie.status, 'ARCHIVED');
      assert.equal((await request(app).get(`/api/movies/${movie.id}`)).status, 404);
    });

    it('refuses to archive a movie with upcoming showtimes', async () => {
      const { client } = await adminClient(app);
      const movie = await createMovie();
      await createShowtime({ movie, startsInMinutes: 300 });
      const res = await client.post(`/api/admin/movies/${movie.id}/archive`);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'MOVIE_HAS_UPCOMING_SHOWS');
    });

    it('deletes only never-scheduled drafts', async () => {
      const { client } = await adminClient(app);
      const draft = await createMovie({ status: 'DRAFT' });
      const published = await createMovie();
      const scheduledDraft = await createMovie({ status: 'DRAFT' });
      await createShowtime({ movie: scheduledDraft });

      assert.equal((await client.delete(`/api/admin/movies/${published.id}`)).status, 409);
      assert.equal((await client.delete(`/api/admin/movies/${scheduledDraft.id}`)).status, 409);
      assert.equal((await client.delete(`/api/admin/movies/${draft.id}`)).status, 204);
      assert.equal(await Movie.exists({ _id: draft._id }), null);
    });

    it('returns 400 for malformed ids and 404 for unknown ones', async () => {
      const { client } = await adminClient(app);
      assert.equal((await client.get('/api/admin/movies/not-an-id')).status, 400);
      assert.equal((await client.get('/api/admin/movies/507f1f77bcf86cd799439011')).status, 404);
    });

    it('rejects a duplicate explicit slug with 409', async () => {
      const { client } = await adminClient(app);
      await client.post('/api/admin/movies', { ...validMovie, slug: 'taken' });
      const res = await client.post('/api/admin/movies', { ...validMovie, slug: 'taken' });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'SLUG_TAKEN');
    });
  });
});
