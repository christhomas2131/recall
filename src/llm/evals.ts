import type { AnswerGenResponse, ResumeParseResponse } from './schemas';

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[•*–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Finds resume-parser claims that cannot be traced to the uploaded text. */
export function unsupportedResumeClaims(
  rawText: string,
  parsed: ResumeParseResponse,
): string[] {
  const source = normalize(rawText);
  const claims: { path: string; value: string }[] = [];
  parsed.roles.forEach((role, roleIndex) => {
    for (const field of ['employer', 'title', 'startDate', 'endDate', 'location'] as const) {
      claims.push({ path: `roles.${roleIndex}.${field}`, value: role[field] });
    }
    role.bullets.forEach((value, bulletIndex) => {
      claims.push({ path: `roles.${roleIndex}.bullets.${bulletIndex}`, value });
    });
  });
  parsed.education.forEach((value, index) => claims.push({ path: `education.${index}`, value }));
  parsed.skills.forEach((value, index) => claims.push({ path: `skills.${index}`, value }));

  return claims
    .filter(({ value }) => value.trim() && !source.includes(normalize(value)))
    .map(({ path, value }) => `${path}: ${value}`);
}

function sentenceCount(value: string): number {
  return value.split(/[.!?]+(?:\s+|$)/).filter((part) => part.trim()).length;
}

/** Deterministic checks for the answer-generation contract. */
export function answerContractViolations(answer: AnswerGenResponse): string[] {
  const violations: string[] = [];
  const shortTokens = answer.shortAnswer.filter((segment) => segment.kind === 'token');
  if (shortTokens.length < 2 || shortTokens.length > 5) {
    violations.push(`Short answer must contain 2 to 5 token segments; received ${shortTokens.length}.`);
  }

  const unmarkedNumeric = answer.shortAnswer
    .filter((segment) => segment.kind === 'text')
    .map((segment) => segment.text)
    .join(' ')
    .match(/(?:[$£€]\s*\d|\b\d+(?:[.,]\d+)?%?\b)/g);
  if (unmarkedNumeric?.length) {
    violations.push(`Short answer contains unmarked numeric specifics: ${unmarkedNumeric.join(', ')}.`);
  }
  const coachingSentences = sentenceCount(answer.coachingNote);
  if (coachingSentences !== 2) {
    violations.push(`Coaching note must contain exactly two sentences; received ${coachingSentences}.`);
  }
  return violations;
}
