import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createLogger } from '../src/config/logger.js';

function captureLogger() {
  const lines = [];
  const destination = new Writable({
    write(chunk, encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  return { logger: createLogger({ level: 'info', destination }), lines };
}

describe('structured logger', () => {
  it('writes JSON lines with level and message', () => {
    const { logger, lines } = captureLogger();
    logger.info({ bookingId: 'b1' }, 'Booking confirmed');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].msg, 'Booking confirmed');
    assert.equal(lines[0].bookingId, 'b1');
    assert.equal(lines[0].level, 30);
  });

  it('redacts passwords, tokens and auth headers', () => {
    const { logger, lines } = captureLogger();
    logger.info({
      password: 'p1',
      user: { email: 'a@b.com', passwordHash: 'h1', token: 't1' },
      req: { headers: { cookie: 'imovies_at=jwt', authorization: 'Bearer x' } },
    });
    const text = JSON.stringify(lines[0]);
    assert.doesNotMatch(text, /p1|h1|t1|imovies_at=jwt|Bearer x/);
    assert.equal(lines[0].user.email, 'a@b.com');
    assert.equal(lines[0].user.passwordHash, '[REDACTED]');
  });
});
