import { Router } from 'express';
import * as cinema from '../controllers/cinema.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { idParams } from '../utils/validation.js';
import * as v from '../validators/cinema.js';
import { cancelShowtimeBody } from '../validators/bookings.js';

/** Public: /api/theatres, /api/cities, /api/showtimes */
export function cinemaRoutes() {
  const router = Router();
  router.get('/cities', cinema.listCities);
  router.get('/theatres', validate({ query: v.theatreListQuery }), cinema.listTheatres);
  router.get('/theatres/:idOrSlug', validate({ params: v.theatreIdOrSlugParams }), cinema.getTheatre);
  router.get('/showtimes', validate({ query: v.showtimeListQuery }), cinema.listShowtimes);
  router.get('/showtimes/dates', validate({ query: v.showtimeDatesQuery }), cinema.listShowtimeDates);
  router.get('/showtimes/:id', validate({ params: idParams }), cinema.getShowtime);
  return router;
}

/** Admin: /api/admin/theatres, /api/admin/screens, /api/admin/showtimes */
export function adminCinemaRoutes() {
  const router = Router();
  router.use(requireAdmin);
  router.get('/theatres', cinema.adminListTheatres);
  router.post('/theatres', validate({ body: v.createTheatreBody }), cinema.createTheatre);
  router.get('/theatres/:id', validate({ params: idParams }), cinema.adminGetTheatre);
  router.patch('/theatres/:id', validate({ params: idParams, body: v.updateTheatreBody }), cinema.updateTheatre);
  router.post('/theatres/:id/screens', validate({ params: idParams, body: v.createScreenBody }), cinema.createScreen);
  router.get('/screens/:id', validate({ params: idParams }), cinema.getScreen);
  router.patch('/screens/:id', validate({ params: idParams, body: v.updateScreenBody }), cinema.updateScreen);
  router.delete('/screens/:id', validate({ params: idParams }), cinema.deleteScreen);
  router.get('/showtimes', validate({ query: v.adminShowtimeListQuery }), cinema.adminListShowtimes);
  router.post('/showtimes', validate({ body: v.createShowtimeBody }), cinema.createShowtime);
  router.patch('/showtimes/:id', validate({ params: idParams, body: v.updateShowtimeBody }), cinema.updateShowtime);
  router.post('/showtimes/:id/cancel', validate({ params: idParams, body: cancelShowtimeBody }), cinema.cancelShowtime);
  return router;
}
