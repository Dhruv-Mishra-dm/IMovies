import pino from 'pino';
import { env } from './env.js';

// Anything matching these paths is replaced before the log line is written,
// so a careless `logger.info({ body })` can't leak credentials.
export const REDACT_PATHS = [
  'password',
  'passwordHash',
  'token',
  '*.password',
  '*.passwordHash',
  '*.token',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export function createLogger({ level = env.logLevel, pretty = env.logPretty, destination } = {}) {
  const options = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: undefined, // omit pid/hostname noise
  };
  if (pretty && !destination) {
    // pino-pretty is a devDependency: readable output for development only.
    options.transport = { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } };
  }
  return destination ? pino(options, destination) : pino(options);
}

export const logger = createLogger();
