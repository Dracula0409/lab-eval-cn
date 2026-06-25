import { Router } from 'express';
import { exec } from 'child_process';
import pingRoute from './ping.js';
import questionsRoute from './questions.js';
import submissionRoute from './submission.js';
import filesRoute from './file.js';
import moduleRoutes from './modules.js';
import sessionsRoute from './sessions.js';
import evaluationRoute from './evaluation.js';
import coursesRoute from './courses.js';
import { saveFileToContainer } from '../controllers/sshController.js';

const router = Router();

router.use('/ping', pingRoute);
router.use('/questions', questionsRoute);
router.use('/submission', submissionRoute);
router.use('/evaluation', evaluationRoute);
router.use('/file',filesRoute);
router.use('/modules', moduleRoutes);
router.use('/sessions', sessionsRoute);
router.use('/courses', coursesRoute);

function generateSessionId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  const period = now.getHours() < 12 ? 'FN' : 'AN';
  return `${year}${month}${day}_${period}`;
}

function renameFileInContainer({ userId, oldPath, newPath }) {
  return new Promise((resolve, reject) => {
    const userId = 'testuser123'; //hardcoded for now, must use JWT
    const sessionId = generateSessionId();
    const containerName = `lab_exam_${userId}_${sessionId}`;
    
    const cmd = `mv ${oldPath} ${newPath}`;

    exec(`docker exec ${containerName} sh -c '${cmd}'`, (err, stdout, stderr) => {
      if (err) {
        console.error('Rename failed:', stderr || err);
        return reject(new Error(stderr || err.message));
      }
      resolve();
    });
  });
}

// Save file to container
router.post('/save-file', async (req, res) => {
  try {
    // console.log('[API] save-file received:', req.body);
    const { userId = 'testuser123', filename, filePath, code } = req.body;
    if (!filename || !code) return res.status(400).json({ error: 'Missing filename or code' });
    console.log(filePath)
    await saveFileToContainer({ userId, filename, filePath, code });
    console.log('[API] save-file completed successfully');
    res.json({ success: true });
  } catch (err) {
    console.error('[API] save-file error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/rename-file', async (req, res) => {
  try {
    const { userId = 'testuser123', oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      return res.status(400).json({ error: 'Missing oldPath or newPath' });
    }

    await renameFileInContainer({ userId, oldPath, newPath });

    console.log(`[API] Renamed file inside container for ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[API] rename-file error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;