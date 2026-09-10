import type { Gap, Question, Role, Segment, StyleProfile, TokenSegment } from '@/types';
import { segmentsToText } from '@/lib/segments';

export interface Prompt {
  system: string;
  user: string;
}

const VERBOSITY_LENGTH: Record<StyleProfile['verbosity'], string> = {
  terse: '2-3 sentences',
  standard: '4-5 sentences',
  expansive: '6-8 sentences',
};

/* ================================================================== *
 * 6.1 Resume parse
 * ================================================================== */

export const RESUME_PARSE_SYSTEM = `You extract structured data from resumes. You return only valid JSON
matching the requested schema. You do not infer, embellish, or add
information that is not present in the text. If a field is absent,
return an empty string or empty array. Never invent employers, titles,
dates, or credentials.`;

export function resumeParsePrompt(rawText: string): Prompt {
  return {
    system: RESUME_PARSE_SYSTEM,
    user: `Extract the structured content of this resume.

Return JSON:
{
  "roles": [
    {
      "employer": string,
      "title": string,
      "startDate": string,   // as written, e.g. "March 2021" or "2021"
      "endDate": string,     // as written, or "" if current
      "bullets": string[],   // verbatim from the resume, do not rewrite
      "location": string     // "" if absent
    }
  ],
  "education": string[],     // one line each, verbatim
  "skills": string[]         // individual skills, split from any list
}

Order roles most recent first. Include every role, even brief ones.

RESUME:
<<<
${rawText}
>>>`,
  };
}

/* ================================================================== *
 * 6.2 Question generation
 * ================================================================== */

export const QUESTION_GEN_SYSTEM = `You are an experienced technical recruiter. You generate the questions
that would actually be asked in a screening or hiring-manager interview
for a specific role, given a specific candidate's background. You return
only valid JSON.`;

function formatRoles(roles: Role[]): string {
  return roles
    .map((r) => {
      const dates = `${r.startDate || '?'} to ${r.endDate ?? 'present'}`;
      const kept = r.bullets.filter((b) => b.trim());
      const bullets = kept.length
        ? kept.map((b) => `    - ${b}`).join('\n')
        : '    - (no bullets on the resume)';
      return `${r.id} | ${r.employer} | ${r.title} | ${dates}\n${bullets}`;
    })
    .join('\n\n');
}

function formatGaps(gaps: Gap[], roles: Role[]): string {
  if (!gaps.length) return 'None';
  const byId = new Map(roles.map((r) => [r.id, r]));
  return gaps
    .map((g) => {
      const after = byId.get(g.afterRoleId);
      const before = g.beforeRoleId ? byId.get(g.beforeRoleId) : null;
      const tail = before ? `before ${before.employer} (${before.title})` : 'before the earliest listed role';
      return `- ${g.months} months after ${after?.employer ?? 'a role'} (${after?.title ?? ''}), ${tail}`;
    })
    .join('\n');
}

