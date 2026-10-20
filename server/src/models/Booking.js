import mongoose from 'mongoose';
import { BOOKING_STATUS } from '../domain/statuses.js';
import { CURRENCY } from '../config/business.js';
import { schemaOptions } from './shared.js';

const bookedSeatSchema = new mongoose.Schema(
  {
    seatId: { type: String, required: true },
    category: { type: String, required: true },
    categoryName: { type: String, required: true },
    price: { type: Number, required: true, min: 0, validate: Number.isInteger }, // paise, fixed at booking time
  },
  { _id: false },
);

// What the customer bought, copied at booking time so history stays accurate even if the movie,
// theatre or showtime is edited later (requirement H).
const snapshotSchema = new mongoose.Schema(
  {
    movie: {
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
      title: { type: String, required: true },
      posterUrl: String,
      durationMins: Number,
      certification: String,
    },
    theatre: {
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      city: String,
      address: String,
    },
    screen: { id: { type: mongoose.Schema.Types.ObjectId, required: true }, name: String, format: String },
    language: String,
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, match: /^IMV-[A-Z0-9]{8}$/ }, // shown to the customer
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    showtime: { type: mongoose.Schema.Types.ObjectId, ref: 'Showtime', required: true },
    status: { type: String, enum: Object.values(BOOKING_STATUS), required: true },
    seats: {
      type: [bookedSeatSchema],
      validate: [(v) => v.length >= 1, 'A booking needs at least one seat'],
    },
    // Sum of seat prices, no taxes or fees (approved decision 3). Integer paise.
    totalAmount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    currency: { type: String, enum: [CURRENCY], default: CURRENCY },
    snapshot: { type: snapshotSchema, required: true },
    holdExpiresAt: { type: Date, required: true },
    confirmedAt: Date,
    expiredAt: Date,
    releasedAt: Date,
    cancelledAt: Date,
    cancellation: {
      reason: { type: String, enum: ['CUSTOMER_REQUEST', 'SHOWTIME_CANCELLED'] },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  },
  schemaOptions,
);

bookingSchema.path('totalAmount').validate(function totalMatchesSeats(total) {
  return total === (this.seats ?? []).reduce((sum, seat) => sum + seat.price, 0);
}, 'totalAmount must equal the sum of seat prices');

bookingSchema.index({ reference: 1 }, { unique: true });
bookingSchema.index({ user: 1, createdAt: -1 }); // "my bookings"
bookingSchema.index({ showtime: 1, status: 1 }); // bookings affected by a showtime cancellation
bookingSchema.index({ status: 1, holdExpiresAt: 1 }); // the expiry sweeper
// At most ONE active hold per customer per showtime, enforced by the database. A double-click on
// "Proceed" therefore can't create two holds.
bookingSchema.index(
  { user: 1, showtime: 1 },
  { unique: true, partialFilterExpression: { status: BOOKING_STATUS.HELD }, name: 'one_active_hold_per_user_showtime' },
);

export const Booking = mongoose.model('Booking', bookingSchema);
