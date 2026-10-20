import { Router } from 'express';
import * as movies from '../controllers/movies.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { publicListQuery, idOrSlugParams, adminListQuery, createMovieBody, updateMovieBody, movieIdParams } from '../validators/movies.js';

/** Public catalogue: /api/movies */
export function movieRoutes() {
  const router = Router();
  router.get('/', validate({ query: publicListQuery }), movies.list);
  router.get('/filters', movies.filters);
  router.get('/:idOrSlug', validate({ params: idOrSlugParams }), movies.detail);
  return router;
}

/** Administration: /api/admin/movies (every route requires an admin). */
export function adminMovieRoutes() {
  const router = Router();
  router.use(requireAdmin);
  router.get('/', validate({ query: adminListQuery }), movies.adminList);
  router.post('/', validate({ body: createMovieBody }), movies.create);
  router.get('/:id', validate({ params: movieIdParams }), movies.adminDetail);
  router.patch('/:id', validate({ params: movieIdParams, body: updateMovieBody }), movies.update);
  router.post('/:id/publish', validate({ params: movieIdParams }), movies.publish);
  router.post('/:id/archive', validate({ params: movieIdParams }), movies.archive);
  router.delete('/:id', validate({ params: movieIdParams }), movies.remove);
  return router;
}
