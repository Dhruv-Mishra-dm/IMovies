import { AppError } from '../utils/AppError.js';

const PARTS = ['params', 'query', 'body'];

/**
 * Validates request parts against zod schemas, e.g. validate({ params: idParams, body: movieBody }).
 *
 * Parsed (and type-converted) values are stored on `req.validated.<part>`. Controllers must read
 * from there, never from req.body directly: zod objects drop unknown keys, which is what protects
 * us from mass assignment (e.g. a client sending `role: "admin"`) and NoSQL operator injection
 * (e.g. `{ "$gt": "" }` where a string is expected).
 *
 * Express 5 makes req.query read-only, which is another reason for using req.validated.
 */
export function validate(schemas) {
  return (req, res, next) => {
    const validated = {};
    const details = [];

    for (const part of PARTS) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ location: part, path: issue.path.join('.'), message: issue.message });
        }
      }
    }

    if (details.length) return next(new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details));
    req.validated = validated;
    next();
  };
}
