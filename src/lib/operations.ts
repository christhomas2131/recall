import { nanoid } from 'nanoid';
import { callLLM, LLMError } from '@/llm/client';
import {
  answerGenPrompt,
  questionGenPrompt,
  regenerationPrompt,
  resumeParsePrompt,
} from '@/llm/prompts';
import { AnswerGenSchema, QuestionGenSchema, ResumeParseSchema } from '@/llm/schemas';
import { answerContractViolations, unsupportedResumeClaims } from '@/llm/evals';
import { detectGaps } from './gaps';
import { enforceDistribution } from './distribution';
import {
  hydrateSegments,
  linkDuplicateTokens,
  repairSpacing,
  spacingLooksBroken,
  tokensOf,
} from './segments';
import { mergeRegeneration, type MergeResult } from './merge';
import type {
  ParsedResume,
  Project,
  Question,
  Role,
  Segment,
  StyleProfile,
} from '@/types';

// SPEC-GAP: Section 8's file list has no home for orchestration that spans
// llm/ and lib/. It lives here so routes stay presentational.

export const MAX_ROLES_FOR_QUESTIONS = 8;

/* ------------------------------------------------------------------ *
 * Resume
 * ------------------------------------------------------------------ */

export async function parseResume(rawText: string): Promise<ParsedResume> {
  const prompt = resumeParsePrompt(rawText);
  let data = await callLLM(prompt, ResumeParseSchema, {
    maxTokens: 8192,
  });
  let unsupported = unsupportedResumeClaims(rawText, data);
  if (unsupported.length) {
    data = await callLLM(
      {
        system: prompt.system,
        user: `${prompt.user}\n\nYour previous parse introduced unsupported text in these fields:\n${unsupported
          .slice(0, 8)
          .map((issue) => `- ${issue}`)
          .join('\n')}\nCopy values verbatim from the resume or leave them empty.`,
      },
      ResumeParseSchema,
      { maxTokens: 8192 },
    );
    unsupported = unsupportedResumeClaims(rawText, data);
  }
  if (unsupported.length) {
    throw new LLMError(
      'schema',
      'The resume parse introduced details that were not in the source.',
      unsupported.slice(0, 8).join('; '),
    );
  }

  const roles: Role[] = data.roles.map((r) => ({
    id: nanoid(),
    employer: r.employer,
    title: r.title,
    startDate: r.startDate,
    endDate: r.endDate.trim() === '' ? null : r.endDate,
    bullets: r.bullets,
    location: r.location || undefined,
  }));

  return {
    rawText,
    roles,
    education: data.education,
    skills: data.skills,
    gaps: detectGaps(roles),
  };
}

/* ------------------------------------------------------------------ *
 * Questions
 * ------------------------------------------------------------------ */

/** Section 9: no JD means 10 questions instead of 15. */
export function questionCountFor(jobDescription?: string): number {
  return jobDescription?.trim() ? 15 : 10;
}

export async function generateQuestions(project: Project): Promise<Question[]> {
  const allRoles = project.resume.roles;
  const roles = allRoles.slice(0, MAX_ROLES_FOR_QUESTIONS);
  const eligibleIds = new Set(roles.map((r) => r.id));
  const gaps = project.resume.gaps.filter((g) => eligibleIds.has(g.afterRoleId));
  const n = questionCountFor(project.jobDescription);

  const data = await callLLM(
    questionGenPrompt({ n, roles, jobDescription: project.jobDescription, gaps }),
    QuestionGenSchema,
    { maxTokens: 8192 },
  );

  const fallbackRoleId = roles[0]?.id ?? '';
  let raw = data.questions.map((q) => ({
    text: q.text,
    category: q.category,
    sourceRoleId: eligibleIds.has(q.sourceRoleId) ? q.sourceRoleId : fallbackRoleId,
    competency: q.competency || undefined,
  }));

  // Section 9: with no job description there is nothing to probe against, so
  // role-specific questions are dropped. SPEC-GAP: situational questions are
  // kept when a gap exists, since Section 6.2 asks for one in that case
  // whether or not a description was supplied.
  if (!project.jobDescription?.trim()) {
    raw = raw.filter(
      (q) =>
        q.category !== 'role-specific' &&
        (q.category !== 'situational' || gaps.length > 0),
    );
  }

  const distributed = enforceDistribution(raw, roles);

  return distributed.map((q) => ({
    id: nanoid(),
    text: q.text,
    category: q.category,
    sourceRoleId: q.sourceRoleId,
    competency: q.competency,
    shortAnswer: [],
    longAnswer: [],
    coachingNote: '',
    versions: [],
    drillHistory: [],
    generatedAt: null,
  }));
}

