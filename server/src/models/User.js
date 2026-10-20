import mongoose from 'mongoose';
import { schemaOptions, jsonOptions } from './shared.js';

export const ROLES = Object.freeze({ CUSTOMER: 'customer', ADMIN: 'admin' });

/** Emails are compared case-insensitively: always store and look them up in this form. */
export const normalizeEmail = (email) => String(email).trim().toLowerCase();

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email address is invalid'],
    },
    // Never returned by queries unless explicitly requested with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CUSTOMER },
    // Increment to invalidate every access token issued before (logout everywhere, password change, role change).
    tokenVersion: { type: Number, default: 0, min: 0 },
  },
  {
    ...schemaOptions,
    toJSON: {
      ...jsonOptions,
      transform(doc, ret) {
        delete ret._id;
        delete ret.passwordHash;
        delete ret.tokenVersion;
        return ret;
      },
    },
  },
);

// Unique email = the database (not a "does it exist?" check) settles two simultaneous registrations.
userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
