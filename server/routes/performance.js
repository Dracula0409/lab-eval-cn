import express from 'express';
import User from '../models/User.js';
import { Question } from '../models/Question.js';
import { CNModule } from '../models/Module.js';
import EvaluationRun from '../models/EvaluationRun.js';
import LabAssignment from '../models/LabAssignment.js';
import TestAttempt from '../models/TestAttempt.js';
import { authorize, requireAuth } from '../middleware/auth.js';
import {
  pickBestRun,
  buildQuestionReport,
  csvEscape,
  getTcGroups,
} from '../utils/performanceHelper.js';

const router = express.Router();
router.use(requireAuth, authorize('faculty', 'admin'));

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
    const [runSlots, attemptSlots] = await Promise.all([
      EvaluationRun.distinct('slotKey', { slotKey: { $nin: [null, ''] } }),
      TestAttempt.distinct('slotKey', { slotKey: { $nin: [null, ''] } }),
    ]);
    res.json([...new Set([...runSlots, ...attemptSlots])].sort().reverse());
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

router.get('/class-report', async (req, res) => {
  try {
    const { batch, moduleId, slot, search } = req.query;

    if (!batch) return res.status(400).json({ error: 'batch is required' });
    if (!moduleId) return res.status(400).json({ error: 'moduleId is required' });

    const studentFilter = { batch, role: 'student' };
    if (search) {
      const pattern = new RegExp(String(search).trim(), 'i');
      studentFilter.$or = [
        { user_id: pattern },
        { roll_number: pattern },
        { name: pattern },
      ];
    }

    const [students, module] = await Promise.all([
      User.find(studentFilter).select('user_id name roll_number batch').sort({ roll_number: 1 }).lean(),
      CNModule.findById(moduleId).populate('questions').lean(),
    ]);

    if (!module) return res.status(404).json({ error: 'Module not found' });
    const questions = module.questions || [];
    const userIds = students.map((s) => s.user_id);
    const questionIds = questions.map((q) => q._id.toString());

    const runFilter = { userId: { $in: userIds }, questionId: { $in: questionIds } };
    if (slot) runFilter.slotKey = slot;
    if (moduleId) runFilter.moduleId = moduleId;

    const allRuns = await EvaluationRun.find(runFilter).sort({ createdAt: -1 }).lean();
    const runsByPair = new Map();
    for (const run of allRuns) {
      const key = `${run.userId}|${run.questionId}`;
      if (!runsByPair.has(key)) runsByPair.set(key, []);
      runsByPair.get(key).push(run);
    }

    const rows = students.map((student) => ({
      student: {
        user_id: student.user_id,
        name: student.name,
        roll_number: student.roll_number,
        batch: student.batch,
      },
      questions: questions.map((question) => {
        const runs = runsByPair.get(`${student.user_id}|${question._id.toString()}`) || [];
        return buildQuestionReport(question, pickBestRun(runs));
      }),
    }));

    res.json({
      batch,
      slot: slot || null,
      module: { _id: module._id, name: module.name },
      rows,
    });
  } catch (err) {
    console.error('[performance] class report error:', err);
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

    const activeAssignmentFilter = {
      activeModule: moduleId,
      $or: [
        { targetBatch: batch },
        { targetBatch: { $in: [null, ''] } },
      ],
      status: 'active',
    };
    if (slot) activeAssignmentFilter.slotKey = slot;
    const activeAssignment = await LabAssignment.findOne(activeAssignmentFilter).lean();

    if (activeAssignment && (!activeAssignment.endsAt || new Date(activeAssignment.endsAt) > new Date())) {
      return res.status(403).json({
        error: 'CSV download is available only after this lab session ends.',
        endsAt: activeAssignment.endsAt,
      });
    }

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
    // Per question: how many testcases, and how many connection pairs each
    // testcase needs (max across the class) -> TC1,TC1,TC1,TC1,TC1,TC2,TC2,TC2
    const tcLayoutByQuestion = {};
    for (const q of questions) {
      const qid = q._id.toString();
      const pairCounts = [];
      for (const s of students) {
        const run = getRun(s.user_id, qid);
        getTcGroups(run).forEach((g, i) => {
          pairCounts[i] = Math.max(pairCounts[i] || 0, g.verdicts.length);
        });
      }
      tcLayoutByQuestion[qid] = pairCounts.length ? pairCounts : [1];
    }

    const header = ['Roll No'];
    for (const q of questions) {
      const layout = tcLayoutByQuestion[q._id.toString()];
      header.push('Question');
      layout.forEach((pairCount, i) => {
        for (let j = 0; j < (pairCount || 1); j++) header.push(`TC${i + 1}`);
      });
      header.push('Persistence', 'Listen', 'Established', 'Closed');
    }

    const rows = [header];

    for (const s of students) {
      const row = [s.roll_number || s.user_id];
      for (const q of questions) {
        const qid = q._id.toString();
        const layout = tcLayoutByQuestion[qid];
        const run = getRun(s.user_id, qid);
        const report = buildQuestionReport(q, run);

        row.push(report.attempted ? report.questionKey : '');
        layout.forEach((pairCount, i) => {
          const verdicts = report.tcGroups[i]?.verdicts || [];
          for (let j = 0; j < (pairCount || 1); j++) row.push(verdicts[j] ?? '');
        });
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
