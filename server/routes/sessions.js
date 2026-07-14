import express from 'express';
import mongoose from 'mongoose';
import Session from '../models/Session.js';
import { CNModule } from '../models/Module.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import LabAssignment from '../models/LabAssignment.js';
import { protect, authorize } from '../middleware/auth.js';
import { ensureSessionContainer } from '../controllers/sshController.js';
import EvaluationRun from '../models/EvaluationRun.js';
import TestAttempt from '../models/TestAttempt.js';

const router = express.Router();

// Student self-service login: spin up (or reuse) the container for this
// userId and record the studentName, no password required for now.
router.post('/init', async (req, res) => {
  try {
    const { userId, studentName } = req.body;

    if (!userId || !studentName) {
      return res.status(400).json({ error: 'userId and studentName are required' });
    }

    const { sessionId, containerName, sshPort } = await ensureSessionContainer(userId);

    // Persist the student's display name against the session record.
    await Session.updateOne(
      { userId, sessionId },
      { $set: { studentName } }
    );

    res.status(200).json({
      success: true,
      sessionId,
      containerName,
      sshPort,
      userId,
      studentName,
    });
  } catch (err) {
    console.error('[API] /sessions/init error:', err);
    res.status(500).json({ error: err.message || 'Failed to start lab session' });
  }
});

