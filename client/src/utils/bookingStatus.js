// Human labels + badge tones for statuses. Text always accompanies colour.

export const BOOKING_STATUS = {
  HELD: { label: 'Awaiting payment', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: '' },
  RELEASED: { label: 'Released', tone: '' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
}

export const PAYMENT_STATUS = {
  PENDING: { label: 'Processing', tone: 'warning' },
  SUCCEEDED: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  VOIDED: { label: 'Not charged', tone: '' },
  REFUNDED: { label: 'Refunded', tone: 'info' },
}

export const REFUND_STATUS = {
  PENDING: { label: 'Refund processing', tone: 'warning' },
  SUCCEEDED: { label: 'Refunded', tone: 'info' },
  FAILED: { label: 'Refund delayed — retrying', tone: 'danger' },
}

export const CANCELLATION_REASONS = {
  CUSTOMER_REQUEST: 'You cancelled this booking.',
  SHOWTIME_CANCELLED: 'The cinema cancelled this show.',
}

/** A random id for one payment attempt (falls back for very old browsers). */
export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}
