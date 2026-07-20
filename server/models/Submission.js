import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  questionId: { type: String, required: true },
  sessionId: { type: String },
  moduleId: { type: String },
  // module: { type: String, required: true },
  sourceCode: { type: Object },
  language: { type: String }, // required: true ?
  passedCount: { type: Number, default: 0 },
  totalTestCases: { type: Number },
  evaluationResults: { type: [Object] },
  evalError: { type: String },
  score: { type: Number},
  isBestSubmission: { type: Boolean, default: false },
  autoSubmitted: { type: Boolean, default: false }
}, {collection: 'submissions', timestamps: true });

export default mongoose.model('Submission', submissionSchema);

// import mongoose from "mongoose";

// // Base answer schema for any question type (general)
// const baseAnswerSchema = new mongoose.Schema({
//   question: { type: mongoose.Types.ObjectId, ref: "Question", required: true },
//   marks: { type: Number, default: 0 },
//   feedback: { type: String }
// }, { _id: false, discriminatorKey: "answerType" });

// const Answer = mongoose.model("Answer", baseAnswerSchema);

// const baseSubmissionSchema = new mongoose.Schema(
//   {
//     student: { type: mongoose.Types.ObjectId, ref: "User", required: true },
//     lab: { type: mongoose.Types.ObjectId, ref: "Lab", required: true },
//     module: { type: mongoose.Types.ObjectId, ref: "Module", required: true },
//     answers: [baseAnswerSchema],
//     totalMarks: { type: Number, default: 0 },
//     submissionType: { type: String, required: true },
//     status: { 
//       type: String, 
//       enum: ['pending', 'evaluating', 'completed', 'error'], 
//       default: 'pending' 
//     },
//     attempts: { type: Number, default: 1 },
//     feedback: { type: String },
//     isBestSubmission: { type: Boolean, default: false }
//   },
//   { timestamps: true, discriminatorKey: "submissionType" }
// );

// baseSubmissionSchema.index({ student: 1, lab: 1, module: 1, isBestSubmission: 1 });

// const Submission = mongoose.model("Submission", baseSubmissionSchema);

// const CNAnswerSchema = new mongoose.Schema(
//   {
//     serverCode: { type: String },
//     clientCode: { type: String },
    
//     // Evaluation results
//     serverResults: {
//       compilationSuccess: { type: Boolean },
//       compilationOutput: { type: String },
//       executionSuccess: { type: Boolean },
//       executionOutput: { type: String },
//       testResults: [{
//         testCaseId: { type: String },
//         description: { type: String },
//         passed: { type: Boolean },
//         expected: { type: String },
//         actual: { type: String },
//         points: { type: Number, default: 0 },
//         error: { type: String }
//       }],
//       totalPoints: { type: Number, default: 0 }
//     },
    
//     clientResults: {
//       compilationSuccess: { type: Boolean },
//       compilationOutput: { type: String },
//       executionSuccess: { type: Boolean },
//       executionOutput: { type: String },
//       testResults: [{
//         testCaseId: { type: String },
//         description: { type: String },
//         passed: { type: Boolean },
//         expected: { type: String },
//         actual: { type: String },
//         points: { type: Number, default: 0 },
//         error: { type: String }
//       }],
//       totalPoints: { type: Number, default: 0 }
//     },
//   },
//   { _id: false }
// );

// const CNAnswer = Answer.discriminator("CNAnswer", CNAnswerSchema);

// const CNSubmissionSchema = new mongoose.Schema(
//   {
//     answers: [CNAnswer.schema], // override with CN-specific
//     evaluationLogs: { type: String },     
//     evaluationTimestamp: { type: Date },     // When evaluation completed
//   }
// )

// const CNSubmission = Submission.discriminator("CNSubmission", CNSubmissionSchema);

// export { Submission, CNSubmission };
