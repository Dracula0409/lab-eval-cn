import mongoose from 'mongoose';

// Singleton document holding whichever module is currently "live" for
// students. Kept separate from the per-student Session model so the
// assignment survives students logging out/in (each login gets a brand new
// random sessionId, which would otherwise lose any per-session assignment).
const labAssignmentSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    activeModule: { type: mongoose.Types.ObjectId, ref: 'Module', default: null },
    slotKey: { type: String, default: null }, // e.g. "2026-07-10_AN"
    targetBatch: { type: String, default: '' },
    sessionSlot: { type: String, default: '' },
    durationMinutes: { type: Number, default: 60 },
    assignedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['inactive', 'active', 'ended'],
      default: 'inactive',
    },
  },
  { timestamps: true }
);

export default mongoose.model('LabAssignment', labAssignmentSchema);
