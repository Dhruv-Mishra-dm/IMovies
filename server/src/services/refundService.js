import { Payment, Refund } from '../models/index.js';
import { PAYMENT_STATUS } from '../domain/statuses.js';
import { logger } from '../config/logger.js';
import { clock, minutes } from '../utils/clock.js';
import { paymentProvider } from './payments/simulatedProvider.js';

/**
 * Records a full refund of the booking's captured payment, INSIDE the caller's cancellation
 * transaction. The unique index on Refund.payment makes this idempotent: a booking can be refunded
 * at most once, even if a customer and an admin cancel at the same moment.
 * Returns the PENDING refund, or null when nothing was captured.
 */
export async function recordRefund(booking, reason, session) {
  const payment = await Payment.findOne({ booking: booking._id, captured: true }).session(session);
  if (!payment) {
    logger.warn({ bookingId: String(booking._id) }, 'Cancelled booking has no captured payment to refund');
    return null;
  }
  const existing = await Refund.findOne({ payment: payment._id }).session(session);
  if (existing) return existing;
  const [refund] = await Refund.create(
    [{ payment: payment._id, booking: booking._id, user: booking.user, amount: payment.amount, reason, status: 'PENDING' }],
    { session },
  );
  return refund;
}

/**
 * Asks the provider to pay the refund back, AFTER the cancellation committed (external calls never
 * run inside a database transaction). Safe to call repeatedly: only a PENDING refund is processed.
 * A provider failure leaves the refund FAILED for the retry job (see retryPendingRefunds).
 */
export async function processRefund(refundId) {
  const refund = await Refund.findOne({ _id: refundId, status: { $in: ['PENDING', 'FAILED'] } });
  if (!refund) return Refund.findById(refundId);
  const payment = await Payment.findById(refund.payment);
  try {
    const { refundId: providerReference } = await paymentProvider().refund({ captureId: payment.providerReference, amount: refund.amount });
    const now = clock.now();
    const done = await Refund.findOneAndUpdate(
      { _id: refund._id, status: { $in: ['PENDING', 'FAILED'] } },
      { $set: { status: 'SUCCEEDED', providerReference } },
      { returnDocument: 'after' },
    );
    await Payment.updateOne({ _id: payment._id, status: PAYMENT_STATUS.SUCCEEDED }, { $set: { status: PAYMENT_STATUS.REFUNDED, refundedAt: now } });
    logger.info({ refundId: String(refund._id), amount: refund.amount }, 'Simulated refund completed');
    return done ?? Refund.findById(refund._id);
  } catch (err) {
    logger.error({ err, refundId: String(refund._id) }, 'Refund failed; it will be retried');
    return (await Refund.findOneAndUpdate({ _id: refund._id, status: 'PENDING' }, { $set: { status: 'FAILED' } }, { returnDocument: 'after' })) ?? refund;
  }
}

/** Background recovery: retries refunds that are still pending/failed after a minute. */
export async function retryPendingRefunds({ limit = 50 } = {}) {
  const stuck = await Refund.find({ status: { $in: ['PENDING', 'FAILED'] }, updatedAt: { $lt: new Date(clock.now().getTime() - minutes(1)) } })
    .select('_id')
    .limit(limit);
  for (const { _id } of stuck) await processRefund(_id);
  return stuck.length;
}
