import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

export function notFound(req, res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
}

// Translate known library errors into safe, consistent AppErrors.
function toAppError(err) {
  if (err instanceof AppError) return err;

  // Errors raised by express.json() (body-parser) carry a `type`.
  if (err.type === 'entity.parse.failed') return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  if (err.type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  if (err.type?.startsWith?.('encoding.') || err.type === 'charset.unsupported') {
    return new AppError(415, 'UNSUPPORTED_ENCODING', 'Unsupported request encoding');
  }

  if (err instanceof mongoose.Error.CastError) {
    return new AppError(400, 'INVALID_ID', `Invalid value for ${err.path}`);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return new AppError(400, 'VALIDATION_ERROR', 'Validation failed', details);
  }
  // Unique-index violation. Never echo the duplicate value (it could be an email address).
  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern ?? {});
    return new AppError(409, 'DUPLICATE', 'A record with the same details already exists', fields.length ? { fields } : undefined);
  }
  // Other client errors raised by libraries (e.g. Express: a URL parameter with broken %-encoding has
  // status 400). Keep their 4xx status, but use a generic message rather than the library's wording.
  const status = err.status ?? err.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return new AppError(status, 'BAD_REQUEST', 'The request could not be understood');
  }
  return null;
}

// Express recognises an error handler by its 4 arguments, so `next` must stay.
export function errorHandler(err, req, res, next) {
  // If the response already started streaming we can't send JSON; let Express close the connection.
  if (res.headersSent) return next(err);

  const known = toAppError(err);
  const status = known?.status ?? 500;

  if (status >= 500) {
    // Full error (with stack) goes to the log only; `req.log` comes from pino-http and includes the request id.
    (req.log ?? logger).error({ err }, 'Unhandled error');
  }

  res.status(status).json({
    error: {
      code: known?.code ?? 'INTERNAL_ERROR',
      // Never leak internal details (stack traces, DB errors) to clients for server errors.
      message: known?.message ?? 'Internal server error',
      ...(known?.details !== undefined && { details: known.details }),
      ...(req.id && { requestId: req.id }),
    },
  });
}
