import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { io as connect } from 'socket.io-client';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { testApp, registeredCustomer, ORIGIN } from './helpers/http.js';
import { createShowtime, createMovie } from './helpers/factories.js';
import { attachRealtime } from '../src/sockets/realtime.js';

const app = testApp();
let server;
let realtime;
let url;
const sockets = [];

function open({ origin = ORIGIN, cookie } = {}) {
  const socket = connect(url, {
    path: '/socket.io',
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: { origin, ...(cookie && { cookie }) },
  });
  sockets.push(socket);
  return socket;
}

const connected = (socket) =>
  new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

const join = (socket, showtimeId) => socket.timeout(2000).emitWithAck('showtime:join', showtimeId);

/** Resolves with the next `event`, or null if none arrives within `ms`. */
const nextEvent = (socket, event, ms = 1500) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, ms);
    function handler(payload) {
      clearTimeout(timer);
      resolve(payload);
    }
    socket.once(event, handler);
  });

/** The cookies a supertest agent holds, as a Cookie header for the socket handshake. */
function cookieHeader(client) {
  const cookie = client.agent.jar.getCookie('imovies_at', { domain: '127.0.0.1', path: '/', script: false, secure: false });
  return `imovies_at=${cookie.value}`;
}

describe('real-time seat updates (Socket.IO)', () => {
  before(async () => {
    await connectTestDB();
    server = app.listen(0);
    await once(server, 'listening');
    realtime = attachRealtime(server, { clientOrigin: ORIGIN });
    url = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    for (const s of sockets) s.disconnect();
    await realtime.close();
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDB();
  });
  beforeEach(clearTestDB);

  it('rejects connections from other websites', async () => {
    const socket = open({ origin: 'https://evil.example' });
    await assert.rejects(connected(socket));
  });

  it('broadcasts held, booked and released seats to everyone watching the show — after commit', async () => {
    const showtime = await createShowtime();
    const viewer = open();
    await connected(viewer);
    assert.equal((await join(viewer, showtime.id)).ok, true);

    const buyer = await registeredCustomer(app);
    const held = nextEvent(viewer, 'seats:changed');
    const booking = (await buyer.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['A1', 'A2'] })).body.booking;
    assert.deepEqual((await held).changes, [
      { seatId: 'A1', state: 'held' },
      { seatId: 'A2', state: 'held' },
    ]);

    const booked = nextEvent(viewer, 'seats:changed');
    await buyer.client.post(`/api/bookings/${booking.id}/payments`, { outcome: 'SUCCESS' }).set('Idempotency-Key', randomUUID());
    assert.deepEqual((await booked).changes.map((c) => c.state), ['booked', 'booked']);

    const released = nextEvent(viewer, 'seats:changed');
    await buyer.client.post(`/api/bookings/${booking.id}/cancel`);
    assert.deepEqual((await released).changes.map((c) => c.state), ['available', 'available']);
  });

  it('announces nothing when a hold fails, and nothing to viewers of other shows', async () => {
    const showtime = await createShowtime();
    const other = await createShowtime();
    const a = await registeredCustomer(app);
    const b = await registeredCustomer(app);
    await a.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['A1'] });

    const sameShow = open();
    const otherShow = open();
    await Promise.all([connected(sameShow), connected(otherShow)]);
    await join(sameShow, showtime.id);
    await join(otherShow, other.id);

    const failed = nextEvent(sameShow, 'seats:changed', 800);
    const res = await b.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['A1', 'A2'] });
    assert.equal(res.status, 409);
    assert.equal(await failed, null);

    const elsewhere = nextEvent(otherShow, 'seats:changed', 800);
    await b.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['B1'] });
    assert.equal(await elsewhere, null);
  });

  it('only lets clients join real, public shows', async () => {
    const socket = open();
    await connected(socket);
    assert.deepEqual(await join(socket, 'not-an-id'), { ok: false, error: 'INVALID_ID' });
    assert.deepEqual(await join(socket, '507f1f77bcf86cd799439011'), { ok: false, error: 'NOT_FOUND' });
    const draftShow = await createShowtime({ movie: await createMovie({ status: 'DRAFT' }) });
    assert.deepEqual(await join(socket, draftShow.id), { ok: false, error: 'NOT_FOUND' });
  });

  it('ignores attempts by clients to broadcast seat changes themselves', async () => {
    const showtime = await createShowtime();
    const attacker = open();
    const victim = open();
    await Promise.all([connected(attacker), connected(victim)]);
    await join(attacker, showtime.id);
    await join(victim, showtime.id);
    const received = nextEvent(victim, 'seats:changed', 800);
    attacker.emit('seats:changed', { showtimeId: showtime.id, changes: [{ seatId: 'A1', state: 'booked' }] });
    assert.equal(await received, null);
  });

  it('sends personal booking updates only to the owner', async () => {
    const showtime = await createShowtime();
    const owner = await registeredCustomer(app);
    const stranger = await registeredCustomer(app);
    const ownerSocket = open({ cookie: cookieHeader(owner.client) });
    const strangerSocket = open({ cookie: cookieHeader(stranger.client) });
    await Promise.all([connected(ownerSocket), connected(strangerSocket)]);

    const mine = nextEvent(ownerSocket, 'booking:updated');
    const theirs = nextEvent(strangerSocket, 'booking:updated', 800);
    const booking = (await owner.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['A1'] })).body.booking;
    await owner.client.post(`/api/bookings/${booking.id}/release`);
    assert.deepEqual(await mine, { bookingId: booking.id, status: 'RELEASED' });
    assert.equal(await theirs, null);
  });

  it('a client that missed events while disconnected recovers the authoritative state after reconnecting', async () => {
    const showtime = await createShowtime();
    const viewer = open();
    await connected(viewer);
    await join(viewer, showtime.id);
    viewer.disconnect();

    const buyer = await registeredCustomer(app);
    await buyer.client.post('/api/bookings', { showtimeId: showtime.id, seatIds: ['C1'] }); // event missed

    const again = open();
    await connected(again);
    assert.equal((await join(again, showtime.id)).ok, true); // rejoin…
    const res = await fetch(`${url}/api/showtimes/${showtime.id}/seats`); // …then refetch (what the client does)
    assert.deepEqual((await res.json()).seats, { C1: 'held' });
  });
});
