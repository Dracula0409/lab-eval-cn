import express from 'express';
import User from '../models/User.js';
import { Question } from '../models/Question.js';
import { CNModule } from '../models/Module.js';
import EvaluationRun from '../models/EvaluationRun.js';
import {
  pickBestRun,
  buildQuestionReport,
  csvEscape,
} from '../utils/performanceHelper.js';

const router = express.Router();

// GET /api/performance/batches - distinct student batches (e.g. N, P, Q)
router.get('/batches', async (req, res) => {
  try {
    const batches = await User.distinct('batch', { role: 'student', batch: { $nin: [null, ''] } });
    res.json(batches.sort());
  } catch (err) {
    console.error('[performance] batches error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/performance/slots - distinct AN/FN slot keys seen in evaluation runs,
// most recent first (e.g. "2026-07-13_AN")
router.get('/slots', async (req, res) => {
  try {
    const slots = await EvaluationRun.distinct('slotKey', { slotKey: { $nin: [null, ''] } });
    res.json(slots.sort().reverse());
  } catch (err) {
    console.error('[performance] slots error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/performance/students?batch=N - roster for the batch/class dropdown
// and for the individual-lookup search box
router.get('/students', async (req, res) => {
  try {
    const { batch } = req.query;
    const filter = { role: 'student' };
    if (batch) filter.batch = batch;

    const students = await User.find(filter)
      .select('user_id name roll_number batch')
      .sort({ roll_number: 1 })
      .lean();

    res.json(students);
  } catch (err) {
    console.error('[performance] students error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Resolve the list of questions to report on: from a module if moduleId is
 * given, otherwise every question the student has an evaluation run for.
 */
async function resolveQuestions({ moduleId, userId, slotKey }) {
  if (moduleId) {
    const module = await CNModule.findById(moduleId).populate('questions').lean();
    if (!module) return { error: 'Module not found' };
    return { questions: module.questions || [] };
  }

  const filter = { userId };
  if (slotKey) filter.slotKey = slotKey;
  const questionIds = await EvaluationRun.distinct('questionId', filter);
  const questions = await Question.find({ _id: { $in: questionIds } }).lean();
  return { questions };
}

// GET /api/performance/student/:userId?slot=&moduleId=
// Individual student report — searchable by roll number / user id.
router.get('/student/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { slot, moduleId } = req.query;

    const student = await User.findOne({
      $or: [{ user_id: userId }, { roll_number: userId }],
    }).lean();

    if (!student) {
      return res.status(404).json({ error: `No student found matching "${userId}"` });
    }

    const { questions, error } = await resolveQuestions({
      moduleId,
      userId: student.user_id,
      slotKey: slot,
    });
    if (error) return res.status(404).json({ error });

    const report = [];
    for (const q of questions) {
      const runFilter = { userId: student.user_id, questionId: q._id.toString() };
      if (slot) runFilter.slotKey = slot;
      if (moduleId) runFilter.moduleId = moduleId;

      const runs = await EvaluationRun.find(runFilter).sort({ createdAt: -1 }).lean();
      const run = pickBestRun(runs);
      report.push(buildQuestionReport(q, run));
    }

    res.json({
      student: {
        user_id: student.user_id,
        name: student.name,
        roll_number: student.roll_number,
        batch: student.batch,
      },
      slot: slot || null,
      moduleId: moduleId || null,
      questions: report,
    });
  } catch (err) {
    console.error('[performance] student report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/performance/class-csv?batch=&moduleId=&slot=
// Collective CSV report for an entire class/batch, one row per student.
// Column layout per question block: Question, TC1..TCn, Persistence,
// Listen, Established, Closed — repeated for each question in the module.
router.get('/class-csv', async (req, res) => {
  try {
    const { batch, moduleId, slot } = req.query;

    if (!batch) return res.status(400).json({ error: 'batch is required' });
    if (!moduleId) return res.status(400).json({ error: 'moduleId is required' });

    const students = await User.find({ batch, role: 'student' })
      .sort({ roll_number: 1 })
      .lean();

    const module = await CNModule.findById(moduleId).populate('questions').lean();
    if (!module) return res.status(404).json({ error: 'Module not found' });

    const questions = module.questions || [];
    if (!questions.length) {
      return res.status(400).json({ error: 'Selected module has no questions' });
    }

    const userIds = students.map((s) => s.user_id);
    const questionIds = questions.map((q) => q._id.toString());

    const runFilter = { userId: { $in: userIds }, questionId: { $in: questionIds } };
    if (slot) runFilter.slotKey = slot;

    const allRuns = await EvaluationRun.find(runFilter).sort({ createdAt: -1 }).lean();

    // Group runs by "userId|questionId", newest first (already sorted above).
    const runsByPair = new Map();
    for (const r of allRuns) {
      const key = `${r.userId}|${r.questionId}`;
      if (!runsByPair.has(key)) runsByPair.set(key, []);
      runsByPair.get(key).push(r);
    }

    const getRun = (userId, questionId) =>
      pickBestRun(runsByPair.get(`${userId}|${questionId}`) || []);

    // Determine how many TC columns each question needs (max across the class).
    const maxTcByQuestion = {};
    for (const q of questions) {
      const qid = q._id.toString();
      let max = 0;
      for (const s of students) {
        const run = getRun(s.user_id, qid);
        const count = (run?.communicationResults || []).reduce(
          (sum, tc) => sum + (tc.pairs?.length || 0),
          0
        );
        if (count > max) max = count;
      }
      maxTcByQuestion[qid] = max || 1;
    }

    // Header row
    const header = ['Roll No'];
    for (const q of questions) {
      const n = maxTcByQuestion[q._id.toString()];
      header.push('Question');
      for (let i = 1; i <= n; i++) header.push(`TC${i}`);
      header.push('Persistence', 'Listen', 'Established', 'Closed');
    }

    const rows = [header];

    for (const s of students) {
      const row = [s.roll_number || s.user_id];
      for (const q of questions) {
        const qid = q._id.toString();
        const n = maxTcByQuestion[qid];
        const run = getRun(s.user_id, qid);
        const report = buildQuestionReport(q, run);

        row.push(report.attempted ? report.questionKey : '');
        for (let i = 0; i < n; i++) {
          row.push(report.tcVerdicts[i] ?? '');
        }
        row.push(report.persistence ?? '');
        row.push(report.Listen ?? '');
        row.push(report.Established ?? '');
        row.push(report.Closed ?? '');
      }
      rows.push(row);
    }

    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');

    const safeBatch = String(batch).replace(/[^a-z0-9_-]/gi, '');
    const safeSlot = slot ? String(slot).replace(/[^a-z0-9_-]/gi, '') : 'all-slots';
    const filename = `performance_${safeBatch}_${safeSlot}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[performance] class-csv error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;