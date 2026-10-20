import { logger } from '../config/logger.js';
import { sweepExpiredHolds } from '../services/holdService.js';

/**
 * Runs the expired-hold clean-up every `intervalMs`. Several server instances can run it at once
 * safely (each expiry is a conditional update), and nothing breaks if it doesn't run at all —
 * expired holds are also ignored and cleared lazily by every booking operation.
 * Returns a function that stops the timer.
 */
export function startHoldSweeper({ intervalMs = 15_000, tasks = [sweepExpiredHolds] } = {}) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // never overlap runs
    running = true;
    try {
      for (const task of tasks) await task();
    } catch (err) {
      logger.error({ err }, 'Background sweep failed; will retry on the next run');
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
