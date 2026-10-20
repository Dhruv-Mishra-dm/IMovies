// Every business rule that depends on "now" (hold expiry, cancellation cut-off, booking windows)
// reads the time from here, never from the browser and never from scattered `new Date()` calls.
// Tests shift the clock forward instead of sleeping, which keeps them fast and deterministic.

let offsetMs = 0;

export const clock = {
  now() {
    return new Date(Date.now() + offsetMs);
  },
  /** Test helper: move the clock forward (or back) by `ms` milliseconds. */
  advance(ms) {
    offsetMs += ms;
  },
  reset() {
    offsetMs = 0;
  },
};

export const minutes = (n) => n * 60_000;
