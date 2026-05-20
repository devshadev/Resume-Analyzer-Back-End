import mongoose from 'mongoose';

const sectionFeedbackSchema = new mongoose.Schema({
  section: String,
  score: Number,
  feedback: String,
  suggestions: [String],
}, { _id: false });

const atsCheckSchema = new mongoose.Schema({
  name: String,
  passed: Boolean,
  detail: String,
}, { _id: false });

const coverLetterParagraphSchema = new mongoose.Schema({
  text: String,
  reasoning: String,
}, { _id: false });

const reportSchema = new mongoose.Schema(
  {
    // Owner
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Job details
    jobData: {
      jobTitle:        { type: String, required: true },
      company:         { type: String, required: true },
      jobDescription:  { type: String, required: true },
      experienceLevel: { type: String },
      requiredSkills:  [String],
      mode:            { type: String, enum: ['ats', 'human'], default: 'ats' },
    },

    // Scores
    matchScore: { type: Number, required: true },
    atsScore:   { type: Number, required: true },

    // Scoring details
    matchDetails: {
      keywordScore:    Number,
      sectionScore:    Number,
      skillScore:      Number,
      matchedKeywords: [String],
      missingSkills:   [String],
      sectionsFound:   [String],
    },

    // ATS checks
    atsChecks: [atsCheckSchema],

    // Keyword diff
    keywordDiff: {
      present: [String],
      missing: [String],
    },

    // AI analysis — Call 1
    sectionFeedback: [sectionFeedbackSchema],
    keywordGaps:     [String],
    topStrengths:    [String],
    criticalIssues:  [String],
    overallSummary:  String,

    // Cover letter — Call 2
    coverLetter: {
      paragraphs:  [coverLetterParagraphSchema],
      subjectLine: String,
    },

    // Humanized cover letter — Call 3
    humanizedLetter: {
      refinedLetter: String,
      changesMade:   [String],
    },

    // Status
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },

    // Resume metadata — never store the actual text
    resumeMetadata: {
      fileName:  String,
      fileType:  String,
      charCount: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast user report lookups
reportSchema.index({ user: 1, createdAt: -1 });

const Report = mongoose.model('Report', reportSchema);
export default Report;