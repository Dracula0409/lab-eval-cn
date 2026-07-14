import mongoose from "mongoose";

const communicationPairSchema = new mongoose.Schema(
  {
    pairIndex: { type: Number },
    direction: { type: String },
    seen: { type: String },
    verdict: { type: String },
  },
  { _id: false }
);

const testcaseResultSchema = new mongoose.Schema(
  {
    testcase: { type: String, required: true },
    pairs: [communicationPairSchema],
    allCorrect: { type: Boolean, default: false },
  },
  { _id: false }
);

const evaluationRunSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    studentName: { type: String, default: "" },
    sessionId: { type: String, required: true },
    moduleId: { type: String },
    questionId: { type: String, required: true },
    questionKey: { type: String, default: "q1" },
    runType: {
      type: String,
      enum: ["evaluate", "submit"],
      default: "evaluate",
    },
    tagPaths: { type: Object, default: {} },
    sourceFiles: { type: Object, default: {} },
    communicationResults: [testcaseResultSchema],
    connResults: { type: mongoose.Schema.Types.Mixed },
    statusResults: { type: mongoose.Schema.Types.Mixed },
    rawCsv: { type: String },
    stdout: { type: String },
    stderr: { type: String },
    exitCode: { type: Number },
    // AN/FN lab slot this run was created in (see utils/labSlot.js), e.g. "2026-07-13_AN".
    slotKey: { type: String },
  },
  { timestamps: true, collection: "evaluation_runs" }
);

evaluationRunSchema.index({ userId: 1, sessionId: 1, questionId: 1, runType: 1 });
evaluationRunSchema.index({ questionId: 1, slotKey: 1, userId: 1 });

export default mongoose.model("EvaluationRun", evaluationRunSchema);
