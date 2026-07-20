import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    tag: { type: String, required: true },
    precode: { type: String, default: "" },
  },
  { _id: false }
);

const baseQuestionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    course: { type: mongoose.Types.ObjectId, ref: "Course" },
    lab: { type: String },
    tags: [{ type: String }],
    maxMarks: { type: Number, default: 15 },
    moduleType: { type: String, required: true },
    createdBy: { type: mongoose.Types.ObjectId, ref: "User" },
    creatorId: { type: String },
    details: { type: Object, default: {} },
  },
  { timestamps: true, discriminatorKey: "moduleType" }
);

const Question = mongoose.model("Question", baseQuestionSchema);

const CNQuestionSchema = new mongoose.Schema(
  {
    questionKey: { type: String, default: "q1" },
    files: [fileSchema],
    testcases: { type: mongoose.Schema.Types.Mixed, required: true },
    input: { type: String, default: "" },
    evalScript: { type: String, required: true },
  },
  { _id: false }
);

const CNQuestion = Question.discriminator("CNQuestion", CNQuestionSchema);

export { Question, CNQuestion };
