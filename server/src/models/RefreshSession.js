import mongoose from 'mongoose';
import { schemaOptions } from './shared.js';

// One document per issued refresh token. Only a SHA-256 hash of the token is stored, so a database
// leak doesn't hand out usable tokens. Tokens rotate: each refresh marks the old one `usedAt` and
// issues a new one in the same `familyId`. Presenting an already-used token means it was stolen and
// replayed, so the whole family is revoked (business rule 1).
const refreshSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, maxlength: 200 },
  },
  schemaOptions,
);

refreshSessionSchema.index({ tokenHash: 1 }, { unique: true }); // lookup on every refresh
refreshSessionSchema.index({ familyId: 1 }); // revoke a family
refreshSessionSchema.index({ user: 1 }); // revoke all sessions of a user
// MongoDB deletes expired sessions automatically (checked roughly once a minute).
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession = mongoose.model('RefreshSession', refreshSessionSchema);
