import { env } from '../config/env.js';
import { ACCESS_TOKEN_TTL_MINUTES, REFRESH_TOKEN_TTL_DAYS } from '../config/business.js';

export const ACCESS_COOKIE = 'imovies_at';
export const REFRESH_COOKIE = 'imovies_rt';

const base = () => ({
  httpOnly: true, // JavaScript in the page can't read the cookie, so XSS can't steal it
  sameSite: 'strict', // never sent with requests started by other sites (CSRF protection)
  secure: env.cookieSecure, // HTTPS only (true in production)
});

export function setAuthCookies(res, { accessToken, refreshToken }) {
  // Path "/" so the Socket.IO handshake (/socket.io) also carries the access token.
  res.cookie(ACCESS_COOKIE, accessToken, { ...base(), path: '/', maxAge: ACCESS_TOKEN_TTL_MINUTES * 60_000 });
  // The refresh token is only ever sent to /api/auth/* (refresh and logout), never to other endpoints.
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base(), path: '/api/auth', maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000 });
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...base(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(), path: '/api/auth' });
}
