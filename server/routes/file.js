import { Router } from 'express';
import { exec } from 'child_process';
import path from 'path';
import { ensureSessionContainer } from '../controllers/sshController.js';

const router = Router();

router.get('/list-files', async (req, res) => {
  try {
    const { cwd, userId = 'testuser123' } = req.query;
    const { containerName } = await ensureSessionContainer(userId);
    const targetPath = cwd ? `${cwd}` : `/home/labuser`;

    exec(`docker exec ${containerName} ls ${targetPath}`, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({ error: stderr || 'Failed to list files' });
      }

      const files = stdout
        .split('\n')
        .filter(f => f.endsWith('.c') || f.endsWith('.py'));

      res.json({ files });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/read-file', async (req, res) => {
  try {
    const { cwd, filename, userId = 'testuser123' } = req.query;
    const { containerName } = await ensureSessionContainer(userId);
    const fullPath = path.posix.join(cwd || '/home/labuser', filename);
    const command = `docker exec ${containerName} cat "${fullPath}"`;

    exec(command, (err, stdout, stderr) => {
      if (err) {
        console.error('[Docker Read Error]', stderr || err.message);
        return res.status(404).json({ error: stderr || 'File not found' });
      }
      res.json({ code: stdout });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
