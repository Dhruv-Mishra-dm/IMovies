import { z } from 'zod';
import { GENRES, CERTIFICATIONS } from '../models/Movie.js';
import { MOVIE_STATUS } from '../domain/statuses.js';
import { objectId } from '../utils/validation.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** /movies/:idOrSlug — either a MongoDB id or a URL slug like "the-monsoon-cipher". */
export const idOrSlugParams = z.object({
  idOrSlug: z.string().max(90).refine((v) => objectId.safeParse(v).success || SLUG.test(v), 'must be a movie id or slug'),
});

const pageFields = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
};

export const publicListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  genre: z.enum(GENRES).optional(),
  language: z.string().trim().min(2).max(30).optional(),
  release: z.enum(['now-showing', 'coming-soon', 'all']).default('all'),
  sort: z.enum(['release-desc', 'release-asc', 'title']).default('release-desc'),
  ...pageFields,
});

export const adminListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(Object.values(MOVIE_STATUS)).optional(),
  ...pageFields,
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (v === '') return true;
    if (/^\/[a-z0-9/_.-]+$/i.test(v) && !v.includes('..')) return true;
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'must be an https:// URL or a /path on this site');

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (v === '') return true;
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'must be an https:// URL');

/** "YYYY-MM-DD" — an IST calendar date. */
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-11-02');

const movieFields = {
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().regex(SLUG, 'may contain lowercase letters, digits and single hyphens').max(90).optional(),
  synopsis: z.string().trim().max(2000).default(''),
  genres: z.array(z.enum(GENRES)).min(1).max(5),
  languages: z.array(z.string().trim().min(2).max(30)).min(1).max(10),
  durationMins: z.number().int().min(30).max(400),
  certification: z.enum(CERTIFICATIONS),
  releaseDate: dateKey,
  director: z.string().trim().max(120).default(''),
  cast: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  posterUrl: imageUrl.default(''),
  backdropUrl: imageUrl.default(''),
  trailerUrl: httpsUrl.default(''),
};

// Status is deliberately NOT accepted here: it changes only through publish/archive actions.
export const createMovieBody = z.object(movieFields);

export const updateMovieBody = z
  .object(Object.fromEntries(Object.entries(movieFields).map(([key, schema]) => [key, schema.optional()])))
  .refine((body) => Object.values(body).some((v) => v !== undefined), 'provide at least one field to change');

export const movieIdParams = z.object({ id: objectId });
