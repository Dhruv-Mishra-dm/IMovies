import mongoose from 'mongoose';
import { MOVIE_STATUS } from '../domain/statuses.js';
import { schemaOptions, isImageUrl, isHttpsUrl, SLUG } from './shared.js';

export const GENRES = Object.freeze([
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'Horror',
  'Musical',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Sports',
  'Thriller',
]);

// Indian CBFC certificates (2024 scheme).
export const CERTIFICATIONS = Object.freeze(['U', 'UA 7+', 'UA 13+', 'UA 16+', 'A']);

const movieSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    slug: { type: String, required: true, match: SLUG, maxlength: 90 },
    synopsis: { type: String, trim: true, maxlength: 2000, default: '' },
    genres: {
      type: [{ type: String, enum: GENRES }],
      validate: [(v) => v.length >= 1 && v.length <= 5, 'Choose between 1 and 5 genres'],
    },
    languages: {
      type: [{ type: String, trim: true, minlength: 2, maxlength: 30 }],
      validate: [(v) => v.length >= 1 && v.length <= 10, 'Choose between 1 and 10 languages'],
    },
    durationMins: { type: Number, required: true, min: 30, max: 400, validate: Number.isInteger },
    certification: { type: String, enum: CERTIFICATIONS, required: true },
    releaseDate: { type: Date, required: true },
    director: { type: String, trim: true, maxlength: 120, default: '' },
    cast: {
      type: [{ type: String, trim: true, maxlength: 120 }],
      validate: [(v) => v.length <= 20, 'At most 20 cast members'],
    },
    posterUrl: { type: String, trim: true, maxlength: 500, validate: [isImageUrl, 'Poster must be an https URL or /path'] },
    backdropUrl: { type: String, trim: true, maxlength: 500, validate: [isImageUrl, 'Backdrop must be an https URL or /path'] },
    trailerUrl: { type: String, trim: true, maxlength: 500, validate: [isHttpsUrl, 'Trailer must be an https URL'] },
    status: { type: String, enum: Object.values(MOVIE_STATUS), default: MOVIE_STATUS.DRAFT },
    publishedAt: { type: Date },
    archivedAt: { type: Date },
  },
  schemaOptions,
);

movieSchema.index({ slug: 1 }, { unique: true }); // URLs and idempotent seeding
// Public catalogue: published movies filtered by genre and sorted by release date.
movieSchema.index({ status: 1, releaseDate: -1 });
movieSchema.index({ status: 1, genres: 1, releaseDate: -1 });

export const Movie = mongoose.model('Movie', movieSchema);
