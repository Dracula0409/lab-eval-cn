import express from 'express';
import User from '../models/User.js';
import PasswordResetRequest from '../models/PasswordResetRequest.js';

const router = express.Router();

const TEACHER_USER_ID = 'networklab';
const TEACHER_PASSWORD = 'admin@123';
const LEGACY_TEACHER_PASSWORD = 'admiin@123';

async function ensureTeacherUser() {
  const existing = await User.findOne({ user_id: TEACHER_USER_ID });
  if (existing) return existing;

  return User.create({
    name: 'Network Lab Teacher',
    user_id: TEACHER_USER_ID,
    roll_number: TEACHER_USER_ID,
    password: TEACHER_PASSWORD,
    role: 'faculty',
    mustChangePassword: false,
  });
}

router.post('/teacher-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const teacher = await ensureTeacherUser();

    const passwordMatches =
      password === teacher.password ||
      (username === TEACHER_USER_ID && password === LEGACY_TEACHER_PASSWORD);

    if (username !== TEACHER_USER_ID || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    res.json({
      success: true,
      teacher: {
        user_id: teacher.user_id,
        name: teacher.name,
        role: teacher.role,
      },
    });
  } catch (err) {
    console.error('[auth] teacher-login error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/student-login', async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) {
      return res.status(400).json({ error: 'Student ID and password are required.' });
    }

    const student = await User.findOne({
      role: 'student',
      $or: [{ user_id: userId.trim() }, { roll_number: userId.trim() }],
    });

    if (!student || student.password !== password) {
      return res.status(401).json({ error: 'Invalid student ID or password.' });
    }

    res.json({
      success: true,
      student: {
        user_id: student.user_id,
        name: student.name,
        roll_number: student.roll_number,
        batch: student.batch,
        mustChangePassword: student.mustChangePassword,
      },
    });
  } catch (err) {
    console.error('[auth] student-login error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword, resetRequestId } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'Student ID and new password are required.' });
    }
    if (String(newPassword).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    const student = await User.findOne({ user_id: userId, role: 'student' });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    let allowed = false;
    let resetRequest = null;

    if (resetRequestId) {
      resetRequest = await PasswordResetRequest.findOne({
        _id: resetRequestId,
        userId,
        status: 'approved',
      });
      allowed = !!resetRequest;
    } else {
      allowed = currentPassword === student.password;
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Password change is not permitted.' });
    }

    student.password = newPassword;
    student.mustChangePassword = false;
    await student.save();

    if (resetRequest) {
      resetRequest.status = 'completed';
      resetRequest.completedAt = new Date();
      await resetRequest.save();
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[auth] change-password error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/password-reset-request', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Student ID is required.' });

    const student = await User.findOne({
      role: 'student',
      $or: [{ user_id: userId.trim() }, { roll_number: userId.trim() }],
    });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const request = await PasswordResetRequest.findOneAndUpdate(
      { userId: student.user_id, status: { $in: ['pending', 'approved'] } },
      {
        $set: {
          userId: student.user_id,
          studentName: student.name,
          batch: student.batch || '',
        },
        $setOnInsert: { status: 'pending' },
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, request });
  } catch (err) {
    console.error('[auth] password-reset-request error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/password-reset-request/:userId', async (req, res) => {
  try {
    const request = await PasswordResetRequest.findOne({
      userId: req.params.userId,
      status: 'approved',
    }).sort({ approvedAt: -1 });

    res.json({ approved: !!request, request });
  } catch (err) {
    console.error('[auth] password-reset-request status error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
