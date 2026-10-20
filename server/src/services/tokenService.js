import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ACCESS_TOKEN_TTL_MINUTES } from '../config/business.js';
import { clock } from '../utils/clock.js';

const ISSUER = 'imovies-api';
const AUDIENCE = 'imovies-web';
const ALGORITHM = 'HS256';

const nowSeconds = () => Math.floor(clock.now().getTime() / 1000);

/**
 * Access token: a short-lived (15 min) signed JWT carrying only the user id and tokenVersion.
 * The role is NOT trusted from the token — middleware reloads the user from the database.
 */
export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), ver: user.tokenVersion, iat: nowSeconds() }, env.jwtAccessSecret, {
    algorithm: ALGORITHM,
    expiresIn: ACCESS_TOKEN_TTL_MINUTES * 60,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/** Returns the payload, or throws jwt.TokenExpiredError / jwt.JsonWebTokenError. */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret, {
    algorithms: [ALGORITHM], // never accept "none" or a different algorithm
    issuer: ISSUER,
    audience: AUDIENCE,
    clockTimestamp: nowSeconds(),
  });
}

export const isTokenExpiredError = (err) => err instanceof jwt.TokenExpiredError;

/** Refresh token: 256 random bits. Only its hash is stored. */
export function generateRefreshToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
