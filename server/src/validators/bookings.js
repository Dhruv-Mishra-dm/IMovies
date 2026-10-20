import { z } from 'zod';
import { objectId } from '../utils/validation.js';
import { MAX_SEATS_PER_BOOKING } from '../config/business.js';
import { DEMO_OUTCOMES } from '../services/payments/simulatedProvider.js';

/** Idempotency-Key header: a client-generated id (e.g. a UUID) for one payment attempt. */
export const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, 'must be 8-100 letters, digits, - or _');

// The demo outcome chosen on the DEMO PAYMENT screen. No card data is ever accepted.
export const paymentBody = z.object({ outcome: z.enum(Object.values(DEMO_OUTCOMES)) });

export const cancelShowtimeBody = z.object({ reason: z.string().trim().min(3).max(300) });

export const myBookingsQuery = z.object({
  scope: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

const seatId = z.string().regex(/^[A-Z]{1,2}\d{1,2}$/, 'must be a seat id like A12');

// Only seat ids are accepted. Prices, totals, status or owner sent by the browser are ignored
// (z.object drops unknown keys) — the server calculates everything itself.
export const createBookingBody = z.object({
  showtimeId: objectId,
  seatIds: z
    .array(seatId)
    .min(1, 'select at least one seat')
    .max(MAX_SEATS_PER_BOOKING, `you can book at most ${MAX_SEATS_PER_BOOKING} seats at a time`)
    .refine((ids) => new Set(ids).size === ids.length, 'each seat may be selected only once'),
});
