import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.VERCEL_AI_KEY,
  baseURL: 'https://ai-gateway.vercel.sh/v1',
});

const MODEL = 'meta-llama/llama-3.3-70b-instruct';

// ─── Helper — safe JSON parse ─────────────────────────────────────────────────
const parseJSON = (text) => {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found');
    return JSON.parse(match[0]);
  } catch {
    throw new Error('AI returned invalid JSON. Please try again.');
  }
};

// ─── Helper — generate content ────────────────────────────────────────────────
const generate = async (prompt) => {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 2000,
  });
  return response.choices[0].message.content;
};

// ─── Call 1 — Resume analysis ─────────────────────────────────────────────────
export const analyzeResume = async (resumeText, jobData, scoringResults) => {
  const prompt = `You are a strict, experienced technical recruiter and resume analyst at a top tech company.

Analyze this resume against the job description exactly as a real recruiter would. Be specific, honest, and actionable.

JOB DETAILS:
- Title: ${jobData.jobTitle}
- Company: ${jobData.company}
- Experience Level: ${jobData.experienceLevel}
- Mode: ${jobData.mode === 'ats' ? 'ATS-optimized' : 'Human-optimized'}
- Required Skills: ${jobData.requiredSkills?.join(', ') || 'Not specified'}

JOB DESCRIPTION:
${jobData.jobDescription}

RESUME TEXT:
${resumeText}

PRE-COMPUTED SCORES:
- JD Match Score: ${scoringResults.matchScore}%
- ATS Score: ${scoringResults.atsScore}%
- Missing Skills: ${scoringResults.matchDetails.missingSkills?.join(', ') || 'None'}

STRICT RULES — follow these exactly:
1. keywordGaps must ONLY contain real technical skills, tools, frameworks, methodologies, or domain concepts explicitly required in the JD but genuinely absent from the resume. NEVER include common English words, adjectives, or filler words like "seeking", "talented", "responsible", "clean", "write", "join", "team", "high", "pixel", "perfect", "performant", "exceptional", "experiences", "responsibilities". If the candidate clearly has a skill but did not use the exact JD phrasing, do NOT flag it as a gap.
2. sectionFeedback scores must reflect real quality — 85+ means genuinely strong, 60-84 means adequate with room to improve, below 60 means significant gaps. Do not inflate scores.
3. criticalIssues must be real blockers that would cause a recruiter to reject or deprioritize this candidate. Not minor nitpicks.
4. topStrengths must be genuine competitive advantages this candidate has for THIS specific role.
5. overallSummary must be an honest 2-3 sentence recruiter assessment — would they shortlist this candidate and why?

Respond ONLY with a valid JSON object — no preamble, no markdown, no explanation outside the JSON.

{
  "sectionFeedback": [
    {
      "section": "Experience",
      "score": 85,
      "feedback": "specific actionable feedback based on actual resume content",
      "suggestions": ["concrete suggestion 1", "concrete suggestion 2"]
    }
  ],
  "keywordGaps": ["only real technical skills missing e.g. TypeScript, Jest, GraphQL"],
  "topStrengths": ["genuine strength 1 for this role", "genuine strength 2", "genuine strength 3"],
  "criticalIssues": ["real blocker 1 if any", "real blocker 2 if any"],
  "overallSummary": "honest 2-3 sentence recruiter assessment"
}`;

  const text = await generate(prompt);
  return parseJSON(text);
};

// ─── Call 2 — Cover letter generation ────────────────────────────────────────
export const generateCoverLetter = async (resumeText, jobData, analysisResult) => {
  const tone = jobData.mode === 'ats'
    ? 'formal and keyword-focused'
    : 'narrative and personable';

  const prompt = `You are an expert cover letter writer.

Write a tailored cover letter for this job application. For each paragraph, explain WHY you wrote it.

JOB DETAILS:
- Title: ${jobData.jobTitle}
- Company: ${jobData.company}
- Mode: ${jobData.mode === 'ats' ? 'ATS-optimized' : 'Human-optimized'}
- Tone: ${tone}

JOB DESCRIPTION:
${jobData.jobDescription}

RESUME TEXT:
${resumeText}

KEY ANALYSIS INSIGHTS:
- Top strengths: ${analysisResult.topStrengths?.join(', ')}
- Keyword gaps to address: ${analysisResult.keywordGaps?.slice(0, 5).join(', ')}

INSTRUCTIONS:
- Write 4 paragraphs
- Each paragraph must address a specific JD requirement
- Inject actual metrics and achievements from the resume
- Tone: ${tone}
- For ${jobData.mode === 'ats'
    ? 'ATS mode: use exact keywords from the JD'
    : 'Human mode: use storytelling and personality'}

Respond ONLY with a valid JSON object — no preamble, no markdown, no explanation outside the JSON.

{
  "paragraphs": [
    {
      "text": "paragraph text here",
      "reasoning": "why this paragraph was written — what JD requirement it addresses"
    }
  ],
  "subjectLine": "suggested email subject line"
}`;

  const text = await generate(prompt);
  return parseJSON(text);
};

// ─── Call 3 — Humanizer ───────────────────────────────────────────────────────
export const humanizeCoverLetter = async (coverLetterDraft, resumeText) => {
  const resumeLines = resumeText
    .split('\n')
    .filter((l) => l.trim().length > 20)
    .slice(0, 10)
    .join('\n');

  const prompt = `You are an expert editor specializing in making AI-generated text sound natural and human.

Refine this cover letter to:
1. Remove generic AI clichés ("I am excited to apply", "passionate about", "leverage my skills")
2. Vary sentence length — mix short punchy sentences with longer ones
3. Preserve the candidate's voice using phrases from their resume
4. Keep all specific metrics and achievements intact
5. Make it sound like a real person wrote it

COVER LETTER TO REFINE:
${coverLetterDraft}

CANDIDATE'S ORIGINAL VOICE (from resume):
${resumeLines}

Respond ONLY with a valid JSON object — no preamble, no markdown, no explanation outside the JSON.

{
  "refinedLetter": "the complete refined cover letter as plain text",
  "changesMade": ["change 1", "change 2", "change 3"]
}`;

  const text = await generate(prompt);
  return parseJSON(text);
};