import { AppError } from '../utils/AppError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(req) {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF protection for cookie-authenticated APIs. Browsers attach an Origin header to every
 * POST/PUT/PATCH/DELETE; a request whose origin isn't our client app is rejected before any
 * handler runs. Together with SameSite=Strict cookies this replaces a separate CSRF token.
 * (CORS alone is not enough: it stops other sites READING responses, not SENDING requests.)
 */
export function originCheck(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = originOf(req);
    if (!origin) return next(new AppError(403, 'ORIGIN_REQUIRED', 'Request origin could not be verified'));
    if (!allowed.has(origin)) return next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed'));
    next();
  };
}
