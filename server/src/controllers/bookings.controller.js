import * as holds from '../services/holdService.js';
import { clock } from '../utils/clock.js';

// Booking responses include the server's current time so the browser can show an accurate
// hold countdown even if the visitor's computer clock is wrong.

export async function seatAvailability(req, res) {
  res.json(await holds.getSeatAvailability(req.validated.params.id, req.user));
}

export async function create(req, res) {
  res.status(201).json({ booking: await holds.createHold(req.user, req.validated.body), serverTime: clock.now() });
}

export async function detail(req, res) {
  res.json({ booking: await holds.getOwnBooking(req.user, req.validated.params.id), serverTime: clock.now() });
}

export async function release(req, res) {
  res.json({ booking: await holds.releaseHold(req.user, req.validated.params.id), serverTime: clock.now() });
}
