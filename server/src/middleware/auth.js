import { User, ROLES } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { verifyAccessToken, isTokenExpiredError } from '../services/tokenService.js';

/**
 * Resolves the user behind the access-token cookie, or returns null when there is no cookie.
 * Throws 401 for an expired/invalid/revoked token.
 *
 * The user is reloaded from the database on every request so that a role change or
 * "log out everywhere" (tokenVersion bump) takes effect immediately, not after 15 minutes.
 */
export async function resolveUser(token) {
  if (!token) return null;
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (isTokenExpiredError(err)) throw new AppError(401, 'TOKEN_EXPIRED', 'Your session needs to be refreshed');
    throw new AppError(401, 'INVALID_TOKEN', 'Please log in again');
  }
  const user = await User.findById(payload.sub).select('name email role tokenVersion createdAt');
  if (!user || user.tokenVersion !== payload.ver) throw new AppError(401, 'SESSION_REVOKED', 'Your session has ended. Please log in again');
  return user;
}

/** Requires a logged-in user; sets req.user. */
export async function authenticate(req, res, next) {
  try {
    const user = await resolveUser(req.cookies?.[ACCESS_COOKIE]);
    if (!user) throw new AppError(401, 'AUTH_REQUIRED', 'Please log in to continue');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Sets req.user when a valid cookie is present; anonymous requests continue with req.user = null. */
export async function optionalAuth(req, res, next) {
  try {
    req.user = await resolveUser(req.cookies?.[ACCESS_COOKIE]);
    next();
  } catch (err) {
    // An expired token on a public page shouldn't block it, but the client must learn it can refresh.
    if (err.code === 'TOKEN_EXPIRED') return next(err);
    req.user = null;
    next();
  }
}

/** Use after authenticate: allows only the given role (checked on the server, always). */
export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do this'));
    next();
  };
}

export const requireAdmin = [authenticate, requireRole(ROLES.ADMIN)];
export const requireCustomer = [authenticate, requireRole(ROLES.CUSTOMER)];
