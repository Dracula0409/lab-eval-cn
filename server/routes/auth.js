import express from 'express';
import User from '../models/User.js';
import PasswordResetRequest from '../models/PasswordResetRequest.js';
import { clearAuthCookie, getUserFromRequest, requireAuth, setAuthCookie, signUserToken } from '../middleware/auth.js';

const router = express.Router();

const TEACHER_USER_ID = 'networklab';
const TEACHER_PASSWORD = 'admin@123';
const LEGACY_TEACHER_PASSWORD = 'admiin@123';

function validateStudentPassword(password) {
  if (String(password || '').length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[^A-Za-z0-9]/.test(String(password))) {
    return 'Password must include at least one special symbol.';
  }
  return null;
}

async function ensureTeacherUser() {
  const existing = await User.findOne({ user_id: TEACHER_USER_ID });
  if (existing) {
    let changed = false;
    if (!['faculty', 'admin'].includes(existing.role)) {
      existing.role = 'faculty';
      changed = true;
    }
    if (existing.name !== 'Network Lab Teacher') {
      existing.name = 'Network Lab Teacher';
      changed = true;
    }
    if (existing.mustChangePassword) {
      existing.mustChangePassword = false;
      changed = true;
    }
    if (changed) await existing.save();
    return existing;
  }

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

    setAuthCookie(res, signUserToken(teacher), 'teacher');
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

    setAuthCookie(res, signUserToken(student), 'student');
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

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      user_id: req.user.user_id,
      name: req.user.name,
      roll_number: req.user.roll_number,
      batch: req.user.batch,
      role: req.user.role,
      mustChangePassword: req.user.mustChangePassword,
    },
  });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res, req.body?.role || req.query?.role || 'all');
  res.json({ success: true });
});

router.post('/change-password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword, resetRequestId } = req.body;
    const tokenUser = await getUserFromRequest(req).catch(() => null);
    const targetUserId = tokenUser?.role === 'student' ? tokenUser.user_id : userId;

    if (!targetUserId || !newPassword) {
      return res.status(400).json({ error: 'Student ID and new password are required.' });
    }
    const passwordError = validateStudentPassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const student = await User.findOne({ user_id: targetUserId, role: 'student' });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    let allowed = false;
    let resetRequest = null;

    if (resetRequestId) {
      resetRequest = await PasswordResetRequest.findOne({
        _id: resetRequestId,
        userId: targetUserId,
        status: 'approved',
      });
      allowed = !!resetRequest;
    } else {
      if (!tokenUser || tokenUser.user_id !== student.user_id) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      allowed = student.mustChangePassword || currentPassword === student.password;
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
