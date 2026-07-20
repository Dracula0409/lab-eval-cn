import mongoose from 'mongoose';

const testAttemptSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    studentName: { type: String, default: '' },
    batch: { type: String, default: '' },
    moduleId: { type: String, required: true },
    slotKey: { type: String, required: true },
    sessionId: { type: String, default: '' },
    startedAt: { type: Date, required: true },
    baseEndsAt: { type: Date, required: true },
    extraMinutes: { type: Number, default: 0 },
    endsAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['active', 'completed', 'expired'],
      default: 'active',
    },
  },
  { timestamps: true }
);

testAttemptSchema.index({ userId: 1, moduleId: 1, slotKey: 1 }, { unique: true });
testAttemptSchema.index({ moduleId: 1, slotKey: 1, batch: 1 });

export default mongoose.model('TestAttempt', testAttemptSchema);
