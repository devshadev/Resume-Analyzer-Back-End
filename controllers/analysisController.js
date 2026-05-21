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
  let report = null;

  try {
    // 1. Validate file
    const check = validateUpload(req.file);
    if (!check.ok) {
      return res.status(400).json({ success: false, error: check.error });
    }

    // 2. Parse job data
    let jobData;
    try {
      jobData = JSON.parse(req.body.jobData);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid job data format.',
      });
    }

    // 3. Validate job data fields
    if (!jobData.jobTitle || !jobData.company || !jobData.jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'Job title, company, and job description are required.',
      });
    }

    // 4. Extract text from resume
    let resumeText;
    try {
      resumeText = await extractText(req.file.buffer, check.type);
    } catch (err) {
      return res.status(422).json({
        success: false,
        error: err.message || 'Could not extract text from the file. Is it a scanned image?',
      });
    }

    // 5. Run deterministic scoring engine
    const scoringResults = runScoringEngine(resumeText, jobData);

    // 6. Create report in DB with processing status
    report = await Report.create({
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

    // 7. AI Call 1 — analysis
    let analysisResult;
    try {
      analysisResult = await analyzeResume(resumeText, jobData, scoringResults);
    } catch (err) {
      await report.updateOne({
        status: 'failed',
        failureReason: `AI analysis failed: ${err.message}`,
      });
      return res.status(502).json({
        success: false,
        error: 'AI analysis failed. The scoring results were saved. Please try again.',
        reportId: report._id,
        partialData: {
          matchScore: scoringResults.matchScore,
          atsScore: scoringResults.atsScore,
        },
      });
    }

    // 8. AI Call 2 — cover letter
    let coverLetterResult;
    try {
      const plainDraft = '';
      coverLetterResult = await generateCoverLetter(resumeText, jobData, analysisResult);
    } catch (err) {
      // Save what we have so far — analysis succeeded, cover letter failed
      await report.updateOne({
        sectionFeedback: analysisResult.sectionFeedback,
        keywordGaps: analysisResult.keywordGaps,
        topStrengths: analysisResult.topStrengths,
        criticalIssues: analysisResult.criticalIssues,
        overallSummary: analysisResult.overallSummary,
        status: 'partial',
        failureReason: `Cover letter generation failed: ${err.message}`,
      });
      return res.status(200).json({
        success: true,
        reportId: report._id,
        matchScore: report.matchScore,
        atsScore: report.atsScore,
        warning: 'Analysis completed but cover letter generation failed. You can view your report.',
      });
    }

    // 9. AI Call 3 — humanizer
    const plainDraft = coverLetterResult.paragraphs
      ?.map((p) => p.text)
      .join('\n\n') || '';

    let humanizedResult;
    try {
      humanizedResult = await humanizeCoverLetter(plainDraft, resumeText);
    } catch {
      // Humanizer failed — use the raw cover letter, not a blocker
      humanizedResult = {
        refinedLetter: plainDraft,
        changesMade: ['Humanizer unavailable — showing original draft'],
      };
    }

    // 10. Save completed report
    await report.updateOne({
      sectionFeedback: analysisResult.sectionFeedback,
      keywordGaps: analysisResult.keywordGaps,
      topStrengths: analysisResult.topStrengths,
      criticalIssues: analysisResult.criticalIssues,
      overallSummary: analysisResult.overallSummary,
      coverLetter: coverLetterResult,
      humanizedLetter: humanizedResult,
      status: 'completed',
    });

    console.log(`Analysis completed for user ${req.user._id} — report ${report._id}`);

    res.status(200).json({
      success: true,
      reportId: report._id,
      matchScore: report.matchScore,
      atsScore: report.atsScore,
    });

  } catch (error) {
    console.error('Analysis error:', error.message);

    // Mark report as failed if it was created
    if (report?._id) {
      await Report.findByIdAndUpdate(report._id, {
        status: 'failed',
        failureReason: error.message,
      }).catch(() => {}); // silent — don't throw during error handling
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