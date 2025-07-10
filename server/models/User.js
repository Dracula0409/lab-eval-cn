import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  user_id: { type: String, required: true, unique: true },
  roll_number: { type: String, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'faculty', 'student'],
    default: 'student'
  },
  batch: { type: String },
  semester: { type: Number },
  session_token: { type: String, default: null },
  assignedCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }]
});

export default mongoose.model('User', userSchema);
