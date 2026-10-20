import { Showtime } from '../models/Showtime.js';
import { SHOWTIME_STATUS } from '../domain/statuses.js';
import { SHOWTIME_TURNAROUND_MINUTES } from '../config/business.js';
import { minutes } from '../utils/clock.js';

/** A show occupies its screen from startsAt until the film ends plus cleaning/turnaround time. */
export function computeShowtimeWindow(startsAt, durationMins, turnaroundMins = SHOWTIME_TURNAROUND_MINUTES) {
  const endsAt = new Date(startsAt.getTime() + minutes(durationMins));
  return { startsAt, endsAt, blockedUntil: new Date(endsAt.getTime() + minutes(turnaroundMins)) };
}

/**
 * Finds a SCHEDULED showtime on the same screen whose busy window overlaps [startsAt, blockedUntil).
 * Two intervals overlap when each one starts before the other ends.
 * Must be called inside the scheduling transaction (pass `session`) to be race-free; see Screen.scheduleVersion.
 */
export function findOverlappingShowtime({ screenId, startsAt, blockedUntil, excludeId, session }) {
  return Showtime.findOne({
    screen: screenId,
    status: SHOWTIME_STATUS.SCHEDULED,
    startsAt: { $lt: blockedUntil },
    blockedUntil: { $gt: startsAt },
    ...(excludeId && { _id: { $ne: excludeId } }),
  })
    .select('_id startsAt blockedUntil')
    .session(session ?? null)
    .lean();
}
