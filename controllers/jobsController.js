// controllers/jobsController.js

import axios from 'axios';

// ─── Get relevant jobs from hh.ru ────────────────────────────────────────────
// @desc    Get relevant jobs based on report data
// @route   GET /api/jobs/relevant/:reportId
// @access  Private

export const getRelevantJobs = async (req, res) => {
  try {
    // Dynamic import for Report model
    const Report = (await import('../models/Report.js')).default;

    // Find report
    const report = await Report.findById(req.params.reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found.',
      });
    }

    // Check ownership
    if (report.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorised.',
      });
    }

    // ─── Build search query ──────────────────────────────────────────────────

    const { jobTitle, experienceLevel } = report.jobData || {};

    // Safer search query
    const topSkills =
      report.topStrengths?.slice(0, 3).join(' ') || '';

    const searchText = `${jobTitle || ''} ${topSkills}`.trim();

    // ─── Experience mapping ──────────────────────────────────────────────────

    const experienceMap = {
      entry: 'between1And3',
      junior: 'between1And3',
      mid: 'between3And6',
      senior: 'moreThan6',
      lead: 'moreThan6',
    };

    const experience =
      experienceMap[experienceLevel] || 'between3And6';

    // ─── Call hh.ru API ──────────────────────────────────────────────────────

    const response = await axios.get(
      'https://api.hh.ru/vacancies',
      {
        params: {
          text: searchText,
          experience,
          per_page: 10,
          page: 0,
          order_by: 'relevance',
        },

        headers: {
          // IMPORTANT: hh.ru requires valid User-Agent
          'User-Agent':
            'ResumeAnalyzer/1.0 (resumeanalyzer@example.com)',
        },

        timeout: 10000,
      }
    );

    const data = response.data;

    // ─── Normalize jobs ──────────────────────────────────────────────────────

    const jobs = (data.items || []).map((job) => ({
      id: job.id,

      title: job.name || 'Untitled Job',

      company:
        job.employer?.name || 'Unknown company',

      companyLogo:
        job.employer?.logo_urls?.['90'] || null,

      location:
        job.area?.name || 'Remote',

      salary: formatSalary(job.salary),

      experience:
        job.experience?.name || null,

      employment:
        job.employment?.name || null,

      schedule:
        job.schedule?.name || null,

      snippet:
        job.snippet?.responsibility ||
        job.snippet?.requirement ||
        null,

      url: job.alternate_url,

      publishedAt: job.published_at,
    }));

    // ─── Success response ────────────────────────────────────────────────────

    return res.status(200).json({
      success: true,
      total: data.found || 0,
      jobs,
      searchQuery: searchText,
    });
  } catch (error) {
    // ─── Detailed logging ────────────────────────────────────────────────────

    console.error('HH.ru Jobs Fetch Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error:
        error.response?.data?.description ||
        error.message ||
        'Failed to fetch relevant jobs.',
    });
  }
};

// ─── Helper: Format salary ───────────────────────────────────────────────────

const formatSalary = (salary) => {
  if (!salary) return null;

  const currency =
    salary.currency === 'RUR'
      ? '₽'
      : salary.currency || '';

  if (salary.from && salary.to) {
    return `${salary.from.toLocaleString()} – ${salary.to.toLocaleString()} ${currency}`;
  }

  if (salary.from) {
    return `from ${salary.from.toLocaleString()} ${currency}`;
  }

  if (salary.to) {
    return `up to ${salary.to.toLocaleString()} ${currency}`;
  }

  return null;
};