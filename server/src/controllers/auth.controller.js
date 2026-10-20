import * as authService from '../services/authService.js';
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from '../utils/cookies.js';

const context = (req) => ({ userAgent: req.get('user-agent') });

export async function register(req, res) {
  const { user, tokens } = await authService.register(req.validated.body, context(req));
  setAuthCookies(res, tokens);
  res.status(201).json({ user });
}

export async function login(req, res) {
  const { user, tokens } = await authService.login(req.validated.body, context(req));
  setAuthCookies(res, tokens);
  res.json({ user });
}

export async function refresh(req, res) {
  try {
    const { user, tokens } = await authService.refresh(req.cookies?.[REFRESH_COOKIE], context(req));
    setAuthCookies(res, tokens);
    res.json({ user });
  } catch (err) {
    // A dead refresh token is useless: remove both cookies so the browser stops sending them.
    // (Not for 409 REFRESH_CONFLICT — the other request already set fresh cookies.)
    if (err.status === 401) clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req, res) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearAuthCookies(res);
  res.status(204).end();
}

export async function logoutAll(req, res) {
  await authService.revokeAllSessions(req.user._id);
  clearAuthCookies(res);
  res.status(204).end();
}

export function me(req, res) {
  res.json({ user: req.user });
}

export async function updateMe(req, res) {
  const user = await authService.updateProfile(req.user._id, req.validated.body);
  res.json({ user });
}

export async function changePassword(req, res) {
  const { user, tokens } = await authService.changePassword(req.user._id, req.validated.body, context(req));
  setAuthCookies(res, tokens);
  res.json({ user });
}
