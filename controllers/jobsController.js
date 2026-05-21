import Report from '../models/Report.js';

// @desc    Get relevant jobs based on report data
// @route   GET /api/jobs/relevant/:reportId
// @access  Private
export const getRelevantJobs = async (req, res) => {
  try {
    const report = await Report.findById(req.params.reportId);

    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found.' });
    }

    if (report.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorised.' });
    }

    const { jobTitle, experienceLevel } = report.jobData;

    // Build search query from job title + experience level
    const query = `${jobTitle} ${
      experienceLevel === 'senior' || experienceLevel === 'lead' ? 'senior' : ''
    } developer`.trim();

    const params = new URLSearchParams({
      query,
      num_pages:   '1',
      country:     'us',
      date_posted: 'all',
    });

    const response = await fetch(
      `https://jsearch.p.rapidapi.com/search-v2?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key':  process.env.RAPIDAPI_KEY,
          'x-rapidapi-host': 'jsearch.p.rapidapi.com',
          'Content-Type':    'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`JSearch API returned ${response.status}`);
    }

    const data = await response.json();

    const jobs = (data.data || []).slice(0, 10).map((job) => ({
      id:             job.job_id,
      title:          job.job_title,
      company:        job.employer_name,
      companyLogo:    job.employer_logo || null,
      location:       job.job_is_remote
        ? 'Remote'
        : `${job.job_city || ''}${job.job_city && job.job_country ? ', ' : ''}${job.job_country || ''}`.trim() || 'Location not specified',
      salary:         formatSalary(job),
      employmentType: job.job_employment_type || null,
      description:    job.job_description?.slice(0, 200) + '...' || null,
      url:            job.job_apply_link || job.job_google_link,
      publishedAt:    job.job_posted_at_datetime_utc,
      via:            job.job_publisher || null,
    }));

    res.status(200).json({
      success: true,
      total:       data.data?.length || 0,
      jobs,
      searchQuery: query,
    });
  } catch (error) {
    console.error('Jobs fetch error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch relevant jobs. Please try again.',
    });
  }
};

// ─── Helper — format salary ───────────────────────────────────────────────────
const formatSalary = (job) => {
  if (!job.job_min_salary && !job.job_max_salary) return null;
  const currency = job.job_salary_currency || 'USD';
  const period = job.job_salary_period ? `/${job.job_salary_period.toLowerCase()}` : '';
  if (job.job_min_salary && job.job_max_salary) {
    return `${Number(job.job_min_salary).toLocaleString()} – ${Number(job.job_max_salary).toLocaleString()} ${currency}${period}`;
  }
  if (job.job_min_salary) return `From ${Number(job.job_min_salary).toLocaleString()} ${currency}${period}`;
  if (job.job_max_salary) return `Up to ${Number(job.job_max_salary).toLocaleString()} ${currency}${period}`;
  return null;
};