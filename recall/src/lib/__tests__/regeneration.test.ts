import { beforeEach, describe, expect, it, vi } from 'vitest';

const callLLM = vi.fn();
vi.mock('@/llm/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm/client')>();
  return { ...actual, callLLM: (...args: unknown[]) => callLLM(...args) };
});

import { regenerateAnswer } from '../operations';
import { uniqueTokens } from '../segments';
import type { Question, Role, Segment } from '@/types';

const role: Role = {
  id: 'r1',
  employer: 'Northline',
  title: 'Program Operations Lead',
  startDate: '2021',
  endDate: null,
  bullets: ['Rebuilt the subaward approval workflow'],
};

const confirmed: Segment = {
  kind: 'token',
  id: 't1',
  text: 'six weeks',
  originalText: 'seven weeks',
  state: 'edited',
  category: 'duration',
  userNote: 'It was six.',
};

const question: Question = {
  id: 'q1',
  text: 'Tell me about a process you fixed.',
  category: 'behavioral',
  sourceRoleId: 'r1',
  shortAnswer: [{ kind: 'text', text: 'I cut it to ' }, confirmed, { kind: 'text', text: '.' }],
  longAnswer: [],
  coachingNote: 'note. note.',
  versions: [],
  drillHistory: [],
  generatedAt: 1,
};

beforeEach(() => callLLM.mockReset());

describe('regenerateAnswer', () => {
  it('retries once when the model drops a locked fact, then succeeds', async () => {
    callLLM
      .mockResolvedValueOnce({
        shortAnswer: [{ kind: 'text', text: 'A vaguer answer with nothing specific.' }],
        longAnswer: [{ kind: 'text', text: 'x' }],
        coachingNote: 'a. b.',
      })
      .mockResolvedValueOnce({
        shortAnswer: [
          { kind: 'text', text: 'I cut it to ' },
          { kind: 'token', text: 'six weeks', category: 'duration' },
          { kind: 'text', text: '.' },
        ],
        longAnswer: [{ kind: 'text', text: 'x' }],
        coachingNote: 'a. b.',
      });

    const merged = await regenerateAnswer({ question, role, userNote: 'note' });

    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(merged.missingFacts).toEqual([]);
    const restored = uniqueTokens(merged.shortAnswer)[0];
    expect(restored).toMatchObject({
      id: 't1',
      state: 'edited',
      originalText: 'seven weeks',
      userNote: 'It was six.',
    });

    // The retry restated the missing fact.
    const secondPrompt = callLLM.mock.calls[1][0] as { user: string };
    expect(secondPrompt.user).toContain('Your previous attempt dropped these locked facts');
    expect(secondPrompt.user).toContain('- six weeks');
  });

  it('reports the loss after a second failure so the user can discard', async () => {
    const vague = {
      shortAnswer: [{ kind: 'text', text: 'Still vague.' }],
      longAnswer: [{ kind: 'text', text: 'x' }],
      coachingNote: 'a. b.',
    };
    callLLM.mockResolvedValue(vague);

    const merged = await regenerateAnswer({ question, role, userNote: 'note' });

    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(merged.missingFacts).toEqual(['six weeks']);
  });

  it('does not lock a token that is being deleted', async () => {
    callLLM.mockResolvedValue({
      shortAnswer: [{ kind: 'text', text: 'I cut the chain down substantially.' }],
      longAnswer: [{ kind: 'text', text: 'x' }],
      coachingNote: 'a. b.',
    });

    const merged = await regenerateAnswer({
      question,
      role,
      userNote: 'Remove the claim about six weeks entirely.',
      excludeTokenId: 't1',
    });

    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(merged.missingFacts).toEqual([]);
    expect(uniqueTokens(merged.shortAnswer)).toHaveLength(0);

    const prompt = callLLM.mock.calls[0][0] as { user: string };
    expect(prompt.user).toContain('LOCKED FACTS — reproduce each of these verbatim');
    expect(prompt.user).toContain('(none)');
  });
});
