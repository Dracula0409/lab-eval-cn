import express from 'express';
import { CNModule } from '../models/Module.js';
import Course from '../models/Course.js';
import LabAssignment from '../models/LabAssignment.js';
import { getCurrentSlotKey } from '../utils/labSlot.js';
import mongoose from 'mongoose';
import { protect, authorize, requireAuth } from '../middleware/auth.js';

const router = express.Router();

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getSessionAvailabilityEnd(sessionSlot, baseDate = new Date(), rollForwardIfEnded = true) {
  const now = new Date();
  const end = new Date(baseDate);
  if (sessionSlot === 'FN') {
    end.setHours(13, 0, 0, 0);
  } else if (sessionSlot === 'AN') {
    end.setHours(17, 30, 0, 0);
  } else {
    return new Date(now.getTime() + 12 * 60 * 60 * 1000);
  }

  if (rollForwardIfEnded && end <= now) {
    end.setDate(end.getDate() + 1);
  }
  return end;
}

async function expireEndedAssignments(now = new Date()) {
  await LabAssignment.updateMany(
    {
      status: 'active',
      endsAt: { $lte: now },
    },
    {
      $set: {
        status: 'ended',
        endedAt: now,
      },
    }
  );
}

// Create a module - with auth
router.post('/', requireAuth, authorize('faculty', 'admin'), async (req, res) => {
  try {
    const {
      name,
      description,
      lab,
      course,
      questions,
      creator,
      creatorId,
      maxMarks,
      date,
      time,
      durationMinutes,
      targetBatch,
      sessionSlot,
      envSettings
    } = req.body;

    // Validate that at least one question is selected.
    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'At least one question must be selected.' });
    }

    const moduleData = {
      name,
      description,
      lab, // Keep for backward compatibility
      course, // New field for integration
      questions,
      creator, // Now using string type instead of ObjectId
      creatorId, // Keep for backward compatibility 
      maxMarks,
      durationMinutes: Number(durationMinutes) || 60,
      targetBatch: targetBatch || '',
      sessionSlot: sessionSlot || '',
      date: date || new Date(),
      time: time || '10:00 AM - 12:00 PM',
      envSettings: envSettings || {
        allowTabSwitch: false,
        allowExternalCopyPaste: false,
        allowInternalCopyPaste: true,
        enforceFullscreen: false
      },
      moduleType: "CNModule"
    };

    const newModule = await CNModule.create(moduleData);
    res.status(201).json(newModule);
  } catch (err) {
    console.error('Module creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all modules - with auth protection
router.get('/', protect, async (req, res) => {
  try {
    // Support filtering by course if provided
    const { course } = req.query;
    
    const filter = course ? { course: mongoose.Types.ObjectId(course) } : {};
    
    const modules = await CNModule.find(filter)
      .populate('questions')
      .populate('course', 'name code semester');
      // Removed .populate('creator') since creator is now a string
      
    res.status(200).json(modules);
  } catch (err) {
    console.error('Error fetching modules:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/active-assignments', requireAuth, authorize('faculty', 'admin'), async (req, res) => {
  try {
    await expireEndedAssignments();
    const assignments = await LabAssignment.find({
      status: 'active',
      activeModule: { $ne: null },
      $or: [{ endsAt: null }, { endsAt: { $gt: new Date() } }],
    })
      .populate('activeModule', 'name date durationMinutes targetBatch sessionSlot maxMarks')
      .sort({ assignedAt: -1 })
      .lean();

    res.json(assignments.map((assignment) => ({
      _id: assignment._id,
      key: assignment.key,
      moduleId: assignment.activeModule?._id,
      moduleName: assignment.activeModule?.name || 'Module',
      slotKey: assignment.slotKey,
      targetBatch: assignment.targetBatch || '',
      sessionSlot: assignment.sessionSlot || '',
      durationMinutes: assignment.durationMinutes,
      assignedAt: assignment.assignedAt,
      endsAt: assignment.endsAt,
      status: assignment.status,
    })));
  } catch (err) {
    console.error('Error fetching active assignments:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a single module - with auth
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid module ID' });
    }
    
    const module = await CNModule.findById(id)
      .populate('questions')
      .populate('course', 'name code semester');
      // Removed .populate('creator') since creator is now a string
    
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    res.status(200).json(module);
  } catch (err) {
    console.error('Error fetching module:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update a module
router.put('/:id', requireAuth, authorize('faculty', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, lab, questions, maxMarks, date, durationMinutes, targetBatch, sessionSlot } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid module ID' });
    }
    
    // Validate that at least one question is selected
    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'At least one question must be selected.' });
    }
    
    const updatedModule = await CNModule.findByIdAndUpdate(
      id,
      {
        name,
        description,
        lab,
        questions,
        maxMarks,
        date: date || new Date(),
        durationMinutes: Number(durationMinutes) || 60,
        targetBatch: targetBatch || '',
        sessionSlot: sessionSlot || '',
      },
      { new: true, runValidators: true }
    );
    
    if (!updatedModule) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    res.status(200).json(updatedModule);
  } catch (err) {
    console.error('Module update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a module
router.delete('/:id', requireAuth, authorize('faculty', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid module ID' });
    }
    
    const deletedModule = await CNModule.findByIdAndDelete(id);
    
    if (!deletedModule) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    res.status(200).json({ message: 'Module deleted successfully' });
  } catch (err) {
    console.error('Module deletion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Quick update module for lab sessions
router.patch('/:id/quick-update', requireAuth, authorize('faculty', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid module ID' });
    }
    
    // Validate allowed update fields for quick updates
    const allowedUpdates = ['name', 'description', 'maxMarks'];
    const updateKeys = Object.keys(updates);
    const isValidOperation = updateKeys.every(key => allowedUpdates.includes(key));
    
    if (!isValidOperation) {
      return res.status(400).json({ error: 'Invalid updates. Only name, description, and maxMarks can be quick-updated during a lab session.' });
    }
    
    const updatedModule = await CNModule.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );
    
    if (!updatedModule) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    // In a real implementation, here you would notify active sessions
    // that are currently using this module about the changes
    
    res.status(200).json({ 
      message: 'Module updated successfully',
      module: updatedModule
    });
  } catch (err) {
    console.error('Quick module update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Simplified endpoint to assign module to test session (no session validation)
// Broadcast-assign a module to every currently active student session.
// Used by the teacher's "Send to Students" action.
// replace the whole assign-to-test-session route with:
router.post('/:moduleId/assign-to-test-session', requireAuth, authorize('faculty', 'admin'), async (req, res) => {
  try {
    await expireEndedAssignments();
    const { moduleId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(moduleId)) {
      return res.status(400).json({ error: 'Invalid module ID format' });
    }

    const module = await CNModule.findById(moduleId);
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const targetBatch = req.body.targetBatch ?? module.targetBatch ?? '';
    const sessionSlot = req.body.sessionSlot ?? module.sessionSlot ?? '';
    const durationMinutes = Number(req.body.durationMinutes ?? module.durationMinutes ?? 60) || 60;
    const assignedAt = new Date();
    const moduleDate = module.date ? new Date(module.date) : assignedAt;
    const slotKey = sessionSlot ? `${dateKey(moduleDate)}_${sessionSlot}` : getCurrentSlotKey();
    const endsAt = getSessionAvailabilityEnd(sessionSlot, moduleDate, !module.date);

    const assignmentKey = `${moduleId}_${slotKey}_${targetBatch || 'all'}`;
    await LabAssignment.findOneAndUpdate(
      { key: assignmentKey },
      {
        key: assignmentKey,
        activeModule: moduleId,
        slotKey,
        targetBatch,
        sessionSlot,
        durationMinutes,
        assignedAt,
        endsAt,
        status: 'active',
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: `Module assigned successfully for the current lab slot (${slotKey})`,
      moduleId,
      moduleName: module.name,
      slot: slotKey,
      targetBatch,
      sessionSlot,
      durationMinutes,
      endsAt,
    });
  } catch (err) {
    console.error('Error assigning module for testing:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/active-assignment/clear', requireAuth, authorize('faculty', 'admin'), async (req, res) => {
  try {
    const { assignmentId, all } = req.body || {};
    if (all) {
      await LabAssignment.updateMany(
        { status: 'active' },
        { $set: { status: 'ended' } }
      );
    } else if (assignmentId) {
      await LabAssignment.findByIdAndUpdate(assignmentId, { $set: { status: 'ended' } });
    } else {
      await LabAssignment.findOneAndUpdate({ key: 'global' }, { $set: { status: 'ended' } });
    }
    res.status(200).json({ success: true, message: 'Active module assignment cleared' });
  } catch (err) {
    console.error('Error clearing active assignment:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get questions for a specific module
router.get('/:moduleId/questions', async (req, res) => {
  try {
    const { moduleId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(moduleId)) {
      return res.status(400).json({ error: 'Invalid module ID format' });
    }
    
    // Find the module and populate its questions
    const module = await CNModule.findById(moduleId).populate('questions');
    
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    // Return just the questions array
    res.status(200).json(module.questions);
  } catch (err) {
    console.error('Error fetching module questions:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
