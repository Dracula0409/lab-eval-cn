import mongoose from 'mongoose';

const sessionDisconnectRequestSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  studentName: { type: String, default: '' },
  batch: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('SessionDisconnectRequest', sessionDisconnectRequestSchema);
