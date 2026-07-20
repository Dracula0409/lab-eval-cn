import mongoose from "mongoose";

// a set of questions assigned together in a lab session
// aligned with LabEvaluationSystem's Test model
const ModuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    course: { type: mongoose.Types.ObjectId, ref: "Course" }, // Reference to Course model (aligned with Test.course)
    lab: { type: String }, // Keep for backward compatibility
    questions: [{ type: mongoose.Types.ObjectId, ref: "Question", required: true }],
    date: { type: Date, default: Date.now }, // Date of the module (aligned with Test.date)
    time: { type: String, default: "10:00 AM - 12:00 PM" }, // Time of the module (aligned with Test.time)
    // COMMENTED: Using string type instead of ObjectId for compatibility
    // creator: { type: mongoose.Types.ObjectId, ref: "User" }, // Reference to User (aligned with Test.createdBy)
    creator: { type: String }, // String-based creator ID for flexibility
    creatorId: { type: String }, // Keep for backward compatibility
    maxMarks: { type: Number, default: 0 }, // total marks for the module
    durationMinutes: { type: Number, default: 60 },
    targetBatch: { type: String, default: "" },
    sessionSlot: {
      type: String,
      enum: ["AN", "FN", ""],
      default: ""
    },
    moduleType: { type: String, required: true },
    metadata: { type: Object, default: {} }, // For compatibility with Test.metadata
    envSettings: {
      allowTabSwitch: { type: Boolean, default: false },
      allowExternalCopyPaste: { type: Boolean, default: false },
      allowInternalCopyPaste: { type: Boolean, default: true },
      enforceFullscreen: { type: Boolean, default: false }
    }
  },
  { timestamps: true, discriminatorKey: "moduleType" }
);

const Module = mongoose.model("Module", ModuleSchema);

const CNModuleSchema = new mongoose.Schema({}, { _id: false });
const CNModule = Module.discriminator("CNModule", CNModuleSchema);

export { Module, CNModule };

// later need to add validations and defaults
