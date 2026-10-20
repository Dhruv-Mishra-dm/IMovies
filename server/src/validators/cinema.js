import { z } from 'zod';
import { validateSeatLayout } from '../domain/seatLayout.js';
import { SCREEN_FORMATS } from '../models/Screen.js';
import { SHOWTIME_STATUS } from '../domain/statuses.js';
import { objectId } from '../utils/validation.js';
import { MAX_SEAT_PRICE_PAISE } from '../utils/money.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-11-02');
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a time like 18:30');
const city = z.string().trim().min(2).max(60);

// ---------- Theatres ----------

export const theatreListQuery = z.object({ city: city.optional() });

export const theatreIdOrSlugParams = z.object({
  idOrSlug: z.string().max(90).refine((v) => objectId.safeParse(v).success || SLUG.test(v), 'must be a theatre id or slug'),
});

const theatreFields = {
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(SLUG).max(90).optional(),
  city,
  address: z.string().trim().min(5).max(300),
  amenities: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
};
export const createTheatreBody = z.object(theatreFields);
export const updateTheatreBody = z
  .object({ ...Object.fromEntries(Object.entries(theatreFields).map(([k, s]) => [k, s.optional()])), isActive: z.boolean().optional() })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'provide at least one field to change');

// ---------- Screens & seat layouts ----------

const seat = z.object({
  number: z.number().int(),
  col: z.number().int(),
  category: z.string(),
  accessible: z.boolean().optional(),
  disabled: z.boolean().optional(),
});
export const seatLayout = z
  .object({
    categories: z.array(z.object({ code: z.string(), name: z.string().trim() })).max(10),
    rows: z.array(z.object({ label: z.string(), seats: z.array(seat).max(60) })).max(30),
  })
  .superRefine((layout, ctx) => {
    // Re-use the domain rules so the API, the model and the admin editor agree exactly.
    for (const problem of validateSeatLayout(layout).slice(0, 20)) ctx.addIssue({ code: 'custom', message: problem });
  });

export const createScreenBody = z.object({
  name: z.string().trim().min(1).max(60),
  format: z.enum(SCREEN_FORMATS).default('2D'),
  layout: seatLayout,
});
export const updateScreenBody = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    format: z.enum(SCREEN_FORMATS).optional(),
    layout: seatLayout.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'provide at least one field to change');

// ---------- Showtimes ----------

export const showtimeListQuery = z.object({
  movie: objectId.optional(),
  theatre: objectId.optional(),
  city: city.optional(),
  date: dateKey.optional(), // IST calendar day; default: the next 7 days
});

export const showtimeDatesQuery = z.object({ movie: objectId.optional(), theatre: objectId.optional(), city: city.optional() });

const prices = z
  .array(z.object({ category: z.string().min(1).max(20), amount: z.number().int().min(0).max(MAX_SEAT_PRICE_PAISE) }))
  .min(1)
  .max(10)
  .refine((list) => new Set(list.map((p) => p.category)).size === list.length, 'each category may appear only once');

export const createShowtimeBody = z.object({
  movieId: objectId,
  screenId: objectId,
  date: dateKey, // IST
  time: timeOfDay, // IST
  language: z.string().trim().min(2).max(30),
  prices, // integer paise per seat category
});

export const updateShowtimeBody = z
  .object({ date: dateKey.optional(), time: timeOfDay.optional(), language: z.string().trim().min(2).max(30).optional(), prices: prices.optional() })
  .refine((b) => (b.date === undefined) === (b.time === undefined), 'date and time must be changed together')
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'provide at least one field to change');

export const adminShowtimeListQuery = z.object({
  movie: objectId.optional(),
  theatre: objectId.optional(),
  screen: objectId.optional(),
  date: dateKey.optional(),
  status: z.enum(Object.values(SHOWTIME_STATUS)).optional(),
  when: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
