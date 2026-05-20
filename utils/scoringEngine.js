// scoringEngine.js — deterministic scoring, no LLM.
// Every number this produces can be explained and reproduced.

// ─── Keyword extraction ───────────────────────────────────────────────────────

const extractKeywords = (text) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#.]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3);
};

const extractPhrases = (text) => {
  const lower = text.toLowerCase();
  const phrases = [
    'machine learning', 'deep learning', 'natural language processing',
    'computer vision', 'data science', 'software engineering',
    'project management', 'product management', 'full stack',
    'front end', 'back end', 'ci/cd', 'test driven', 'agile methodology',
    'rest api', 'graphql api', 'node js', 'react js', 'next js',
    'type script', 'mongo db', 'postgre sql', 'my sql',
  ];
  return phrases.filter((phrase) => lower.includes(phrase));
};

// ─── JD match score ───────────────────────────────────────────────────────────
const calculateMatchScore = (resumeText, jobData) => {
  const resumeKeywords = new Set(extractKeywords(resumeText));
  const resumePhrases = extractPhrases(resumeText);
  const jdKeywords = extractKeywords(jobData.jobDescription);
  const jdPhrases = extractPhrases(jobData.jobDescription);

  const uniqueJdKeywords = [...new Set(jdKeywords)];
  const matchedKeywords = uniqueJdKeywords.filter(
    (kw) => resumeKeywords.has(kw)
  );
  const keywordScore = uniqueJdKeywords.length > 0
    ? matchedKeywords.length / uniqueJdKeywords.length
    : 0;

  const matchedPhrases = jdPhrases.filter((p) => resumePhrases.includes(p));
  const phraseBonus = jdPhrases.length > 0
    ? matchedPhrases.length / jdPhrases.length * 0.1
    : 0;

  const requiredSections = [
    { name: 'experience', patterns: ['experience', 'work history', 'employment'] },
    { name: 'education',  patterns: ['education', 'academic', 'degree', 'university', 'college'] },
    { name: 'skills',     patterns: ['skills', 'technologies', 'technical skills', 'competencies'] },
  ];
  const resumeLower = resumeText.toLowerCase();
  const sectionsFound = requiredSections.filter((section) =>
    section.patterns.some((p) => resumeLower.includes(p))
  );
  const sectionScore = sectionsFound.length / requiredSections.length;

  const requiredSkills = jobData.requiredSkills || [];
  const matchedSkills = requiredSkills.filter((skill) =>
    resumeLower.includes(skill.toLowerCase())
  );
  const skillScore = requiredSkills.length > 0
    ? matchedSkills.length / requiredSkills.length
    : 1;

  const raw = (
    (keywordScore + phraseBonus) * 0.60 +
    sectionScore * 0.25 +
    skillScore * 0.15
  );

  return {
    score: Math.min(Math.round(raw * 100), 100),
    details: {
      keywordScore: Math.round(keywordScore * 100),
      sectionScore: Math.round(sectionScore * 100),
      skillScore: Math.round(skillScore * 100),
      matchedKeywords: matchedKeywords.slice(0, 20),
      missingSkills: requiredSkills.filter(
        (s) => !resumeLower.includes(s.toLowerCase())
      ),
      sectionsFound: sectionsFound.map((s) => s.name),
    },
  };
};

