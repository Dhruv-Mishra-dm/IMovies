import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDB, disconnectDB } from './config/db.js';
import { ensureIndexes } from './models/index.js';
import { createApp } from './app.js';
import { startHoldSweeper } from './jobs/holdSweeper.js';
import { sweepExpiredHolds } from './services/holdService.js';
import { failStalePayments } from './services/paymentService.js';
import { retryPendingRefunds } from './services/refundService.js';
import { resumeShowtimeCancellations } from './services/cancellationService.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function start() {
  try {
    const conn = await connectDB(env.mongodbUri);
    logger.info({ db: `${conn.host}:${conn.port}/${conn.name}` }, 'MongoDB connected');
    await ensureIndexes();
    logger.info('Database indexes verified');
  } catch (err) {
    logger.fatal({ reason: err.message }, 'Could not connect to MongoDB. Is Docker Desktop running? Try: docker compose up -d');
    process.exit(1);
  }

  const app = createApp({ clientOrigin: env.clientOrigin });
  const server = app.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Background clean-up and recovery (all idempotent and safe with several server instances).
  const stopSweeper = startHoldSweeper({
    tasks: [sweepExpiredHolds, failStalePayments, retryPendingRefunds, resumeShowtimeCancellations],
  });

  server.on('error', (err) => {
    const hint = err.code === 'EADDRINUSE' ? ` Port ${env.port} is already in use — stop the other process or change PORT.` : '';
    logger.fatal({ err }, `HTTP server error.${hint}`);
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down...`);
    stopSweeper();

    // If open connections keep the server alive too long, exit anyway.
    setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close(async () => {
      await disconnectDB();
      process.exit(exitCode);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // A bug that escapes every try/catch leaves the process in an unknown state: log it and restart cleanly.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    shutdown('uncaughtException', 1);
  });
}

start();
