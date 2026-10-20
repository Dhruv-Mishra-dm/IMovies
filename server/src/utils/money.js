// Money is stored as integer paise (₹1 = 100 paise) to avoid floating-point rounding errors:
// 0.1 + 0.2 !== 0.3 in JavaScript, but 10 + 20 === 30 always.

export const MAX_SEAT_PRICE_PAISE = 1_000_000; // ₹10,000 — a sanity limit for admin input

export function isValidPaise(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_SEAT_PRICE_PAISE;
}

export function sumPaise(amounts) {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/** For logs and messages only; the UI formats money itself. */
export function formatInr(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}
