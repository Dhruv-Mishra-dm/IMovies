import { Router } from 'express';
import * as bookings from '../controllers/bookings.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate, optionalAuth, requireCustomer } from '../middleware/auth.js';
import { idParams } from '../utils/validation.js';
import { createBookingBody, paymentBody, myBookingsQuery } from '../validators/bookings.js';

/** Mounted at /api. Booking is for customer accounts; admins manage bookings through /api/admin. */
export function bookingRoutes({ limits }) {
  const router = Router();
  // Public, but a logged-in viewer additionally sees which held seats are their own.
  router.get('/showtimes/:id/seats', validate({ params: idParams }), optionalAuth, bookings.seatAvailability);
  router.get('/bookings', authenticate, validate({ query: myBookingsQuery }), bookings.listMine);
  router.post('/bookings', requireCustomer, limits.booking, validate({ body: createBookingBody }), bookings.create);
  router.get('/bookings/:id', authenticate, validate({ params: idParams }), bookings.detail);
  router.post('/bookings/:id/release', requireCustomer, validate({ params: idParams }), bookings.release);
  router.post('/bookings/:id/payments', requireCustomer, limits.payment, validate({ params: idParams, body: paymentBody }), bookings.pay);
  router.post('/bookings/:id/cancel', requireCustomer, validate({ params: idParams }), bookings.cancel);
  return router;
}
