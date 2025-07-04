import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Question } from '../models/Question.js';

const router = express.Router();

// Multer setup for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max file size
  fileFilter: function(req, file, cb) {
    // Accept only image files
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// POST api/questions - create a new question
router.post('/', async (req, res) => {
  try {
    const questionData = { ...req.body };
    
    // Parse JSON strings back to objects
    // ['precode', 'clientPrecode', 'solution', 'clientSolution', 'testCases'].forEach(field => {
    //   if (questionData[field]) {
    //     try {
    //       questionData[field] = JSON.parse(questionData[field]);
    //     } catch (e) {
    //       console.error(`Error parsing ${field}:`, e);
    //     }
    //   }
    // });

    // Create and save the question
    const question = new Question(questionData);
    await question.save();
    
    res.status(201).json({ 
      message: 'Question uploaded successfully', 
      question 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST api/questions/upload-image - handle image uploads from Tiptap editor
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    
    // Return the URL to the uploaded image
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ 
      success: true, 
      url: imageUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET api/questions - list all questions
router.get('/', async (req, res) => {
  try {
    const questions = await Question.find();
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE api/questions/:id - delete a question
router.delete('/:id', async (req, res) => {
  try {
    const deletedQuestion = await Question.findByIdAndDelete(req.params.id);
    if (!deletedQuestion) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json({ message: 'Question deleted successfully', question: deletedQuestion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET api/questions/:id - get a specific question
router.get('/:id', async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
