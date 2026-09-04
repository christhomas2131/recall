import { describe, expect, it } from 'vitest';
import { mergeRegeneration } from '../merge';
import { segmentsToText, uniqueTokens } from '../segments';
import type { AnswerGenResponse } from '@/llm/schemas';
import type { TokenSegment } from '@/types';

const locked = (
  id: string,
  text: string,
  state: TokenSegment['state'] = 'confirmed',
): TokenSegment => ({
  kind: 'token',
  id,
  text,
  originalText: `${text} (first guess)`,
  state,
  category: 'duration',
  userNote: 'the candidate said so',
});

const response = (short: AnswerGenResponse['shortAnswer']): AnswerGenResponse => ({
  shortAnswer: short,
  longAnswer: [{ kind: 'text', text: 'Background.' }],
  coachingNote: 'A note. Another sentence.',
});

describe('mergeRegeneration', () => {
  it('restores id, state, original and note for a reproduced locked fact', () => {
    const fact = locked('tok-1', 'six weeks');
    const merged = mergeRegeneration(
      response([
        { kind: 'text', text: 'We cut it to ' },
        { kind: 'token', text: 'six weeks', category: 'duration' },
        { kind: 'text', text: '.' },
      ]),
      [fact],
    );

    const tokens = uniqueTokens(merged.shortAnswer);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].id).toBe('tok-1');
    expect(tokens[0].state).toBe('confirmed');
    expect(tokens[0].originalText).toBe('six weeks (first guess)');
    expect(tokens[0].userNote).toBe('the candidate said so');
    expect(merged.missingFacts).toEqual([]);
  });

  it('marks anything newly invented as unverified with a fresh id', () => {
    const fact = locked('tok-1', 'six weeks');
    const merged = mergeRegeneration(
      response([
        { kind: 'text', text: 'We cut it to ' },
        { kind: 'token', text: 'six weeks', category: 'duration' },
        { kind: 'text', text: ' across ' },
        { kind: 'token', text: 'four teams', category: 'count' },
        { kind: 'text', text: '.' },
      ]),
      [fact],
    );

    const fresh = uniqueTokens(merged.shortAnswer).filter((t) => t.id !== 'tok-1');
    expect(fresh).toHaveLength(1);
    expect(fresh[0].state).toBe('unverified');
    expect(fresh[0].originalText).toBe('four teams');
    expect(segmentsToText(merged.shortAnswer)).toBe('We cut it to six weeks across four teams.');
  });

  it('reports a locked fact the model dropped', () => {
    const merged = mergeRegeneration(
      response([{ kind: 'text', text: 'A vaguer answer with no specifics.' }]),
      [locked('tok-1', 'six weeks'), locked('tok-2', 'the finance handoff', 'edited')],
    );
    expect(merged.missingFacts).toEqual(['six weeks', 'the finance handoff']);
  });

  it('does not reuse one locked fact for two identical spans', () => {
    const merged = mergeRegeneration(
      response([
        { kind: 'token', text: 'six weeks', category: 'duration' },
        { kind: 'text', text: ' then ' },
        { kind: 'token', text: 'six weeks', category: 'duration' },
        { kind: 'text', text: ' again.' },
      ]),
      [locked('tok-1', 'six weeks')],
    );
    const ids = merged.shortAnswer
      .filter((s) => s.kind === 'token')
      .map((s) => (s.kind === 'token' ? s.id : ''));
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain('tok-1');
  });
});

describe('locked facts survive spacing repair', () => {
  it('restores a confirmed token whose neighbour needed a space inserted', async () => {
    const { hydrateSegments, repairSpacing } = await import('../segments');

    // The first draft came back with the following word glued to the token.
    const drafted = repairSpacing(
      hydrateSegments([
        { kind: 'token', text: 'six weeks', category: 'duration' },
        { kind: 'text', text: 'later it shipped.' },
      ]),
    );
    const confirmed = uniqueTokens(drafted).map((t) => ({ ...t, state: 'confirmed' as const }));

    const merged = mergeRegeneration(
      response([
        { kind: 'token', text: 'six weeks', category: 'duration' },
        { kind: 'text', text: ' later it shipped, under budget.' },
      ]),
      confirmed,
    );

    expect(merged.missingFacts).toEqual([]);
    expect(uniqueTokens(merged.shortAnswer)[0].state).toBe('confirmed');
    expect(uniqueTokens(merged.shortAnswer)[0].id).toBe(confirmed[0].id);
  });
});
