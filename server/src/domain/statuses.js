// State machines. Services must check `canTransition` before changing a status, and the database
// updates use the current status as a condition (e.g. { _id, status: 'HELD' }) so two concurrent
// requests can never both perform the same transition.

export const BOOKING_STATUS = Object.freeze({
  HELD: 'HELD', // seats reserved for 10 minutes while the customer pays (failed payments can be retried)
  CONFIRMED: 'CONFIRMED', // paid
  EXPIRED: 'EXPIRED', // hold ran out before a successful payment; seats released
  RELEASED: 'RELEASED', // customer abandoned checkout; seats released
  CANCELLED: 'CANCELLED', // cancelled by the customer (≥ 120 min before) or because the show was cancelled
});

const BOOKING_TRANSITIONS = {
  HELD: ['CONFIRMED', 'EXPIRED', 'RELEASED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  EXPIRED: [],
  RELEASED: [],
  CANCELLED: [],
};

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING', // attempt in progress
  SUCCEEDED: 'SUCCEEDED', // captured; booking confirmed
  FAILED: 'FAILED', // declined (or interrupted); customer may retry while the hold is valid
  VOIDED: 'VOIDED', // authorised but never captured, because the hold expired / show was cancelled
  REFUNDED: 'REFUNDED', // captured, then fully refunded
});

const PAYMENT_TRANSITIONS = {
  PENDING: ['SUCCEEDED', 'FAILED', 'VOIDED'],
  SUCCEEDED: ['REFUNDED'],
  FAILED: [],
  VOIDED: [],
  REFUNDED: [],
};

export const SHOWTIME_STATUS = Object.freeze({
  SCHEDULED: 'SCHEDULED',
  CANCELLED: 'CANCELLED',
});

const SHOWTIME_TRANSITIONS = { SCHEDULED: ['CANCELLED'], CANCELLED: [] };

export const MOVIE_STATUS = Object.freeze({ DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' });

const MOVIE_TRANSITIONS = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['PUBLISHED'],
};

const MACHINES = {
  booking: BOOKING_TRANSITIONS,
  payment: PAYMENT_TRANSITIONS,
  showtime: SHOWTIME_TRANSITIONS,
  movie: MOVIE_TRANSITIONS,
};

export function canTransition(machine, from, to) {
  return MACHINES[machine]?.[from]?.includes(to) ?? false;
}

/** Booking statuses whose seats are still occupied. */
export const ACTIVE_BOOKING_STATUSES = [BOOKING_STATUS.HELD, BOOKING_STATUS.CONFIRMED];
