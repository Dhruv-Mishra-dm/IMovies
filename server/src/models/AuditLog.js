import mongoose from 'mongoose';

// Append-only record of administrative actions (who did what, when, with what outcome),
// so cancellations, refunds and catalogue changes can be explained later.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, maxlength: 60 }, // e.g. SHOWTIME_CANCELLED
    entityType: { type: String, required: true, maxlength: 40 },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    details: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
