import { EventEmitter } from 'node:events';
import { logger } from '../config/logger.js';

/**
 * In-process domain events. Services publish here ONLY AFTER their database transaction has
 * committed, so a listener (the Socket.IO layer) can never announce a change that was rolled back.
 *
 * Events:
 *  - 'seats.changed'     { showtimeId, changes: [{ seatId, state: 'available' | 'held' | 'booked' }] }
 *  - 'booking.updated'   { userId, bookingId, status }
 *  - 'showtime.cancelled' { showtimeId }
 */
export const bus = new EventEmitter();
bus.setMaxListeners(50);

export function publish(event, payload) {
  try {
    bus.emit(event, payload);
  } catch (err) {
    // A failing listener must never turn a committed database change into an error response.
    logger.error({ err, event }, 'Event listener failed');
  }
}

/** Convenience for the common seat events. Does nothing for an empty list. */
export function publishSeatChanges(showtimeId, seatIds, state) {
  if (!seatIds?.length) return;
  publish('seats.changed', { showtimeId: String(showtimeId), changes: seatIds.map((seatId) => ({ seatId, state })) });
}
