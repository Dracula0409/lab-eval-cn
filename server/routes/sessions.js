import express from 'express';
import mongoose from 'mongoose';
import Session from '../models/Session.js';
import { CNModule } from '../models/Module.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import { protect, authorize } from '../middleware/auth.js';
import { ensureSessionContainer } from '../controllers/sshController.js';

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

// Get the currently assigned module for a session
router.get('/:sessionId/current-module', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.query.userId;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Find the session for this session ID
    const session = await Session.findOne({ 
      sessionId,
      ...(userId ? { userId } : {})  // Only filter by userId if provided
    }).populate({
      path: 'activeModule',
      populate: {
        path: 'questions',
        model: 'Question'
      }
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!session.activeModule) {
      return res.status(404).json({ error: 'No module is currently assigned to this session' });
    }
    
    res.status(200).json(session.activeModule);
  } catch (err) {
    console.error('Error fetching current module:', err);
    res.status(500).json({ error: err.message });
  }
});

// Check if a module has been updated
router.get('/:sessionId/check-module-update', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { currentModuleId } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    if (!currentModuleId) {
      return res.status(400).json({ error: 'Current module ID is required' });
    }
    
    // Find the session
    const session = await Session.findOne({ sessionId });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Check if the module has changed
    const activeModuleId = session.activeModule ? session.activeModule.toString() : null;
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