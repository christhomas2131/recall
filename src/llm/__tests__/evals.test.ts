import { describe, expect, it } from 'vitest';
import { GROUNDING_FIXTURES, VALID_ANSWER } from '@/fixtures/evals';
import { answerContractViolations, unsupportedResumeClaims } from '../evals';

describe('prompt-output regression gates', () => {
  for (const fixture of GROUNDING_FIXTURES) {
    it(`accepts grounded fields for ${fixture.name}`, () => {
      expect(unsupportedResumeClaims(fixture.resume, fixture.valid)).toEqual([]);
    });

    it(`rejects fabricated fields for ${fixture.name}`, () => {
      const issues = unsupportedResumeClaims(fixture.resume, fixture.fabricated);
      expect(issues.length).toBeGreaterThanOrEqual(3);
      expect(issues.join(' ')).toMatch(/title|location|bullets|education|skills/);
    });
  }

  it('accepts a properly tokenized answer contract', () => {
    expect(answerContractViolations(VALID_ANSWER)).toEqual([]);
  });

  it('catches unmarked numbers, missing tokens, and malformed coaching notes', () => {
    const broken = {
      ...VALID_ANSWER,
      shortAnswer: [{ kind: 'text' as const, text: 'I supervised 14 people for 3 years.' }],
      coachingNote: 'Generic advice only.',
    };
    expect(answerContractViolations(broken)).toEqual([
      'Short answer must contain 2 to 5 token segments; received 0.',
      'Short answer contains unmarked numeric specifics: 14, 3.',
      'Coaching note must contain exactly two sentences; received 1.',
    ]);
  });
});
