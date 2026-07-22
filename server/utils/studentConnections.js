import crypto from 'crypto';
import StudentConnection from '../models/StudentConnection.js';

// A connection is retained long enough to tolerate short Wi-Fi interruptions
// and accidental refreshes, but is automatically released after a browser/tab
// close, crash, shutdown, or network loss stops the heartbeats.
export const CONNECTION_TTL_MS = 15 * 60 * 1000;
export const MAX_CONNECTIONS_PER_STUDENT = 2;

export function clientIp(req) {
  // Express only derives req.ip from X-Forwarded-For when `trust proxy` is
  // enabled by the server configuration; direct clients cannot spoof it.
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim().replace(/^::ffff:/, '');
}

export function connectionExpiry() {
  return new Date(Date.now() + CONNECTION_TTL_MS);
}

export function activeConnectionFilter(userId) {
  return { userId, revokedAt: null, expiresAt: { $gt: new Date() } };
}

export async function createStudentConnection(req, student) {
  const ipAddress = clientIp(req);
  const deviceId = String(req.headers['x-cnlab-device-id'] || '').slice(0, 128);
  const active = await StudentConnection.find(activeConnectionFilter(student.user_id));

  // IP is the enforcement boundary requested for the lab.  It is intentionally
  // checked server-side; a client cannot bypass it by deleting browser storage.
  if (active.some((connection) => connection.ipAddress !== ipAddress)) {
    const error = new Error('This student account is already active from another network/device. Ask the teacher to disconnect that session if this is unexpected.');
    error.status = 409;
    throw error;
  }

  const sameDevice = deviceId && active.find((connection) => connection.deviceId === deviceId);
  if (sameDevice) {
    sameDevice.revokedAt = new Date();
    sameDevice.revokedReason = 'replaced by a new login from the same device';
    await sameDevice.save();
  } else if (active.length >= MAX_CONNECTIONS_PER_STUDENT) {
    const error = new Error(`This student account already has ${MAX_CONNECTIONS_PER_STUDENT} active connections. Log out elsewhere or ask the teacher to disconnect one.`);
    error.status = 409;
    throw error;
  }

  const now = new Date();
  return StudentConnection.create({
    user: student._id,
    userId: student.user_id,
    sessionId: crypto.randomUUID(),
    ipAddress,
    deviceId,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
    lastSeenAt: now,
    expiresAt: connectionExpiry(),
  });
}

export async function touchStudentConnection(sessionId) {
  return StudentConnection.findOneAndUpdate(
    { sessionId, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { lastSeenAt: new Date(), expiresAt: connectionExpiry() } },
    { new: true }
  );
}

export async function revokeStudentConnection(sessionId, reason = 'logged out') {
  return StudentConnection.findOneAndUpdate(
    { sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason, expiresAt: new Date() } },
    { new: true }
  );
}
