import mongoose from 'mongoose';
import { CURRENCY } from '../config/business.js';
import { schemaOptions } from './shared.js';

// A simulated refund of a captured payment. The unique index on `payment` makes refunds idempotent:
// cancelling twice (or a customer and an admin cancelling at once) can never refund twice.
//
// In this simulation refunds complete immediately (SUCCEEDED). A real gateway refunds asynchronously,
// so PENDING/FAILED exist for that future; a FAILED refund would need manual follow-up.
const refundSchema = new mongoose.Schema(
  {
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    currency: { type: String, enum: [CURRENCY], default: CURRENCY },
    reason: { type: String, enum: ['CUSTOMER_CANCELLATION', 'SHOWTIME_CANCELLED'], required: true },
    status: { type: String, enum: ['PENDING', 'SUCCEEDED', 'FAILED'], default: 'SUCCEEDED' },
    providerReference: String,
  },
  schemaOptions,
);

refundSchema.index({ payment: 1 }, { unique: true });
refundSchema.index({ booking: 1 });

export const Refund = mongoose.model('Refund', refundSchema);
