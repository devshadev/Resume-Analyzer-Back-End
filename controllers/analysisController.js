import Report from '../models/Report.js';
import { extractText } from '../utils/parser.js';
import { validateUpload } from '../utils/fileValidator.js';
import runScoringEngine from '../utils/scoringEngine.js';
import {
  analyzeResume,
  generateCoverLetter,
  humanizeCoverLetter,
} from '../utils/aiOrchestrator.js';

// @desc    Run full resume analysis
// @route   POST /api/analysis/run
// @access  Private
export const runAnalysis = async (req, res) => {
  try {
    // 1. Validate file
    const check = validateUpload(req.file);
    if (!check.ok) {
      return res.status(400).json({ success: false, error: check.error });
    }

    // 2. Parse job data from request
    let jobData;
    try {
      jobData = JSON.parse(req.body.jobData);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid job data format.',
      });
    }

    // 3. Extract text from resume
    const resumeText = await extractText(req.file.buffer, check.type);

    // 4. Run deterministic scoring engine
    const scoringResults = runScoringEngine(resumeText, jobData);

    // 5. Create initial report in DB with processing status
    const report = await Report.create({
      user: req.user._id,
      jobData,
      matchScore: scoringResults.matchScore,
      atsScore: scoringResults.atsScore,
      matchDetails: scoringResults.matchDetails,
      atsChecks: scoringResults.atsChecks,
      keywordDiff: scoringResults.keywordDiff,
      resumeMetadata: {
        fileName: req.file.originalname,
        fileType: check.type,
        charCount: resumeText.length,
      },
      status: 'processing',
    });

    // 6. Run AI calls sequentially
    // Call 1 — analysis
    const analysisResult = await analyzeResume(
      resumeText,
      jobData,
      scoringResults
    );

    // Call 2 — cover letter
    const coverLetterResult = await generateCoverLetter(
      resumeText,
      jobData,
      analysisResult
    );

    // Build plain text draft for humanizer
    const plainDraft = coverLetterResult.paragraphs
      .map((p) => p.text)
      .join('\n\n');

    // Call 3 — humanizer
    const humanizedResult = await humanizeCoverLetter(plainDraft, resumeText);

    // 7. Update report with AI results
    report.sectionFeedback = analysisResult.sectionFeedback;
    report.keywordGaps = analysisResult.keywordGaps;
    report.topStrengths = analysisResult.topStrengths;
    report.criticalIssues = analysisResult.criticalIssues;
    report.overallSummary = analysisResult.overallSummary;
    report.coverLetter = coverLetterResult;
    report.humanizedLetter = humanizedResult;
    report.status = 'completed';
    await report.save();

    // 8. Respond — never send resume text back
    res.status(200).json({
      success: true,
      reportId: report._id,
      matchScore: report.matchScore,
      atsScore: report.atsScore,
    });
  } catch (error) {
    console.error('Analysis error:', error.message);

    // If report was created, mark it as failed
    if (error.reportId) {
      await Report.findByIdAndUpdate(error.reportId, { status: 'failed' });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Analysis failed. Please try again.',
    });
  }
};

// @desc    Get all reports for current user
// @route   GET /api/analysis/reports
// @access  Private
export const getReports = async (req, res) => {
  try {
    const reports = await Report.find({ user: req.user._id })
      .select('jobData matchScore atsScore status createdAt resumeMetadata')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, reports });
  } catch (error) {
    console.error('Get reports error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch reports.' });
  }
};

// @desc    Get single report by ID
// @route   GET /api/analysis/reports/:id
// @access  Private
export const getReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found.',
      });
    }

    // Ensure user owns this report
    if (report.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorised to access this report.',
      });
    }

    res.status(200).json({ success: true, report });
  } catch (error) {
    console.error('Get report error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch report.' });
  }
};

// @desc    Delete a report
// @route   DELETE /api/analysis/reports/:id
// @access  Private
export const deleteReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found.',
      });
    }

    // Ensure user owns this report
    if (report.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorised to delete this report.',
      });
    }

    await report.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Report deleted successfully.',
    });
  } catch (error) {
    console.error('Delete report error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete report.' });
  }
};