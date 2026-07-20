import Session from '../models/Session.js';
import { ensureSessionContainer } from '../controllers/sshController.js';

/**
 * Returns the most recent session document for a user.
 */
export async function getActiveSessionForUser(userId) {
  const session = await Session.findOne({ userId }).sort({ createdAt: -1 });
  if (!session) {
    throw new Error(`No active session for user ${userId}`);
  }
  return session;
}

export async function getContainerNameForUser(userId) {
  const session = await ensureSessionContainer(userId);
  return session.containerName;
}
