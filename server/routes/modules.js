import express from 'express';
import { CNModule } from '../models/Module.js';
import Course from '../models/Course.js';
// Removing User import since we're not using ObjectId reference anymore
// import User from '../models/User.js';
import mongoose from 'mongoose';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Create a module - with auth
router.post('/', protect, async (req, res) => {
  try {
    const { name, description, lab, course, questions, creator, creatorId, maxMarks, date, time, envSettings } = req.body;

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
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, lab, questions, maxMarks } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid module ID' });
    }
    
    // Validate that at least one question is selected
    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'At least one question must be selected.' });
    }
    
    const updatedModule = await CNModule.findByIdAndUpdate(
      id,
      { name, description, lab, questions, maxMarks },
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
router.delete('/:id', async (req, res) => {
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
router.patch('/:id/quick-update', async (req, res) => {
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
router.post('/:moduleId/assign-to-test-session', async (req, res) => {
  try {
    const { moduleId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(moduleId)) {
      return res.status(400).json({ error: 'Invalid module ID format' });
    }
    
    // Check if the module exists
    const module = await CNModule.findById(moduleId);
      
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    // For testing purposes, we'll just return success without actually updating any session
    // In a real implementation, this would update session records in the database
    
    // Return success
    res.status(200).json({ 
      success: true,
      message: 'Module assigned successfully for testing',
      moduleId,
      moduleName: module.name
    });
  } catch (err) {
    console.error('Error assigning module for testing:', err);
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