import { AuditLog } from '../models/index.js';
import { logger } from '../config/logger.js';

/** Records an administrative action (also mirrored to the structured log). */
export async function audit({ actor, action, entityType, entityId, details, session }) {
  await AuditLog.create([{ actor, action, entityType, entityId, details }], session ? { session } : undefined);
  logger.info({ actor: String(actor), action, entityType, entityId: String(entityId) }, 'Admin action');
}
