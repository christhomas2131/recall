import { uniqueTokens } from './segments';
import type { DrillAttempt, Project, Question } from '@/types';

/** How long before a question comes back around, by how it went. */
export const DRILL_INTERVAL_MS: Record<DrillAttempt['rating'], number> = {
  redo: 2 * 60 * 1000,
  rough: 20 * 60 * 1000,
  nailed: 24 * 60 * 60 * 1000,
};

export const SLOW_SECONDS = 60;
export const VERY_SLOW_SECONDS = 90;

export function isFullyVerified(question: Question): boolean {
  return uniqueTokens(question.shortAnswer, question.longAnswer).every(
    (t) => t.state !== 'unverified',
  );
}

/**
 * Standard mode locks drilling on a question until its details are resolved
 * (Section 2). Fast mode drills anything that has an answer.
 */
export function isDrillable(project: Project, question: Question): boolean {
  if (question.generatedAt === null) return false;
  if (project.mode === 'fast') return true;
  return isFullyVerified(question);
}

export function lastAttempt(question: Question): DrillAttempt | undefined {
  return question.drillHistory[question.drillHistory.length - 1];
}

/** Timestamp at which a question is due again. Never drilled means due now. */
export function dueAt(question: Question): number {
  const last = lastAttempt(question);
  if (!last) return 0;
  return last.at + DRILL_INTERVAL_MS[last.rating];
}

/** Eligible questions, soonest-due first. Never-drilled ones lead. */
export function drillQueue(project: Project): Question[] {
  return project.questions
    .filter((q) => isDrillable(project, q))
    .map((q) => ({ q, due: dueAt(q) }))
    .sort((a, b) => {
      if (a.due !== b.due) return a.due - b.due;
      return a.q.drillHistory.length - b.q.drillHistory.length;
    })
    .map(({ q }) => q);
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
