import { getDbStatus } from '../config/db.js';

export async function getHealth(req, res) {
  const db = await getDbStatus();
  // "ok" means the API can actually serve bookings: connected AND able to write.
  // 503 lets monitoring tools (and the React page) tell "API up, DB unusable" apart from "all good".
  const healthy = db.connected && db.writable;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    db,
  });
}