// ─── ATS compatibility score ──────────────────────────────────────────────────
const calculateATSScore = (resumeText) => {
  const checks = [];

  const hasExperience = /experience|work history|employment/i.test(resumeText);
  checks.push({
    name: 'Standard section headers',
    passed: hasExperience,
    detail: hasExperience
      ? 'Experience section detected'
      : 'Missing standard Experience section header',
  });

  const hasEducation = /education|degree|university|college|bachelor|master/i.test(resumeText);
  checks.push({
    name: 'Education section',
    passed: hasEducation,
    detail: hasEducation
      ? 'Education section detected'
      : 'Missing Education section',
  });

  const hasSkills = /skills|technologies|competencies/i.test(resumeText);
  checks.push({
    name: 'Skills section',
    passed: hasSkills,
    detail: hasSkills
      ? 'Skills section detected'
      : 'Missing Skills section — ATS systems scan for this',
  });

  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(resumeText);
  checks.push({
    name: 'Contact information',
    passed: hasEmail,
    detail: hasEmail
      ? 'Email address detected'
      : 'No email address found — ensure contact info is parseable',
  });

  const lines = resumeText.split('\n').filter((l) => l.trim().length > 0);
  const avgLineLength = lines.reduce((sum, l) => sum + l.length, 0) / (lines.length || 1);
  const likelyNoTables = avgLineLength < 120;
  checks.push({
    name: 'No tables or columns',
    passed: likelyNoTables,
    detail: likelyNoTables
      ? 'No multi-column layout detected'
      : 'Possible table or multi-column layout — ATS parsers struggle with these',
  });

  const wordCount = resumeText.split(/\s+/).length;
  const goodLength = wordCount >= 200 && wordCount <= 1200;
  checks.push({
    name: 'Resume length',
    passed: goodLength,
    detail: goodLength
      ? `Good length (${wordCount} words)`
      : wordCount < 200
        ? `Too short (${wordCount} words) — add more detail`
        : `Very long (${wordCount} words) — consider trimming`,
  });

  const hasDates = /20\d{2}|19\d{2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(resumeText);
  checks.push({
    name: 'Employment dates',
    passed: hasDates,
    detail: hasDates
      ? 'Employment dates detected'
      : 'No dates found — ATS systems expect date ranges for each role',
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  return { score, checks };
};

// ─── Keyword diff ─────────────────────────────────────────────────────────────
const calculateKeywordDiff = (resumeText, jobData) => {
  const resumeLower = resumeText.toLowerCase();
  const jdKeywords = extractKeywords(jobData.jobDescription);
  const uniqueJdKeywords = [...new Set(jdKeywords)].filter((kw) => kw.length >= 4);

  // Comprehensive stop words — filler words, adjectives, verbs that are never resume skills
  const stopWords = new Set([
    // Common English filler
    'with', 'this', 'that', 'from', 'have', 'will', 'your', 'they',
    'their', 'what', 'when', 'where', 'which', 'while', 'about',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'each', 'more', 'most', 'other', 'some', 'such',
    'than', 'then', 'there', 'these', 'those', 'able', 'also',
    'been', 'being', 'both', 'come', 'does', 'doing', 'done',
    'down', 'even', 'ever', 'here', 'just', 'like', 'make',
    'many', 'much', 'need', 'only', 'over', 'same', 'should',
    'since', 'take', 'them', 'time', 'under', 'upon', 'used',
    'very', 'well', 'were', 'whom', 'whose', 'within', 'would',
    // JD filler words — never valid resume keywords
    'seeking', 'talented', 'join', 'responsible', 'exceptional',
    'experiences', 'responsibilities', 'performant', 'pixel', 'perfect',
    'write', 'clean', 'team', 'dynamic', 'growing', 'looking', 'ability',
    'strong', 'excellent', 'good', 'great', 'best', 'must', 'required',
    'preferred', 'plus', 'bonus', 'nice', 'work', 'working', 'works',
    'fast', 'quickly', 'help', 'hands', 'real', 'world', 'across',
    'around', 'toward', 'including', 'related', 'relevant', 'multiple',
    'various', 'different', 'similar', 'using', 'based', 'building',
    'maintaining', 'writing', 'creating', 'developing', 'implementing',
    'ensuring', 'providing', 'managing', 'leading', 'collaborating',
    'communicating', 'delivering', 'high', 'large', 'scale', 'level',
    'years', 'year', 'experience', 'understanding', 'knowledge',
    'familiarity', 'proficiency', 'ability', 'skills', 'skill',
    'applications', 'application', 'following', 'including', 'such',
    'well', 'also', 'both', 'either', 'neither', 'every', 'each',
    'another', 'others', 'something', 'anything', 'nothing', 'everything',
  ]);

  // Only keep meaningful technical terms
  const meaningful = uniqueJdKeywords.filter((kw) =>
    !stopWords.has(kw) &&
    kw.length >= 4 &&
    !/[.,!?;:]$/.test(kw) // exclude words with trailing punctuation
  );

  const present = meaningful.filter((kw) => resumeLower.includes(kw));
  const missing = meaningful.filter((kw) => !resumeLower.includes(kw));

  return {
    present: present.slice(0, 15),
    missing: missing.slice(0, 15),
  };
};

// ─── Main export ──────────────────────────────────────────────────────────────
const runScoringEngine = (resumeText, jobData) => {
  const matchResult = calculateMatchScore(resumeText, jobData);
  const atsResult = calculateATSScore(resumeText);
  const keywordDiff = calculateKeywordDiff(resumeText, jobData);

  return {
    matchScore: matchResult.score,
    matchDetails: matchResult.details,
    atsScore: atsResult.score,
    atsChecks: atsResult.checks,
    keywordDiff,
  };
};

export default runScoringEngine;