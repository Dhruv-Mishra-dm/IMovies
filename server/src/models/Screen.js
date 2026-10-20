import mongoose from 'mongoose';
import { bookableCapacity } from '../domain/seatLayout.js';
import { schemaOptions } from './shared.js';
import { seatLayoutSchema } from './seatLayoutSchema.js';

export const SCREEN_FORMATS = Object.freeze(['2D', '3D', 'IMAX', '4DX']);

const screenSchema = new mongoose.Schema(
  {
    theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'Theatre', required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    format: { type: String, enum: SCREEN_FORMATS, default: '2D' },
    layout: { type: seatLayoutSchema, required: true },
    capacity: { type: Number, min: 1 },
    isActive: { type: Boolean, default: true },
    // Incremented inside every scheduling transaction. Two admins scheduling the same screen at the
    // same moment both write this document, so MongoDB lets only one transaction commit at a time
    // and the other retries — and then sees the first one's showtime in its overlap check.
    scheduleVersion: { type: Number, default: 0 },
  },
  schemaOptions,
);

screenSchema.pre('validate', function setCapacity() {
  if (this.layout?.rows) this.capacity = bookableCapacity(this.layout);
});

screenSchema.index({ theatre: 1, name: 1 }, { unique: true });

export const Screen = mongoose.model('Screen', screenSchema);
