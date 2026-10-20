import mongoose from 'mongoose';
import { schemaOptions, SLUG } from './shared.js';

const theatreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    slug: { type: String, required: true, match: SLUG, maxlength: 90 },
    city: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    address: { type: String, required: true, trim: true, minlength: 5, maxlength: 300 },
    amenities: {
      type: [{ type: String, trim: true, maxlength: 40 }],
      validate: [(v) => v.length <= 15, 'At most 15 amenities'],
    },
    isActive: { type: Boolean, default: true },
  },
  schemaOptions,
);

theatreSchema.index({ slug: 1 }, { unique: true });
theatreSchema.index({ city: 1, isActive: 1 }); // "theatres in Mumbai"

export const Theatre = mongoose.model('Theatre', theatreSchema);