/* ------------------------------------------------------------------ *
 * Answers
 * ------------------------------------------------------------------ */

export interface GeneratedAnswer {
  shortAnswer: Segment[];
  longAnswer: Segment[];
  coachingNote: string;
  /** True when the model produced no tokens even after the retry. */
  noDetails: boolean;
}

function finalize(raw: Segment[]): Segment[] {
  const repaired = repairSpacing(raw);
  return repaired;
}

export async function generateAnswer(args: {
  question: Question;
  role: Role;
  jobDescription?: string;
  styleProfile?: StyleProfile;
}): Promise<GeneratedAnswer> {
  const prompt = answerGenPrompt(args);

  let data = await callLLM(prompt, AnswerGenSchema, { maxTokens: 4096 });
  let short = finalize(hydrateSegments(data.shortAnswer));
  let long = linkDuplicateTokens(short, finalize(hydrateSegments(data.longAnswer)));

  const needsRetry =
    answerContractViolations(data).length > 0 || spacingLooksBroken(short) || spacingLooksBroken(long);

  if (needsRetry) {
    const reasons = [
      ...answerContractViolations(data),
      spacingLooksBroken(short) || spacingLooksBroken(long)
        ? 'Concatenating the segment text values must produce readable prose with normal spacing.'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    data = await callLLM(
      { system: prompt.system, user: `${prompt.user}\n\n${reasons}` },
      AnswerGenSchema,
      { maxTokens: 4096 },
    );
    short = finalize(hydrateSegments(data.shortAnswer));
    long = linkDuplicateTokens(short, finalize(hydrateSegments(data.longAnswer)));
  }

  return {
    shortAnswer: short,
    longAnswer: long,
    coachingNote: data.coachingNote,
    noDetails: tokensOf(short).length === 0,
  };
}

/* ------------------------------------------------------------------ *
 * Regeneration (6.4)
 * ------------------------------------------------------------------ */

export async function regenerateAnswer(args: {
  question: Question;
  role: Role;
  userNote: string;
  jobDescription?: string;
  styleProfile?: StyleProfile;
  /** Token being deleted: it must not be locked back into the rewrite. */
  excludeTokenId?: string;
}): Promise<MergeResult> {
  const { question, role, userNote, jobDescription, styleProfile, excludeTokenId } = args;

  const lockedFacts = tokensOf(question.shortAnswer).filter(
    (t) =>
      t.id !== excludeTokenId && (t.state === 'confirmed' || t.state === 'edited'),
  );

  const base = {
    question,
    role,
    currentShortAnswer: question.shortAnswer,
    lockedFacts,
    userNote,
    jobDescription,
    styleProfile,
  };

  let data = await callLLM(regenerationPrompt(base), AnswerGenSchema, { maxTokens: 4096 });
  let merged = mergeRegeneration(data, lockedFacts);

  if (merged.missingFacts.length) {
    data = await callLLM(
      regenerationPrompt({ ...base, missingFacts: merged.missingFacts }),
      AnswerGenSchema,
      { maxTokens: 4096 },
    );
    merged = mergeRegeneration(data, lockedFacts);
  }

  return merged;
}

/* ------------------------------------------------------------------ *
 * Batch generation (Fast mode)
 * ------------------------------------------------------------------ */

export async function generateAnswersInBatch(args: {
  project: Project;
  questionIds: string[];
  concurrency?: number;
  onAnswer: (questionId: string, answer: GeneratedAnswer) => void;
  onError: (questionId: string, error: unknown) => void;
  shouldStop?: () => boolean;
}) {
  const { project, questionIds, onAnswer, onError, shouldStop } = args;
  const concurrency = args.concurrency ?? 3;
  const queue = [...questionIds];

  const worker = async () => {
    while (queue.length) {
      if (shouldStop?.()) return;
      const id = queue.shift();
      if (!id) return;
      const question = project.questions.find((q) => q.id === id);
      const role = project.resume.roles.find((r) => r.id === question?.sourceRoleId);
      if (!question || !role) continue;
      try {
        const answer = await generateAnswer({
          question,
          role,
          jobDescription: project.jobDescription,
          styleProfile: project.styleProfile,
        });
        onAnswer(id, answer);
      } catch (e) {
        onError(id, e);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}