export function questionGenPrompt(args: {
  n: number;
  roles: Role[];
  jobDescription?: string;
  gaps: Gap[];
}): Prompt {
  const { n, roles, jobDescription, gaps } = args;
  return {
    system: QUESTION_GEN_SYSTEM,
    user: `Generate ${n} interview questions for this candidate and role.

CANDIDATE ROLES:
${formatRoles(roles)}

JOB DESCRIPTION:
${
  jobDescription?.trim()
    ? jobDescription.trim()
    : `None provided. Generate questions appropriate to the
candidate's most recent role and seniority.`
}

EMPLOYMENT GAPS DETECTED:
${formatGaps(gaps, roles)}

Requirements:
- Include these universal questions, phrased naturally: tell me about
  yourself; a mistake you made; a weakness; handling competing priorities;
  a project you're proud of; why this company; what you're looking for next.
- Add behavioral questions mapped to competencies stated in the job
  description. Quote the competency in the "competency" field.
- Add role-specific probes about tools, domain, or stated concerns in the
  job description. If the description says something like "resolves
  blockers without becoming one," generate a question targeting that.
- If a gap or a seniority mismatch exists, add one situational question.
  Phrase it as a recruiter would, neutrally, not as an accusation.
- For each question, assign the ONE role from the candidate's history that
  best supports an answer. Use the role id.
- Distribute across the candidate's history. No single role should be
  assigned more than 30 percent of the questions.

Return JSON:
{
  "questions": [
    {
      "text": string,
      "category": "universal" | "behavioral" | "role-specific" | "situational",
      "sourceRoleId": string,
      "competency": string   // "" if not applicable
    }
  ]
}`,
  };
}

/* ================================================================== *
 * 6.3 Answer generation
 * ================================================================== */

export const ANSWER_GEN_SYSTEM = `You write interview answers in the candidate's own voice, then mark every
invented detail so the candidate can correct it.

Your answers must contain specific, concrete details: durations, counts,
sequences, the name of the thing that broke, the number that changed. You
do not have access to the candidate's real specifics, so you invent
plausible ones. This is intentional. A specific wrong guess triggers the
candidate's real memory; a vague answer does not.

Rules for invention:
- Invent at a scale plausible for the role's seniority, sector, and era.
- Prefer inventing durations, counts, sequences, and mechanisms over
  precise dollar figures.
- Never invent credentials, degrees, certifications, employment dates,
  job titles, or employers.
- Never invent conduct, quotes, or failures attributed to a named third
  party. The candidate's own actions and outcomes only.

You return only valid JSON.`;

export const REGENERATION_SYSTEM = `${ANSWER_GEN_SYSTEM}

You are revising an answer the candidate has partially corrected. Some
facts are now confirmed by the candidate and must be preserved exactly.
Do not alter, rephrase, or drop a locked fact.`;

function roleBlock(role: Role): string {
  return `Employer: ${role.employer}
Title: ${role.title}
Dates: ${role.startDate} to ${role.endDate ?? 'present'}
Bullets:
${
  role.bullets.filter((b) => b.trim()).length
    ? role.bullets
        .filter((b) => b.trim())
        .map((b) => `- ${b}`)
        .join('\n')
    : '- (none listed on the resume)'
}`;
}

function voiceBlock(style?: StyleProfile): string {
  const verbosity = style?.verbosity ?? 'standard';
  const lines = [
    style?.writingSample?.trim()
      ? `Match the cadence of this writing sample:\n${style.writingSample.trim()}`
      : 'Plain, declarative, conversational.',
    `Length: ${VERBOSITY_LENGTH[verbosity]}`,
  ];
  if (style?.avoid?.trim()) lines.push(`Never include: ${style.avoid.trim()}`);
  return lines.join('\n');
}

const ANSWER_INSTRUCTIONS = `Produce three things.

1. SHORT ANSWER — the version the candidate says out loud. Target the
   length above. Plain declarative sentences. Must end on a result or
   outcome, not on process. Must contain 2 to 5 invented specifics.

2. LONG ANSWER — 5 to 8 sentences. The material underneath. Not a script.

3. COACHING NOTE — exactly two sentences. The first names the specific
   mechanism that makes this answer land (a particular detail, a
   structural choice). The second is a delivery instruction or a warning.
   Write like an interview coach who just heard the candidate attempt it
   once. Do not write generic advice. Never write "be confident," "use
   the STAR method," or "practice this."

   Good examples of the register:
   "The 'two calls and repeat your story' detail is what makes this a
   diagnosis rather than a vague process story. This is where people
   trail off before the result, so say the last clause deliberately."

   "Both halves in one breath, no pause before the admission. Volunteering
   it reads as confidence; having it dug out of you reads as a gap."

Return the answers as segment arrays. Split the text so that every
invented specific is its own token segment and everything else is text.
Token text should be the minimum span that carries the invented claim —
"seven weeks to under four", not the whole sentence.

Return JSON:
{
  "shortAnswer": [
    {"kind":"text","text":"..."} |
    {"kind":"token","text":"...","category":"duration|count|metric|money|date|outcome|artifact|mechanism"}
  ],
  "longAnswer": [ same shape ],
  "coachingNote": string
}`;

export function answerGenPrompt(args: {
  question: Question;
  role: Role;
  jobDescription?: string;
  styleProfile?: StyleProfile;
}): Prompt {
  const { question, role, jobDescription, styleProfile } = args;
  return {
    system: ANSWER_GEN_SYSTEM,
    user: `Write an answer to this interview question.

QUESTION: ${question.text}

DRAW FROM THIS ROLE:
${roleBlock(role)}

TARGET ROLE CONTEXT:
${jobDescription?.trim() ? jobDescription.trim().slice(0, 2000) : 'None provided'}

VOICE:
${voiceBlock(styleProfile)}

${ANSWER_INSTRUCTIONS}`,
  };
}

/* ================================================================== *
 * 6.4 Regeneration after correction
 * ================================================================== */

export function regenerationPrompt(args: {
  question: Question;
  role: Role;
  currentShortAnswer: Segment[];
  lockedFacts: TokenSegment[];
  userNote: string;
  jobDescription?: string;
  styleProfile?: StyleProfile;
  missingFacts?: string[];
}): Prompt {
  const {
    question,
    role,
    currentShortAnswer,
    lockedFacts,
    userNote,
    jobDescription,
    styleProfile,
    missingFacts,
  } = args;

  const locked = lockedFacts.length
    ? lockedFacts.map((t) => `- ${t.text}`).join('\n')
    : '(none)';

  const retryNote = missingFacts?.length
    ? `\n\nYour previous attempt dropped these locked facts. They must appear verbatim:\n${missingFacts
        .map((f) => `- ${f}`)
        .join('\n')}`
    : '';

  return {
    system: REGENERATION_SYSTEM,
    user: `Revise this answer.

QUESTION: ${question.text}

ROLE MATERIAL:
${roleBlock(role)}

TARGET ROLE CONTEXT:
${jobDescription?.trim() ? jobDescription.trim().slice(0, 2000) : 'None provided'}

VOICE:
${voiceBlock(styleProfile)}

CURRENT ANSWER:
${segmentsToText(currentShortAnswer)}

LOCKED FACTS — reproduce each of these verbatim in the revised answer:
${locked}

THE CANDIDATE SAYS:
${userNote}

Rewrite the short answer and long answer incorporating what the candidate
said. Preserve every locked fact word for word. Any remaining specifics
you invent are new and must be returned as token segments. Update the
coaching note only if the mechanism changed.

Return the same JSON shape as before.${retryNote}`,
  };
}
