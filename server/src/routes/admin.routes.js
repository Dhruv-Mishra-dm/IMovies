import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams, objectId } from '../utils/validation.js';
import { BOOKING_STATUS } from '../domain/statuses.js';
import * as admin from '../services/adminService.js';

const bookingListQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(Object.values(BOOKING_STATUS)).optional(),
  showtime: objectId.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** /api/admin/stats and /api/admin/bookings — administrators only (checked here, on the server). */
export function adminRoutes() {
  const router = Router();
  router.use(requireAdmin);
  router.get('/stats', async (req, res) => res.json(await admin.dashboardStats()));
  router.get('/bookings', validate({ query: bookingListQuery }), async (req, res) => res.json(await admin.listBookings(req.validated.query)));
  router.get('/bookings/:id', validate({ params: idParams }), async (req, res) => res.json(await admin.getBookingForAdmin(req.validated.params.id)));
  return router;
}