router.get('/student-dashboard/:userId', async (req, res) => {
  try {
    const student = await User.findOne({
      role: 'student',
      $or: [{ user_id: req.params.userId }, { roll_number: req.params.userId }],
    }).select('name user_id roll_number batch mustChangePassword').lean();

    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const now = new Date();
    const assignment = await LabAssignment.findOne({ key: 'global' }).populate({
      path: 'activeModule',
      populate: { path: 'questions', model: 'Question' },
    }).lean();

    const existingAttempt = assignment?.activeModule
      ? await TestAttempt.findOne({
          userId: student.user_id,
          moduleId: assignment.activeModule._id.toString(),
          slotKey: assignment.slotKey,
          status: 'active',
          endsAt: { $gt: now },
        }).lean()
      : null;

    const assignmentStillAvailable = !assignment?.endsAt || new Date(assignment.endsAt) > now;

    const isActive =
      assignment?.activeModule &&
      assignment.status === 'active' &&
      (assignmentStillAvailable || !!existingAttempt) &&
      (!assignment.targetBatch || assignment.targetBatch === student.batch);

    const runs = await EvaluationRun.aggregate([
      { $match: { userId: student.user_id, runType: 'submit' } },
      {
        $group: {
          _id: { moduleId: '$moduleId', sessionId: '$sessionId', slotKey: '$slotKey' },
          lastSubmittedAt: { $max: '$createdAt' },
          questionCount: { $addToSet: '$questionId' },
        },
      },
      { $sort: { lastSubmittedAt: -1 } },
      { $limit: 20 },
    ]);

    const moduleIds = runs.map((r) => r._id.moduleId).filter(Boolean);
    const modules = await CNModule.find({ _id: { $in: moduleIds } }).select('name targetBatch sessionSlot durationMinutes').lean();
    const moduleById = new Map(modules.map((m) => [m._id.toString(), m]));

    res.json({
      student,
      activeSessions: isActive
        ? [{
            module: assignment.activeModule,
            slotKey: assignment.slotKey,
            assignedAt: assignment.assignedAt,
            endsAt: assignment.endsAt,
            targetBatch: assignment.targetBatch,
            sessionSlot: assignment.sessionSlot,
            durationMinutes: assignment.durationMinutes,
          }]
        : [],
      previousTests: runs.map((r) => ({
        moduleId: r._id.moduleId,
        moduleName: moduleById.get(r._id.moduleId)?.name || 'CN Lab',
        sessionId: r._id.sessionId,
        slotKey: r._id.slotKey,
        questionCount: r.questionCount.length,
        lastSubmittedAt: r.lastSubmittedAt,
      })),
    });
  } catch (err) {
    console.error('[sessions] student-dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/test-attempts/start', async (req, res) => {
  try {
    const { userId, moduleId, sessionId } = req.body;
    if (!userId || !moduleId) {
      return res.status(400).json({ error: 'userId and moduleId are required.' });
    }

    const student = await User.findOne({ user_id: userId, role: 'student' }).lean();
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const assignment = await LabAssignment.findOne({
      key: 'global',
      activeModule: moduleId,
      status: 'active',
    }).populate('activeModule').lean();

    if (!assignment || !assignment.activeModule) {
      return res.status(404).json({ error: 'No active assignment found for this module.' });
    }
    if (assignment.targetBatch && assignment.targetBatch !== student.batch) {
      return res.status(403).json({ error: 'This module is not assigned to your batch.' });
    }
    const existingAttempt = await TestAttempt.findOne({
      userId: student.user_id,
      moduleId,
      slotKey: assignment.slotKey,
      status: 'active',
      endsAt: { $gt: new Date() },
    });

    if (assignment.endsAt && new Date(assignment.endsAt) <= new Date() && !existingAttempt) {
      return res.status(410).json({ error: 'This lab session is no longer available.' });
    }

    const startedAt = new Date();
    const baseEndsAt = new Date(startedAt.getTime() + (assignment.durationMinutes || 60) * 60 * 1000);

    const attempt = await TestAttempt.findOneAndUpdate(
      { userId: student.user_id, moduleId, slotKey: assignment.slotKey },
      {
        $setOnInsert: {
          userId: student.user_id,
          studentName: student.name,
          batch: student.batch || '',
          moduleId,
          slotKey: assignment.slotKey,
          sessionId: sessionId || '',
          startedAt,
          baseEndsAt,
          endsAt: baseEndsAt,
          status: 'active',
        },
      },
      { upsert: true, new: true }
    );

    if (attempt.endsAt <= new Date() && attempt.status === 'active') {
      attempt.status = 'expired';
      await attempt.save();
    }

    res.json({
      attempt,
      remainingSeconds: Math.max(0, Math.floor((attempt.endsAt.getTime() - Date.now()) / 1000)),
    });
  } catch (err) {
    console.error('[sessions] start test attempt error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/test-attempts', async (req, res) => {
  try {
    const { moduleId, slotKey, batch } = req.query;
    const filter = {};
    if (moduleId) filter.moduleId = moduleId;
    if (slotKey) filter.slotKey = slotKey;
    if (batch) filter.batch = batch;

    const attempts = await TestAttempt.find(filter).sort({ batch: 1, userId: 1 }).lean();
    res.json(attempts);
  } catch (err) {
    console.error('[sessions] list test attempts error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/test-attempts/extend', async (req, res) => {
  try {
    const { moduleId, slotKey, batch, userIds, extraMinutes } = req.body;
    const minutes = Number(extraMinutes);
    if (!moduleId || !slotKey || !Number.isFinite(minutes) || minutes <= 0) {
      return res.status(400).json({ error: 'moduleId, slotKey, and positive extraMinutes are required.' });
    }

    const filter = { moduleId, slotKey };
    const ids = Array.isArray(userIds)
      ? userIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (ids.length) filter.userId = { $in: ids };
    if (!ids.length && batch) filter.batch = batch;

    const attempts = await TestAttempt.find(filter);
    for (const attempt of attempts) {
      attempt.extraMinutes = (attempt.extraMinutes || 0) + minutes;
      attempt.endsAt = new Date(attempt.endsAt.getTime() + minutes * 60 * 1000);
      if (attempt.status === 'expired' && attempt.endsAt > new Date()) {
        attempt.status = 'active';
      }
      await attempt.save();
    }

    res.json({ success: true, updatedCount: attempts.length });
  } catch (err) {
    console.error('[sessions] extend attempts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all active sessions
router.get('/active', async (req, res) => {
  try {
    // Find sessions created within the last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const sessions = await Session.aggregate([
      { $match: { createdAt: { $gte: oneDayAgo } } },
      { $group: {
          _id: "$sessionId",
          name: { $first: "$sessionId" },
          createdAt: { $first: "$createdAt" },
          studentCount: { $sum: 1 }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);
    
    res.status(200).json(sessions);
  } catch (err) {
    console.error('Error fetching active sessions:', err);
    res.status(500).json({ error: err.message });
  }
});

// Assign a module to a session - compatible with LabEvaluationSystem's auth
router.post('/:sessionId/assign-module', protect, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { moduleId } = req.body;
    
    if (!moduleId) {
      return res.status(400).json({ error: 'Module ID is required' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(moduleId)) {
      return res.status(400).json({ error: 'Invalid module ID format' });
    }
    
    // Check if the module exists
    const module = await CNModule.findById(moduleId)
      .populate('questions');
      
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    // Check if the session exists
    const sessions = await Session.find({ sessionId });
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Update all sessions with this sessionId to have the active module
    const updateResult = await Session.updateMany(
      { sessionId },
      { 
        $set: { 
          activeModule: moduleId,
          moduleAssignedAt: new Date() 
        } 
      }
    );
    
    // Return success with update information
    res.status(200).json({ 
      success: true,
      message: 'Module assigned successfully',
      sessionId,
      moduleId,
      moduleName: module.name,
      studentCount: sessions.length
    });
  } catch (err) {
    console.error('Error assigning module to session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Quick update module and propagate to active sessions - with auth
router.patch('/modules/:id/quick-update', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid module ID format' });
    }
    
    // If user info is available, log who made the change
    if (req.user) {
      console.log(`Module ${id} quick-updated by user ${req.user.name} (${req.user.user_id})`);
    }
    
    // Validate allowed update fields
    const allowedUpdates = ['name', 'description', 'maxMarks'];
    const updateKeys = Object.keys(updates);
    const isValidOperation = updateKeys.every(key => allowedUpdates.includes(key));
    
    if (!isValidOperation) {
      return res.status(400).json({ error: 'Invalid updates. Only name, description, and maxMarks can be quick-updated.' });
    }
    
    // Update the module
    const updatedModule = await CNModule.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );
    
    if (!updatedModule) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    // In a real implementation, here you would:
    // 1. Find all active sessions using this module
    // 2. Push updates to connected students
    
    /* Example implementation:
    const sessionsWithModule = await Session.find({ activeModule: id });
    // Push updates to these sessions
    */
    
    res.status(200).json({ 
      message: 'Module updated and changes propagated',
      module: updatedModule
    });
  } catch (err) {
    console.error('Error quick-updating module:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get the currently assigned module (global, slot-aware — see labSlot.js).
// :sessionId is accepted for URL/back-compat but no longer used to look up
// the assignment, since it's now a single global record rather than
// per-session.
router.get('/:sessionId/current-module', async (req, res) => {
  try {
    const { userId } = req.query;
    const assignment = await LabAssignment.findOne({ key: 'global' }).populate({
      path: 'activeModule',
      populate: {
        path: 'questions',
        model: 'Question'
      }
    });

    if (!assignment || !assignment.activeModule) {
      return res.status(404).json({ error: 'No module is currently assigned' });
    }

    if (assignment.status !== 'active') {
      return res.status(404).json({ error: 'No module is currently active' });
    }

    if (assignment.endsAt && new Date(assignment.endsAt) <= new Date()) {
      const existingAttempt = userId
        ? await TestAttempt.findOne({
            userId,
            moduleId: assignment.activeModule._id.toString(),
            slotKey: assignment.slotKey,
            status: 'active',
            endsAt: { $gt: new Date() },
          }).lean()
        : null;
      if (existingAttempt) {
        const response = assignment.activeModule.toObject();
        response.assignment = {
          slotKey: assignment.slotKey,
          targetBatch: assignment.targetBatch,
          sessionSlot: assignment.sessionSlot,
          durationMinutes: assignment.durationMinutes,
          assignedAt: assignment.assignedAt,
          endsAt: assignment.endsAt,
        };
        return res.status(200).json(response);
      }
      return res.status(404).json({ error: 'The assigned module session has ended' });
    }

    if (assignment.targetBatch && userId) {
      const student = await User.findOne({ user_id: userId, role: 'student' }).lean();
      if (!student || student.batch !== assignment.targetBatch) {
        return res.status(404).json({ error: 'No module is currently assigned for your batch' });
      }
    }

    const response = assignment.activeModule.toObject();
    response.assignment = {
      slotKey: assignment.slotKey,
      targetBatch: assignment.targetBatch,
      sessionSlot: assignment.sessionSlot,
      durationMinutes: assignment.durationMinutes,
      assignedAt: assignment.assignedAt,
      endsAt: assignment.endsAt,
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('Error fetching current module:', err);
    res.status(500).json({ error: err.message });
  }
});

// Check if the globally-assigned module has changed (or expired out of the
// current slot) since the client last loaded it.
router.get('/:sessionId/check-module-update', async (req, res) => {
  try {
    const { currentModuleId } = req.query;

    if (!currentModuleId) {
      return res.status(400).json({ error: 'Current module ID is required' });
    }

    const assignment = await LabAssignment.findOne({ key: 'global' });
    const isActive = !!assignment &&
      assignment.status === 'active' &&
      (!assignment.endsAt || new Date(assignment.endsAt) > new Date());
    const activeModuleId = isActive && assignment.activeModule
      ? assignment.activeModule.toString()
      : null;
    const hasUpdate = activeModuleId !== currentModuleId;

    res.status(200).json({
      hasUpdate,
      currentModuleId: activeModuleId
    });
  } catch (err) {
    console.error('Error checking for module update:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
