import { z } from 'zod';

// Shared building blocks for request schemas.

/** A MongoDB ObjectId as a 24-character hex string. Checked before any database call. */
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid id');

/** Route params of the form /resource/:id */
export const idParams = z.object({ id: objectId });
