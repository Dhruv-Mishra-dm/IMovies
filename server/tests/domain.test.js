import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSeatLayout, buildLayout, indexSeats, bookableCapacity } from '../src/domain/seatLayout.js';
import { canTransition } from '../src/domain/statuses.js';
import { istToDate, istDateKey, istDayRange, addDaysToKey } from '../src/utils/time.js';
import { isValidPaise, sumPaise } from '../src/utils/money.js';
import { computeShowtimeWindow } from '../src/services/scheduling.js';
import { largeScreenLayout, smallScreenLayout } from '../src/seed/data.js';

const categories = [{ code: 'CLASSIC', name: 'Classic' }];

describe('seat layout validation', () => {
  it('accepts the seed layouts', () => {
    assert.deepEqual(validateSeatLayout(largeScreenLayout), []);
    assert.deepEqual(validateSeatLayout(smallScreenLayout), []);
  });

  it('builds rows with aisles, accessible and disabled seats', () => {
    const layout = buildLayout({ categories, rows: [{ label: 'A', category: 'CLASSIC', seats: 4, aisleAfter: [2], accessible: [1], disabled: [4] }] });
    assert.deepEqual(layout.rows[0].seats.map((s) => s.col), [1, 2, 4, 5]); // column 3 is the aisle
    assert.equal(layout.rows[0].seats[0].accessible, true);
    assert.equal(bookableCapacity(layout), 3);
    assert.deepEqual([...indexSeats(layout).keys()], ['A1', 'A2', 'A3', 'A4']);
  });

  it('rejects duplicate rows, seat numbers and columns', () => {
    const problems = validateSeatLayout({
      categories,
      rows: [
        { label: 'A', seats: [{ number: 1, col: 1, category: 'CLASSIC' }, { number: 1, col: 1, category: 'CLASSIC' }] },
        { label: 'A', seats: [{ number: 2, col: 2, category: 'CLASSIC' }] },
      ],
    });
    assert.ok(problems.some((p) => /duplicate seat number/.test(p)));
    assert.ok(problems.some((p) => /column 1 is already used/.test(p)));
    assert.ok(problems.some((p) => /Duplicate row A/.test(p)));
  });

  it('rejects unknown/unused categories and bad row labels', () => {
    const problems = validateSeatLayout({
      categories: [...categories, { code: 'VIP', name: 'VIP' }],
      rows: [
        { label: 'a', seats: [{ number: 1, col: 1, category: 'CLASSIC' }] },
        { label: 'B', seats: [{ number: 1, col: 1, category: 'GOLD' }] },
      ],
    });
    assert.ok(problems.some((p) => /Row label "a"/.test(p)));
    assert.ok(problems.some((p) => /unknown category "GOLD"/.test(p)));
    assert.ok(problems.some((p) => /VIP is not used/.test(p)));
  });

  it('rejects a layout in which every seat is disabled', () => {
    const problems = validateSeatLayout({
      categories,
      rows: [{ label: 'A', seats: [{ number: 1, col: 1, category: 'CLASSIC', disabled: true }] }],
    });
    assert.deepEqual(problems, ['At least one seat must be bookable']);
  });

  it('rejects an empty layout', () => {
    assert.ok(validateSeatLayout({ categories: [], rows: [] }).length >= 2);
    assert.deepEqual(validateSeatLayout(null), ['Layout is required']);
  });
});

describe('state machines', () => {
  it('allows only documented booking transitions', () => {
    assert.equal(canTransition('booking', 'HELD', 'CONFIRMED'), true);
    assert.equal(canTransition('booking', 'CONFIRMED', 'CANCELLED'), true);
    assert.equal(canTransition('booking', 'CONFIRMED', 'HELD'), false); // a completed booking never goes back
    assert.equal(canTransition('booking', 'EXPIRED', 'CONFIRMED'), false); // late payment can't revive a hold
    assert.equal(canTransition('booking', 'CANCELLED', 'CANCELLED'), false);
  });

  it('allows only documented payment and showtime transitions', () => {
    assert.equal(canTransition('payment', 'PENDING', 'SUCCEEDED'), true);
    assert.equal(canTransition('payment', 'FAILED', 'SUCCEEDED'), false);
    assert.equal(canTransition('payment', 'REFUNDED', 'REFUNDED'), false);
    assert.equal(canTransition('showtime', 'SCHEDULED', 'CANCELLED'), true);
    assert.equal(canTransition('showtime', 'CANCELLED', 'SCHEDULED'), false);
    assert.equal(canTransition('nope', 'A', 'B'), false);
  });
});

describe('time (Asia/Kolkata) and money', () => {
  it('converts IST wall-clock time to UTC', () => {
    assert.equal(istToDate('2026-11-02', '18:30').toISOString(), '2026-11-02T13:00:00.000Z');
    assert.equal(istToDate('2026-11-03', '01:00').toISOString(), '2026-11-02T19:30:00.000Z');
  });

  it('groups instants by IST calendar day, including just after IST midnight', () => {
    assert.equal(istDateKey(new Date('2026-11-02T18:29:59Z')), '2026-11-02');
    assert.equal(istDateKey(new Date('2026-11-02T18:30:00Z')), '2026-11-03');
    const { start, end } = istDayRange('2026-11-03');
    assert.equal(start.toISOString(), '2026-11-02T18:30:00.000Z');
    assert.equal(end.toISOString(), '2026-11-03T18:30:00.000Z');
    assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01');
  });

  it('rejects malformed date/time input', () => {
    assert.throws(() => istToDate('2026-11-2', '18:30'), RangeError);
    assert.throws(() => istToDate('2026-13-40', '18:30'), RangeError);
  });

  it('accepts only whole, bounded paise', () => {
    assert.equal(isValidPaise(25000), true);
    assert.equal(isValidPaise(250.5), false);
    assert.equal(isValidPaise(-1), false);
    assert.equal(sumPaise([18000, 25000, 45000]), 88000);
  });

  it('computes a showtime window with turnaround', () => {
    const w = computeShowtimeWindow(new Date('2026-11-02T13:00:00Z'), 142, 15);
    assert.equal(w.endsAt.toISOString(), '2026-11-02T15:22:00.000Z');
    assert.equal(w.blockedUntil.toISOString(), '2026-11-02T15:37:00.000Z');
  });
});
