import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

const passThrough = (req, res, next) => next();

function limiter({ windowMs, limit, keyGenerator, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8', // RateLimit / RateLimit-Policy headers tell clients when to retry
    legacyHeaders: false,
    keyGenerator,
    handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', message)),
  });
}

const byIp = (req) => ipKeyGenerator(req.ip);
// Login attempts are counted per IP *and* email, so one attacker can't lock out every account
// from one IP, and a guessed email can't be brute-forced from one IP.
const byIpAndEmail = (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? '').trim().toLowerCase()}`;
const byUserOrIp = (req) => (req.user ? `user:${req.user._id}` : ipKeyGenerator(req.ip));

/**
 * In-memory limits (correct for one server process; a shared store such as Redis would be needed
 * for several instances — see docs). `enabled: false` turns them into no-ops for tests.
 */
export function createRateLimiters({ enabled }) {
  if (!enabled) return { login: passThrough, register: passThrough, refresh: passThrough, booking: passThrough, payment: passThrough };
  return {
    login: limiter({ windowMs: 15 * 60_000, limit: 10, keyGenerator: byIpAndEmail, message: 'Too many login attempts. Please wait 15 minutes and try again' }),
    register: limiter({ windowMs: 60 * 60_000, limit: 5, keyGenerator: byIp, message: 'Too many accounts created from this network. Please try again later' }),
    refresh: limiter({ windowMs: 15 * 60_000, limit: 60, keyGenerator: byIp, message: 'Too many session refreshes. Please try again later' }),
    booking: limiter({ windowMs: 60_000, limit: 20, keyGenerator: byUserOrIp, message: 'Too many booking attempts. Please slow down' }),
    payment: limiter({ windowMs: 60_000, limit: 20, keyGenerator: byUserOrIp, message: 'Too many payment attempts. Please slow down' }),
  };
}
