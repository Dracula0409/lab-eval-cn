import mongoose from 'mongoose';

const passwordResetRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    studentName: { type: String, default: '' },
    batch: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'completed', 'rejected'],
      default: 'pending',
    },
    approvedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

passwordResetRequestSchema.index({ userId: 1, status: 1 });

export default mongoose.model('PasswordResetRequest', passwordResetRequestSchema);
