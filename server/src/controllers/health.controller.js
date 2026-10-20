import { getDbStatus } from '../config/db.js';

export async function getHealth(req, res) {
  const db = await getDbStatus();
  // 503 lets monitoring tools (and the React page) tell "API up, DB down" apart from "all good".
  res.status(db.connected ? 200 : 503).json({
    status: db.connected ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    db,
  });
}
