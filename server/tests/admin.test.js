import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { testApp, adminClient, registeredCustomer } from './helpers/http.js';
import { createShowtime, createMovie } from './helpers/factories.js';

const app = testApp();

async function confirmedBooking(customer, showtime, seatIds) {
  const booking = (await customer.client.post('/api/bookings', { showtimeId: showtime.id, seatIds })).body.booking;
  await customer.client.post(`/api/bookings/${booking.id}/payments`, { outcome: 'SUCCESS' }).set('Idempotency-Key', randomUUID());
  return booking;
}

describe('admin dashboard and booking lookup', () => {
  before(connectTestDB);
  after(disconnectTestDB);
  beforeEach(clearTestDB);

  it('is admin-only', async () => {
    assert.equal((await request(app).get('/api/admin/stats')).status, 401);
    const { client } = await registeredCustomer(app);
    assert.equal((await client.get('/api/admin/stats')).status, 403);
    assert.equal((await client.get('/api/admin/bookings')).status, 403);
  });

  it('computes revenue, refunds, tickets, occupancy and top movies from real data', async () => {
    const alpha = await createMovie({ title: 'Alpha' });
    const beta = await createMovie({ title: 'Beta' });
    const showA = await createShowtime({ movie: alpha, startsInMinutes: 600 });
    const showB = await createShowtime({ movie: beta, startsInMinutes: 900 });
    const asha = await registeredCustomer(app, { name: 'Asha' });
    const ravi = await registeredCustomer(app, { name: 'Ravi' });
    await confirmedBooking(asha, showA, ['A1', 'A2']); // 2 × ₹200
    await confirmedBooking(ravi, showA, ['C1']); // ₹450
    const cancelled = await confirmedBooking(ravi, showB, ['A1']); // ₹200, then cancelled + refunded
    await ravi.client.post(`/api/bookings/${cancelled.id}/cancel`);
    await asha.client.post('/api/bookings', { showtimeId: showB.id, seatIds: ['B1'] }); // unpaid hold: not counted

    const { client } = await adminClient(app);
    const res = await client.get('/api/admin/stats');
    assert.equal(res.status, 200);
    const s = res.body;
    assert.deepEqual(s.revenue, { gross: 105000, refunded: 20000, net: 85000, payments: 3, refunds: 1 });
    assert.deepEqual(s.sales, { bookings: 2, tickets: 3 });
    assert.deepEqual({ booked: s.occupancy.bookedSeats, capacity: s.occupancy.capacity }, { booked: 3, capacity: 30 });
    assert.deepEqual(s.topMovies.map((m) => [m.title, m.tickets, m.revenue]), [['Alpha', 3, 85000]]);
    assert.equal(s.catalogue.upcomingShows, 2);
    assert.equal(s.recentBookings.length, 3);
    assert.ok(s.recentBookings[0].user.email);
    assert.doesNotMatch(JSON.stringify(s), /passwordHash/);
  });

  it('finds bookings by reference, customer email or name, and status; shows full detail', async () => {
    const show = await createShowtime();
    const asha = await registeredCustomer(app, { name: 'Asha Kulkarni' });
    const ravi = await registeredCustomer(app, { name: 'Ravi Menon' });
    const a = await confirmedBooking(asha, show, ['A1']);
    await confirmedBooking(ravi, show, ['A2']);
    const { client } = await adminClient(app);

    const byRef = await client.get(`/api/admin/bookings?q=${a.reference.toLowerCase()}`);
    assert.deepEqual(byRef.body.items.map((b) => b.id), [a.id]);
    assert.equal(byRef.body.items[0].user.name, 'Asha Kulkarni');
    assert.equal((await client.get(`/api/admin/bookings?q=${encodeURIComponent(asha.email.toUpperCase())}`)).body.total, 1); // case-insensitive
    assert.equal((await client.get('/api/admin/bookings?q=menon')).body.total, 1);
    assert.equal((await client.get('/api/admin/bookings?status=CONFIRMED')).body.total, 2);
    assert.equal((await client.get('/api/admin/bookings?q=nobody')).body.total, 0);
    assert.equal((await client.get('/api/admin/bookings?status=WHATEVER')).status, 400);

    const detail = await client.get(`/api/admin/bookings/${a.id}`);
    assert.equal(detail.body.booking.reference, a.reference);
    assert.equal(detail.body.payments[0].status, 'SUCCEEDED');
    assert.equal(detail.body.showtime.status, 'SCHEDULED');
    assert.equal((await client.get('/api/admin/bookings/507f1f77bcf86cd799439011')).status, 404);
  });
});
