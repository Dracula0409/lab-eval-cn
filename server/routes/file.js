import { Router } from 'express';
import { exec } from 'child_process';
import path from 'path';

const router = Router();

function generateSessionId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  const period = now.getHours() < 12 ? 'FN' : 'AN';
  return `${year}${month}${day}_${period}`;
}

router.get('/list-files', (req, res) => {
  const { cwd } = req.query;

  const userId = 'testuser123'; //hardcoded for now, must use JWT
  const sessionId = generateSessionId();
  const containerName = `lab_exam_${userId}_${sessionId}`;

  const targetPath = cwd ? `${cwd}` : `/home/labuser`;

  exec(`docker exec ${containerName} ls ${targetPath}`, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: stderr || 'Failed to list files' });
    }

    console.log('[Docker] Output:', stdout);

    const files = stdout
      .split('\n')
      .filter(f => f.endsWith('.c') || f.endsWith('.py'));

    res.json({ files });
  });
});

router.get('/read-file', (req, res) => {
  const { cwd, filename } = req.query;

  const userId = 'testuser123';
  const sessionId = generateSessionId();
  const containerName = `lab_exam_${userId}_${sessionId}`;

  const fullPath = path.posix.join(cwd || '/home/labuser', filename);

  const command = `docker exec ${containerName} cat "${fullPath}"`;

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error('[Docker Read Error]', stderr || err.message);
      return res.status(500).json({ error: stderr || 'Failed to read file' });
    }
    res.json({ code: stdout });
  });
});

export default router;