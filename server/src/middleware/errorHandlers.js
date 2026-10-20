export function notFound(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// Express recognises an error handler by its 4 arguments, so `next` must stay even though it's unused.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: {
      // Never leak internal details (stack traces, DB errors) to clients for server errors.
      message: status >= 500 ? 'Internal server error' : err.message,
    },
  });
}
