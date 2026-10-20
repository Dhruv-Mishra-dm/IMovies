import { BUSINESS_TIME_ZONE } from '../config/business.js';

// Dates are always STORED as UTC instants (JavaScript Date / BSON Date).
// Asia/Kolkata (IST) is only used to interpret admin input like "2026-11-02 18:30"
// and to group or display times. IST is a fixed UTC+05:30 with no daylight saving.

const IST_OFFSET = '+05:30';

/** "2026-11-02" + "18:30" (IST wall-clock) → the matching UTC Date. */
export function istToDate(dateKey, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new RangeError('Expected date YYYY-MM-DD and time HH:mm');
  }
  const date = new Date(`${dateKey}T${time}:00${IST_OFFSET}`);
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date or time');
  return date;
}

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The IST calendar day of an instant, as "YYYY-MM-DD". */
export function istDateKey(date) {
  return dateKeyFormatter.format(date);
}

/** UTC range [start, end) covering one IST calendar day. */
export function istDayRange(dateKey) {
  const start = istToDate(dateKey, '00:00');
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

/** Adds whole days to a "YYYY-MM-DD" key. */
export function addDaysToKey(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
