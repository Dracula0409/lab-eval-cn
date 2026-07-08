import { Router } from 'express';
import EvaluationRun from '../models/EvaluationRun.js';
import { runAndEvaluate } from '../controllers/sshController.js';

const router = Router();

async function handleEvaluation(req, res, runType) {
  try {
    console.log("1. handleEvaluation entered");
    const {
      userId = '',
      studentName = '',
      sessionId,
      moduleId,
      questionId,
      tagPaths = {},
      sourceFiles = {},
    } = req.body;

    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required' });
    }
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (!tagPaths || Object.keys(tagPaths).length === 0) {
      return res.status(400).json({ error: 'tagPaths is required (tag -> absolute file path)' });
    }

    console.log("2. before runAndEvaluate");

    const result = await runAndEvaluate({
      userId,
      studentName,
      sessionId,
      moduleId,
      questionId,
      tagPaths,
      sourceFiles,
      runType,
    });

    console.log("3. after runAndEvaluate");
    res.json({ success: true, ...result });
    console.log("4. response sent");
  } catch (err) {
    console.error(`[API] evaluation/${runType} error:`, err);
    res.status(500).json({ error: err.message });
  }
}

router.post('/run', (req, res) => handleEvaluation(req, res, 'evaluate'));

router.post('/submit', (req, res) => handleEvaluation(req, res, 'submit'));

router.get('/results', async (req, res) => {
  try {
    const { userId, sessionId, questionId, runType } = req.query;
    if (!userId || !sessionId) {
      return res.status(400).json({ error: 'userId and sessionId are required' });
    }

    const query = { userId, sessionId };
    if (questionId) query.questionId = questionId;
    if (runType) query.runType = runType;

    const runs = await EvaluationRun.find(query).sort({ createdAt: -1 }).limit(20);
    res.json(runs);
  } catch (err) {
    console.error('[API] evaluation/results error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
