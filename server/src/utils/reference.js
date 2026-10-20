import { randomInt } from 'node:crypto';

// No 0/O or 1/I, so references are easy to read out at a ticket counter.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A booking reference like "IMV-7K2QX9PB" (32^8 ≈ 1.1 trillion combinations, cryptographically random). */
export function newBookingReference() {
  let code = '';
  for (let i = 0; i < 8; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return `IMV-${code}`;
}
