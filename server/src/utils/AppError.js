/**
 * An expected, client-facing error. Throw (or pass to next()) from routes and services;
 * the central error handler turns it into { error: { code, message, details } }.
 *
 * `code` is a stable machine-readable string the frontend can switch on,
 * `message` is safe to show to users, `details` is optional structured info (e.g. field errors).
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
