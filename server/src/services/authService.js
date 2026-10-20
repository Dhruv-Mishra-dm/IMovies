import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { REFRESH_TOKEN_TTL_DAYS } from '../config/business.js';
import { User, RefreshSession, ROLES, normalizeEmail } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { clock } from '../utils/clock.js';
import { isDuplicateKeyError } from '../utils/transaction.js';
import { signAccessToken, generateRefreshToken, hashToken } from './tokenService.js';

// Two browser tabs refreshing at the same moment both send the same (old) refresh token. The first
// one rotates it; the second arrives a few ms later. Within this window we treat that as a harmless
// race (409, client simply retries with the new cookie) rather than as token theft.
const REFRESH_RACE_GRACE_MS = 10_000;

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

let dummyHashPromise;
/** A real bcrypt hash used to make "unknown email" take as long as "wrong password" (no timing leak). */
function dummyHash() {
  dummyHashPromise ??= bcrypt.hash('timing-equaliser-not-a-real-password', env.bcryptCost);
  return dummyHashPromise;
}

export function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptCost);
}

async function createSession(user, { familyId = randomUUID(), userAgent } = {}) {
  const refreshToken = generateRefreshToken();
  await RefreshSession.create({
    user: user._id,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(clock.now().getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000),
    userAgent: userAgent?.slice(0, 200),
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

export async function register({ name, email, password }, { userAgent } = {}) {
  let user;
  try {
    // Role is never taken from the request: public registration always creates customers.
    user = await User.create({ name, email, passwordHash: await hashPassword(password), role: ROLES.CUSTOMER });
  } catch (err) {
    // The unique index decides — even for two simultaneous registrations with the same email.
    if (isDuplicateKeyError(err)) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    throw err;
  }
  logger.info({ userId: String(user._id) }, 'User registered');
  return { user, tokens: await createSession(user, { userAgent }) };
}

export async function login({ email, password }, { userAgent } = {}) {
  const user = await User.findOne({ email: normalizeEmail(email) }).select('+passwordHash');
  if (!user) {
    await bcrypt.compare(password, await dummyHash());
    throw invalidCredentials();
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) throw invalidCredentials();
  logger.info({ userId: String(user._id) }, 'User logged in');
  return { user, tokens: await createSession(user, { userAgent }) };
}

/** Rotates a refresh token. Detects replay of an already-used token and revokes its whole family. */
export async function refresh(rawToken, { userAgent } = {}) {
  if (!rawToken) throw new AppError(401, 'REFRESH_REQUIRED', 'Please log in');
  const session = await RefreshSession.findOne({ tokenHash: hashToken(rawToken) });
  const now = clock.now();
  if (!session) throw new AppError(401, 'SESSION_INVALID', 'Your session is no longer valid. Please log in again');
  if (session.revokedAt) throw new AppError(401, 'SESSION_REVOKED', 'Your session has ended. Please log in again');

  if (session.usedAt) {
    if (now - session.usedAt <= REFRESH_RACE_GRACE_MS) {
      throw new AppError(409, 'REFRESH_CONFLICT', 'Session was refreshed by another request; retry');
    }
    // Reuse of a rotated token = likely stolen. Revoke every token in the family (decision 1).
    await RefreshSession.updateMany({ familyId: session.familyId, revokedAt: null }, { $set: { revokedAt: now } });
    logger.warn({ userId: String(session.user), familyId: session.familyId }, 'Refresh token reuse detected; session family revoked');
    throw new AppError(401, 'REFRESH_REUSED', 'Your session has ended for security reasons. Please log in again');
  }
  if (session.expiresAt <= now) throw new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Please log in again');

  // Claim the token atomically: if two requests get here at once, only one wins.
  const claimed = await RefreshSession.findOneAndUpdate(
    { _id: session._id, usedAt: null, revokedAt: null },
    { $set: { usedAt: now } },
  );
  if (!claimed) throw new AppError(409, 'REFRESH_CONFLICT', 'Session was refreshed by another request; retry');

  const user = await User.findById(session.user);
  if (!user) throw new AppError(401, 'SESSION_INVALID', 'Your session is no longer valid. Please log in again');
  return { user, tokens: await createSession(user, { familyId: session.familyId, userAgent }) };
}

/** Ends the session family of the presented refresh token (this device). Always succeeds. */
export async function logout(rawToken) {
  if (!rawToken) return;
  const session = await RefreshSession.findOne({ tokenHash: hashToken(rawToken) }).select('familyId');
  if (session) await RefreshSession.updateMany({ familyId: session.familyId, revokedAt: null }, { $set: { revokedAt: clock.now() } });
}

/** Ends every session of the user: bumps tokenVersion (kills access tokens) and revokes refresh tokens. */
export async function revokeAllSessions(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await RefreshSession.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: clock.now() } });
}

export async function updateProfile(userId, { name }) {
  const user = await User.findByIdAndUpdate(userId, { $set: { name } }, { returnDocument: 'after', runValidators: true });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  return user;
}

export async function changePassword(userId, { currentPassword, newPassword }, { userAgent } = {}) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
  }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  // Changing the password logs out every other device; this device gets a fresh session.
  await revokeAllSessions(user._id);
  const fresh = await User.findById(user._id);
  logger.info({ userId: String(user._id) }, 'Password changed; all sessions revoked');
  return { user: fresh, tokens: await createSession(fresh, { userAgent }) };
}
