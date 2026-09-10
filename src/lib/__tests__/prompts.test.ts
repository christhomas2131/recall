import { describe, expect, it } from 'vitest';
import { answerGenPrompt, questionGenPrompt, regenerationPrompt } from '@/llm/prompts';
import type { Question, Role, StyleProfile, TokenSegment } from '@/types';

const role: Role = {
  id: 'r1',
  employer: 'Northline',
  title: 'Program Operations Lead',
  startDate: 'March 2021',
  endDate: null,
  bullets: ['Ran grants operations across 53 partner organizations'],
};

const question: Question = {
  id: 'q1',
  text: 'Tell me about a process you fixed.',
  category: 'behavioral',
  sourceRoleId: 'r1',
  shortAnswer: [],
  longAnswer: [],
  coachingNote: '',
  versions: [],
  drillHistory: [],
  generatedAt: null,
};

describe('style profile reaches the prompt', () => {
  it('translates verbosity into a sentence target', () => {
    const lengths: Record<StyleProfile['verbosity'], string> = {
      terse: '2-3 sentences',
      standard: '4-5 sentences',
      expansive: '6-8 sentences',
    };
    for (const [verbosity, expected] of Object.entries(lengths)) {
      const prompt = answerGenPrompt({
        question,
        role,
        styleProfile: { verbosity: verbosity as StyleProfile['verbosity'] },
      });
      expect(prompt.user).toContain(`Length: ${expected}`);
    }
  });

  it('carries the writing sample and the avoid list', () => {
    const prompt = answerGenPrompt({
      question,
      role,
      styleProfile: {
        verbosity: 'terse',
        writingSample: 'Short sentences. No throat clearing.',
        avoid: 'synergy',
      },
    });
    expect(prompt.user).toContain('Match the cadence of this writing sample:');
    expect(prompt.user).toContain('Short sentences. No throat clearing.');
    expect(prompt.user).toContain('Never include: synergy');
  });

  it('falls back to plain and declarative with no profile', () => {
    const prompt = answerGenPrompt({ question, role });
    expect(prompt.user).toContain('Plain, declarative, conversational.');
    expect(prompt.user).toContain('Length: 4-5 sentences');
  });
});

describe('regeneration prompt', () => {
  const locked: TokenSegment = {
    kind: 'token',
    id: 't1',
    text: 'six weeks',
    originalText: 'seven weeks',
    state: 'edited',
    category: 'duration',
  };

  it('lists locked facts and the candidate note', () => {
    const prompt = regenerationPrompt({
      question,
      role,
      currentShortAnswer: [{ kind: 'text', text: 'The old answer.' }],
      lockedFacts: [locked],
      userNote: 'It was the finance handoff.',
    });
    expect(prompt.user).toContain('LOCKED FACTS');
    expect(prompt.user).toContain('- six weeks');
    expect(prompt.user).toContain('It was the finance handoff.');
    expect(prompt.system).toContain('must be preserved exactly');
  });

  it('restates dropped facts on the retry', () => {
    const prompt = regenerationPrompt({
      question,
      role,
      currentShortAnswer: [],
      lockedFacts: [locked],
      userNote: 'note',
      missingFacts: ['six weeks'],
    });
    expect(prompt.user).toContain('Your previous attempt dropped these locked facts');
  });
});

describe('question generation prompt', () => {
  it('states the count, the roles, and the no-JD fallback', () => {
    const prompt = questionGenPrompt({ n: 10, roles: [role], gaps: [] });
    expect(prompt.user).toContain('Generate 10 interview questions');
    expect(prompt.user).toContain('r1 | Northline | Program Operations Lead');
    expect(prompt.user).toContain('None provided.');
    expect(prompt.user).toContain('EMPLOYMENT GAPS DETECTED:\nNone');
  });
});
