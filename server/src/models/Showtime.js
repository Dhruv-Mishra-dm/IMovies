import mongoose from 'mongoose';
import { SHOWTIME_STATUS } from '../domain/statuses.js';
import { isValidPaise } from '../utils/money.js';
import { schemaOptions } from './shared.js';
import { seatLayoutSchema } from './seatLayoutSchema.js';

const priceSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    // Integer paise (approved decision 3). Prices are copied into each booking when it is created,
    // so later price edits never change what an existing booking was charged.
    amount: { type: Number, required: true, validate: [isValidPaise, 'Price must be whole paise between 0 and ₹10,000'] },
  },
  { _id: false },
);

const cancellationSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true, maxlength: 300 },
    // IN_PROGRESS while affected bookings are being cancelled/refunded; PARTIAL if some failed (safe to retry).
    progress: { type: String, enum: ['IN_PROGRESS', 'COMPLETED', 'PARTIAL'], default: 'IN_PROGRESS' },
    bookingsCancelled: { type: Number, default: 0 },
    refundsRecorded: { type: Number, default: 0 },
    failedBookings: { type: Number, default: 0 },
  },
  { _id: false },
);

const showtimeSchema = new mongoose.Schema(
  {
    movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'Theatre', required: true },
    screen: { type: mongoose.Schema.Types.ObjectId, ref: 'Screen', required: true },
    language: { type: String, required: true, trim: true, maxlength: 30 },
    format: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true }, // startsAt + movie duration
    // endsAt + turnaround: the screen is busy until then. Used by the overlap check.
    blockedUntil: { type: Date, required: true },
    seatMap: { type: seatLayoutSchema, required: true }, // snapshot of the screen layout
    prices: { type: [priceSchema], required: true },
    status: { type: String, enum: Object.values(SHOWTIME_STATUS), default: SHOWTIME_STATUS.SCHEDULED },
    cancellation: { type: cancellationSchema },
    // Written inside every booking/payment/cancellation transaction for this show, so that
    // e.g. "admin cancels the show" and "customer books a seat" can't both commit concurrently.
    lockVersion: { type: Number, default: 0 },
  },
  schemaOptions,
);

showtimeSchema.path('endsAt').validate(function endsAfterStart(value) {
  return !this.startsAt || value > this.startsAt;
}, 'endsAt must be after startsAt');

showtimeSchema.path('prices').validate(function pricesCoverCategories(prices) {
  const codes = (this.seatMap?.categories ?? []).map((c) => c.code);
  const priced = new Set(prices.map((p) => p.category));
  return prices.length === priced.size && codes.every((code) => priced.has(code)) && priced.size === codes.length;
}, 'Exactly one price is required for every seat category');

showtimeSchema.index({ screen: 1, startsAt: 1 }); // overlap check for a screen
showtimeSchema.index({ movie: 1, status: 1, startsAt: 1 }); // showtimes of a movie
showtimeSchema.index({ theatre: 1, status: 1, startsAt: 1 }); // showtimes in a theatre
showtimeSchema.index({ status: 1, startsAt: 1 }); // admin lists / upcoming shows

export const Showtime = mongoose.model('Showtime', showtimeSchema);
