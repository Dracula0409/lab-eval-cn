import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  studentName: { type: String },
  sessionId: { type: String, required: true },
  containerName: { type: String, required: true },
  sshPort: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  activeSockets: [{ type: String }],
  activeModule: { type: mongoose.Types.ObjectId, ref: 'Module' },
  moduleAssignedAt: { type: Date },
});

sessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

export default mongoose.model('Session', sessionSchema);