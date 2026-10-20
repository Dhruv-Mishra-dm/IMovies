import mongoose from 'mongoose';
import { PAYMENT_STATUS } from '../domain/statuses.js';
import { CURRENCY } from '../config/business.js';
import { schemaOptions, jsonOptions } from './shared.js';

// One document per payment ATTEMPT. A booking can have several (failed, then retried).
// No card data is ever stored: the simulated provider only needs the chosen outcome.
const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0, validate: Number.isInteger }, // paise, copied from the booking
    currency: { type: String, enum: [CURRENCY], default: CURRENCY },
    provider: { type: String, enum: ['SIMULATED'], default: 'SIMULATED' },
    providerReference: { type: String },
    // Client-generated key: repeating a request with the same key returns the original result
    // instead of charging again.
    idempotencyKey: { type: String, required: true, minlength: 8, maxlength: 100 },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), required: true },
    // true once money was captured (SUCCEEDED, and still true after REFUNDED). See unique index below.
    captured: { type: Boolean, default: false },
    failureCode: String,
    failureMessage: String,
    succeededAt: Date,
    failedAt: Date,
    refundedAt: Date,
  },
  {
    ...schemaOptions,
    // Internal bookkeeping fields are not sent to browsers.
    toJSON: {
      ...jsonOptions,
      transform(doc, ret) {
        delete ret._id;
        delete ret.idempotencyKey;
        delete ret.captured;
        delete ret.user;
        return ret;
      },
    },
  },
);

paymentSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ booking: 1, createdAt: -1 }); // payment history of a booking
// Database-level invariants:
// - at most one attempt in progress per booking (no two simultaneous charges),
paymentSchema.index(
  { booking: 1 },
  { unique: true, partialFilterExpression: { status: PAYMENT_STATUS.PENDING }, name: 'one_pending_payment_per_booking' },
);
// - at most one captured payment per booking, ever (no double charge).
paymentSchema.index(
  { booking: 1 },
  { unique: true, partialFilterExpression: { captured: true }, name: 'one_captured_payment_per_booking' },
);

export const Payment = mongoose.model('Payment', paymentSchema);
