import { z } from 'zod';
import { objectId } from '../utils/validation.js';
import { MAX_SEATS_PER_BOOKING } from '../config/business.js';

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
