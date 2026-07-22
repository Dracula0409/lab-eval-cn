import mongoose from 'mongoose';

// A server-side record is required because a signed JWT cannot otherwise be
// revoked before its expiry time.  `expiresAt` is refreshed by the student's
// heartbeat and automatically removes abandoned connections.
const studentConnectionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, unique: true },
  ipAddress: { type: String, required: true },
  deviceId: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  lastSeenAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  revokedReason: { type: String, default: null },
}, { timestamps: true });

studentConnectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
studentConnectionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

export default mongoose.model('StudentConnection', studentConnectionSchema);
