import express from 'express';
import Batch from '../models/Batch.js';
import User from '../models/User.js';
import PasswordResetRequest from '../models/PasswordResetRequest.js';

const router = express.Router();

function parseStudentIds(value) {
  if (Array.isArray(value)) return value.map(String).map((id) => id.trim()).filter(Boolean);
  return String(value || '')
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

router.get('/', async (req, res) => {
  try {
    const batches = await Batch.find({}).sort({ name: 1 }).lean();
    res.json(batches);
  } catch (err) {
    console.error('[batches] list error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, defaultPassword, studentIds } = req.body;
    const batchName = String(name || '').trim().toUpperCase();
    const ids = parseStudentIds(studentIds);

    if (!batchName) return res.status(400).json({ error: 'Batch name is required.' });
    if (!defaultPassword) return res.status(400).json({ error: 'Default password is required.' });
    if (!ids.length) return res.status(400).json({ error: 'At least one student ID is required.' });

    const batch = await Batch.findOneAndUpdate(
      { name: batchName },
      { name: batchName, defaultPassword, studentIds: ids },
      { upsert: true, new: true, runValidators: true }
    );

    const ops = ids.map((id) => ({
      updateOne: {
        filter: { user_id: id },
        update: {
          $setOnInsert: {
            user_id: id,
            roll_number: id,
            name: id,
            password: defaultPassword,
            role: 'student',
            mustChangePassword: true,
          },
          $set: { batch: batchName },
        },
        upsert: true,
      },
    }));

    if (ops.length) await User.bulkWrite(ops);

    res.status(201).json({ success: true, batch });
  } catch (err) {
    console.error('[batches] create error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/students', async (req, res) => {
  try {
    const filter = { role: 'student' };
    if (req.query.batch) filter.batch = req.query.batch;
    const students = await User.find(filter)
      .select('name user_id roll_number batch mustChangePassword')
      .sort({ batch: 1, roll_number: 1 })
      .lean();
    res.json(students);
  } catch (err) {
    console.error('[batches] students error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/students/:userId', async (req, res) => {
  try {
    const { name, password, mustChangePassword } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (password) update.password = password;
    if (mustChangePassword !== undefined) update.mustChangePassword = !!mustChangePassword;

    const student = await User.findOneAndUpdate(
      { user_id: req.params.userId, role: 'student' },
      update,
      { new: true }
    ).select('name user_id roll_number batch mustChangePassword');

    if (!student) return res.status(404).json({ error: 'Student not found.' });
    res.json({ success: true, student });
  } catch (err) {
    console.error('[batches] update student error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/password-reset-requests', async (req, res) => {
  try {
    const requests = await PasswordResetRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
    res.json(requests);
  } catch (err) {
    console.error('[batches] password reset list error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/password-reset-requests/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const update = { status };
    if (status === 'approved') update.approvedAt = new Date();

    const request = await PasswordResetRequest.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!request) return res.status(404).json({ error: 'Request not found.' });

    res.json({ success: true, request });
  } catch (err) {
    console.error('[batches] password reset update error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
