import mongoose from 'mongoose';
import { validateSeatLayout } from '../domain/seatLayout.js';

// Stored inside Screen (the current layout) and copied into every Showtime (a snapshot),
// so editing a screen never changes seat maps that customers already booked against.

const seatSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true },
    col: { type: Number, required: true },
    category: { type: String, required: true },
    accessible: { type: Boolean },
    disabled: { type: Boolean },
  },
  { _id: false },
);

const rowSchema = new mongoose.Schema(
  { label: { type: String, required: true }, seats: { type: [seatSchema], default: undefined } },
  { _id: false },
);

const categorySchema = new mongoose.Schema(
  { code: { type: String, required: true }, name: { type: String, required: true, trim: true, maxlength: 40 } },
  { _id: false },
);

export const seatLayoutSchema = new mongoose.Schema(
  {
    categories: { type: [categorySchema], default: undefined, required: true },
    rows: { type: [rowSchema], default: undefined, required: true },
  },
  { _id: false },
);

// Whole-layout rules (unique rows/columns, known categories, …) live in domain/seatLayout.js
// so the API can reuse them for friendly error messages.
seatLayoutSchema.path('rows').validate(function validateLayout() {
  const problems = validateSeatLayout(this.toObject ? this.toObject() : this);
  if (problems.length) throw new mongoose.Error.ValidatorError({ message: problems.slice(0, 5).join('; '), path: 'rows' });
  return true;
});
