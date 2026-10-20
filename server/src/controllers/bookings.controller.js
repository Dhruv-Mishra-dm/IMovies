import { Payment, Refund } from '../models/index.js';
import * as holds from '../services/holdService.js';
import * as payments from '../services/paymentService.js';
import * as cancellations from '../services/cancellationService.js';
import { listOwnBookings } from '../services/bookingHistoryService.js';
import { idempotencyKey } from '../validators/bookings.js';
import { AppError } from '../utils/AppError.js';
import { clock } from '../utils/clock.js';

// Booking responses include the server's current time so the browser can show an accurate
// hold countdown even if the visitor's computer clock is wrong, plus the payment attempts, refunds
// and whether the booking can be cancelled (decided here, on the server).
async function bookingView(booking) {
  const [paymentList, refunds] = await Promise.all([Payment.find({ booking: booking._id }).sort({ createdAt: 1 }), Refund.find({ booking: booking._id })]);
  return {
    booking,
    payments: paymentList,
    refunds,
    cancellation: cancellations.cancellationEligibility(booking),
    serverTime: clock.now(),
  };
}

export async function listMine(req, res) {
  res.json(await listOwnBookings(req.user, req.validated.query));
}

export async function seatAvailability(req, res) {
  res.json(await holds.getSeatAvailability(req.validated.params.id, req.user));
}

export async function create(req, res) {
  res.status(201).json(await bookingView(await holds.createHold(req.user, req.validated.body)));
}

export async function detail(req, res) {
  res.json(await bookingView(await holds.getOwnBooking(req.user, req.validated.params.id)));
}

export async function release(req, res) {
  res.json(await bookingView(await holds.releaseHold(req.user, req.validated.params.id)));
}

export async function pay(req, res) {
  const key = idempotencyKey.safeParse(req.get('Idempotency-Key') ?? '');
  if (!key.success) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send a unique Idempotency-Key header with each payment attempt');
  const result = await payments.payForBooking(req.user, req.validated.params.id, { idempotencyKey: key.data, outcome: req.validated.body.outcome });
  // 201 = a new attempt was recorded (it may have SUCCEEDED or FAILED — see payment.status);
  // 200 = a repeated request with the same key, answered with the original result.
  res.status(result.replayed ? 200 : 201).json({ payment: result.payment, ...(await bookingView(result.booking)) });
}

export async function cancel(req, res) {
  const { booking, refund } = await cancellations.cancelByCustomer(req.user, req.validated.params.id);
  res.json({ ...(await bookingView(booking)), refund });
}
