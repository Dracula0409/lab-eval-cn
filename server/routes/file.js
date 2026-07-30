import { Router } from 'express';
import { exec } from 'child_process';
import path from 'path';
import { ensureSessionContainer } from '../controllers/sshController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/list-files', requireAuth, async (req, res) => {
  try {
    const { cwd, sessionId } = req.query;
    const userId = req.user.user_id;
    const { containerName } = await ensureSessionContainer(userId, sessionId);
    const targetPath = cwd ? `${cwd}` : `/home/labuser`;

    exec(`docker exec ${containerName} ls ${targetPath}`, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({ error: stderr || 'Failed to list files' });
      }

      const files = stdout
        .split('\n')
        .filter(f => f.endsWith('.c') || f.endsWith('.java'));

      res.json({ files });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/read-file', requireAuth, async (req, res) => {
  try {
    const { cwd, filename, sessionId } = req.query;
    const userId = req.user.user_id;
    const { containerName } = await ensureSessionContainer(userId, sessionId);
    const fullPath = path.posix.join(cwd || '/home/labuser', filename);
    const command = `docker exec ${containerName} cat "${fullPath}"`;

    exec(command, (err, stdout, stderr) => {
      if (err) {
        // Missing file is an expected, common outcome here (checking whether
        // a rename target exists, or hydrating a fresh Free Coding file that
        // has no on-disk copy yet) — respond 404 rather than 200 so callers
        // can't mistake this for success by only checking the body shape.
        // Log it quietly rather than as an error; only a failure that isn't
        // just "file doesn't exist" (container down, permissions, etc.)
        // deserves error-level logging.
        const isMissingFile = /no such file or directory/i.test(stderr || err.message || '');
        if (isMissingFile) {
          console.log(`[Docker Read] ${fullPath} not found (expected — treating as no on-disk copy yet)`);
        } else {
          console.error('[Docker Read Error]', stderr || err.message);
        }
        return res.status(404).json({ exists: false, code: null, error: stderr || 'File not found' });
      }
      res.json({ exists: true, code: stdout });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;