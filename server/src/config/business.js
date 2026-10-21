// Business rules, numbered as in docs/ARCHITECTURE.md ("Business rules"); comments elsewhere cite them as "business rule N".
// They are constants, not environment variables, so a mis-configured server can't silently change them.

/** Business rule 3: all money is INR, stored as integer paise (₹1 = 100 paise). No taxes or fees. */
export const CURRENCY = 'INR';

/** Business rule 3: customer-facing cinema times use India Standard Time. */
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

/** Business rule 4: how long seats stay held while the customer pays. */
export const SEAT_HOLD_MINUTES = 10;

/** Business rule 2: customers may cancel (with a full simulated refund) only this long before the show. */
export const CANCELLATION_CUTOFF_MINUTES = 120;

/** Business rule 1: token lifetimes. */
export const ACCESS_TOKEN_TTL_MINUTES = 15;
export const REFRESH_TOKEN_TTL_DAYS = 7;

// Operational defaults (documented in docs/ARCHITECTURE.md).

/** Cleaning/turnaround time added after every show before the screen can be used again. */
export const SHOWTIME_TURNAROUND_MINUTES = 15;

/** Maximum seats in one booking. */
export const MAX_SEATS_PER_BOOKING = 10;
